const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const createAuthRoutes = require('./src/routes/authRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const userRoutes = require('./src/routes/userRoutes');
const createInvitationRoutes = require('./src/routes/invitationRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const pushNotificationRoutes = require('./src/routes/pushNotificationRoutes');
const { csrfProtection } = require('./src/middleware/csrfMiddleware');
const { notFound, errorHandler, requestId } = require('./src/middleware/errorMiddleware');

function createApp({ frontendDist: configuredFrontendDist, invitationRateLimits, authRateLimits, trustProxyHops = 0 } = {}) {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error('trustProxyHops must be an integer between 0 and 10');
  }
  app.set('trust proxy', trustProxyHops || false);
  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.use(cors({
    origin: isProduction ? false : (process.env.CLIENT_URL || 'http://localhost:5173'),
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Critical Matters Response' });
  });
  // Registration is intentionally invitation-only; keep the retired endpoint unambiguously absent.
  app.all('/api/auth/register', notFound);
  // Invitation admin routes apply protect -> adminOnly -> CSRF internally.
  app.use('/api/invitations', createInvitationRoutes(invitationRateLimits));
  app.use('/api', csrfProtection);
  app.use('/api/auth', createAuthRoutes(authRateLimits));
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/notifications', pushNotificationRoutes);

  if (isProduction) {
    const frontendDist = configuredFrontendDist || path.join(__dirname, 'frontend', 'dist');
    app.use(express.static(frontendDist));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return res.sendFile('index.html', { root: frontendDist });
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
