const crypto = require('crypto');

const REQUEST_ID_HEADER = 'X-Request-Id';

// Neutral, caller-safe messages for codes that must never confirm whether a record exists.
const NEUTRAL_MESSAGES = {
  INVALID_CREDENTIALS: 'The email or password is incorrect.',
  INVALID_INVITATION: 'This invitation link is not valid.',
  INVALID_RECOVERY: 'That recovery code is not valid.',
  INVALID_TOTP: 'Two-factor verification failed. Please sign in again.',
};

const STABLE_CODE = /^[A-Z][A-Z0-9_]*$/;

function newRequestId() {
  return crypto.randomBytes(12).toString('base64url');
}

// Attach an opaque correlation id to every request so production errors stay traceable in logs.
function requestId(req, res, next) {
  req.id = newRequestId();
  res.setHeader(REQUEST_ID_HEADER, req.id);
  next();
}

function errorBody(req, { code, message, fields = {} }) {
  return {
    error: {
      code,
      message: NEUTRAL_MESSAGES[code] || message,
      fields,
      requestId: req?.id || newRequestId(),
    },
  };
}

function sendError(req, res, status, payload) {
  return res.status(status).json(errorBody(req, payload));
}

function notFound(req, res) {
  return sendError(req, res, 404, {
    code: 'NOT_FOUND',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

function resolve(error, res) {
  const status = error.status || (res.statusCode >= 400 ? res.statusCode : 500);

  if (typeof error.code === 'string' && STABLE_CODE.test(error.code)) {
    return { status, code: error.code, message: error.message };
  }
  if (error.name === 'ValidationError') {
    const fields = Object.fromEntries(
      Object.entries(error.errors || {}).map(([field, item]) => [field, item.message]),
    );
    return { status: 400, code: 'VALIDATION_FAILED', message: 'Some values need attention.', fields };
  }
  if (error.code === 11000) {
    return {
      status: 409,
      code: 'CONFLICT',
      message: error.keyPattern?.email ? 'An account with this email already exists.' : 'This record already exists.',
    };
  }
  if (error.name === 'CastError') {
    return { status: 404, code: 'NOT_FOUND', message: 'The requested record was not found.' };
  }
  if (status === 401) return { status, code: 'UNAUTHENTICATED', message: error.message };
  if (status === 403) return { status, code: 'FORBIDDEN', message: error.message };
  if (status === 400) return { status, code: 'VALIDATION_FAILED', message: error.message };
  if (status === 404) return { status, code: 'NOT_FOUND', message: error.message };

  return { status, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
}

function errorHandler(error, req, res, _next) {
  const resolved = resolve(error, res);

  // Stack traces stay in the server log only; responses never carry them in any environment.
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${req?.id || 'no-request-id'}] ${resolved.code}`, error);
  }
  return sendError(req, res, resolved.status, resolved);
}

module.exports = { notFound, errorHandler, requestId, sendError, REQUEST_ID_HEADER };
