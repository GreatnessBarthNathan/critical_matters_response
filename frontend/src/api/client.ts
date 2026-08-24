export interface ApiErrorDetails {
  status?: number;
  code?: string;
  message?: string;
  fields?: Record<string, unknown>;
  requestId?: string;
}

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown>;
};

let csrfToken: string | undefined;
let csrfRequest: Promise<string> | undefined;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, unknown>;
  requestId?: string;

  constructor({ status = 0, code, message, fields, requestId }: ApiErrorDetails) {
    super(message || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'UNKNOWN_ERROR';
    this.fields = fields || {};
    this.requestId = requestId;
  }

  /** True when retrying the same request could plausibly succeed, so forms keep their values. */
  get retryable() {
    return this.status >= 500 || this.status === 429 || this.code === 'CSRF_INVALID';
  }

  get sessionExpired() {
    return this.status === 401;
  }
}

// The API answers with { error: { code, message, fields, requestId } }.
function errorDetails(data: unknown): ApiErrorDetails {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const envelope = data.error && typeof data.error === 'object' && !Array.isArray(data.error) ? data.error : data;
  return {
    code: envelope.code,
    message: envelope.message,
    fields: envelope.fields,
    requestId: envelope.requestId,
  };
}

export function isCsrfInvalidError(data: unknown): boolean {
  return errorDetails(data).code === 'CSRF_INVALID';
}

function toError(response: Response, data: unknown): ApiError {
  return new ApiError({ status: response.status, ...errorDetails(data) });
}

async function refreshCsrfToken() {
  const response = await fetch('/api/auth/csrf', { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.csrfToken) throw toError(response, data);
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function getCsrfToken({ force = false } = {}) {
  if (!force && csrfToken) return csrfToken;
  if (csrfRequest) await csrfRequest.catch(() => undefined);
  if (!force && csrfToken) return csrfToken;

  csrfRequest = refreshCsrfToken();
  try {
    return await csrfRequest;
  } finally {
    csrfRequest = undefined;
  }
}

/** Called by AuthProvider on start and after every authentication change. */
export async function bootstrapCsrf() {
  try {
    return await getCsrfToken({ force: true });
  } catch {
    return undefined;
  }
}

export function clearCsrfToken() {
  csrfToken = undefined;
}

async function send(path: string, options: ApiRequestOptions, token?: string) {
  const { headers: optionHeaders, body, ...requestOptions } = options;
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...optionHeaders,
      ...(token && { 'X-CSRF-Token': token }),
    },
    body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function api<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const requiresCsrf = !SAFE_METHODS.has(method) && path !== '/auth/csrf';
  let token = requiresCsrf ? await getCsrfToken() : undefined;
  let { response, data } = await send(path, options, token);

  // A rotated or missing CSRF cookie is recoverable exactly once, transparently.
  if (!response.ok && requiresCsrf && isCsrfInvalidError(data)) {
    token = await getCsrfToken({ force: true });
    ({ response, data } = await send(path, options, token));
  }

  if (!response.ok) throw toError(response, data);
  return data;
}

export function queryString(params: Record<string, unknown> = {}): string {
  const values = Object.entries(params).filter(([, value]) => value !== '' && value != null);
  return values.length ? `?${new URLSearchParams(values)}` : '';
}
