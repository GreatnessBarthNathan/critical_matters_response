function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(error, _req, res, _next) {
  let status = error.status || (res.statusCode >= 400 ? res.statusCode : 500);
  let message = error.message || 'An unexpected error occurred.';

  if (error.code === 'INVALID_INVITATION') {
    return res.status(error.status || 400).json({ code: 'INVALID_INVITATION', message: 'INVALID_INVITATION' });
  }
  if (error.code === 'INVALID_RECOVERY') {
    return res.status(error.status || 400).json({ code: 'INVALID_RECOVERY', message: 'INVALID_RECOVERY' });
  }
  if (error.code === 'INVALID_TOTP') {
    return res.status(error.status || 401).json({ code: 'INVALID_TOTP', message: 'Two-factor verification failed. Please sign in again.' });
  }
  if (error.code === 'PASTOR_TOTP_REQUIRED') {
    return res.status(error.status || 403).json({ code: 'PASTOR_TOTP_REQUIRED', message: 'Pastor two-factor authentication setup is required.' });
  }
  if (error.code === 'INVITATION_CONFLICT' || error.code === 'INVITATION_INACTIVE') {
    return res.status(error.status || 409).json({ code: error.code, message: error.message });
  }

  if (error.name === 'ValidationError') {
    status = 400;
    message = Object.values(error.errors).map((item) => item.message).join(' ');
  }
  if (error.code === 11000) {
    status = 409;
    message = error.keyPattern?.email ? 'An account with this email already exists.' : 'This record already exists.';
  }
  if (error.name === 'CastError') {
    status = 404;
    message = 'The requested record was not found.';
  }

  if (process.env.NODE_ENV !== 'test') console.error(error);
  res.status(status).json({ message, ...(process.env.NODE_ENV === 'development' && { stack: error.stack }) });
}

module.exports = { notFound, errorHandler };
