const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./src/routes/authRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const userRoutes = require('./src/routes/userRoutes');
const { csrfProtection } = require('./src/middleware/csrfMiddleware');
const { notFound, errorHandler } = require('./src/middleware/errorMiddleware');

function createApp({ frontendDist: configuredFrontendDist } = {}) {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.use(cors({
    origin: isProduction ? false : (process.env.CLIENT_URL || 'http://localhost:5173'),
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Critical Matters Response' });
  });
  app.use('/api', csrfProtection);
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);

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
