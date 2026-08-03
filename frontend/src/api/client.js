let csrfToken;
let csrfRequest;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function errorDetails(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  if (data.error && typeof data.error === 'object' && !Array.isArray(data.error)) {
    return { code: data.code || data.error.code, message: data.message || data.error.message };
  }
  return { code: data.code, message: data.message };
}

export function isCsrfInvalidError(data) {
  return errorDetails(data).code === 'CSRF_INVALID';
}

function toError(response, data) {
  const { code, message } = errorDetails(data);
  const error = new Error(message || 'Something went wrong. Please try again.');
  error.status = response.status;
  error.code = code;
  return error;
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
  if (csrfRequest) await csrfRequest;
  if (!force && csrfToken) return csrfToken;

  csrfRequest = refreshCsrfToken();
  try {
    return await csrfRequest;
  } finally {
    csrfRequest = undefined;
  }
}

async function send(path, options, token) {
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

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const requiresCsrf = !SAFE_METHODS.has(method) && path !== '/auth/csrf';
  let token = requiresCsrf ? await getCsrfToken() : undefined;
  let { response, data } = await send(path, options, token);

  if (!response.ok && requiresCsrf && isCsrfInvalidError(data)) {
    token = await getCsrfToken({ force: true });
    ({ response, data } = await send(path, options, token));
  }

  if (!response.ok) throw toError(response, data);
  return data;
}

export function queryString(params = {}) {
  const values = Object.entries(params).filter(([, value]) => value !== '' && value != null);
  return values.length ? `?${new URLSearchParams(values)}` : '';
}
