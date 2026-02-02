/**
 * Authentication module.
 * Google OAuth 2.0 via passport.js with session-based auth.
 * Supports AUTH_BYPASS=true for local development.
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';

/**
 * Configure passport with Google OAuth strategy.
 * @param {object} config
 * @param {string} config.googleClientId
 * @param {string} config.googleClientSecret
 * @param {string[]} config.allowedEmails
 * @param {string} [config.callbackURL] - Override callback URL (for testing)
 */
export function configurePassport(config) {
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  if (config.googleClientId && config.googleClientSecret) {
    passport.use(new GoogleStrategy(
      {
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        callbackURL: config.callbackURL || '/auth/google/callback',
      },
      (accessToken, refreshToken, profile, done) => {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        if (!email) {
          return done(null, false, { message: 'No email in Google profile' });
        }

        if (config.allowedEmails.length > 0 && !config.allowedEmails.includes(email)) {
          return done(null, false, { message: 'Email not authorized' });
        }

        const user = {
          id: profile.id,
          email,
          displayName: profile.displayName,
          photo: profile.photos && profile.photos[0] && profile.photos[0].value,
        };

        return done(null, user);
      },
    ));
  }
}

/**
 * Middleware that requires authentication.
 * If AUTH_BYPASS is true, sets a fake dev user and passes through.
 * Otherwise, checks for an authenticated session.
 * @param {object} config
 * @param {boolean} config.skipAuth
 * @returns {import('express').RequestHandler}
 */
export function requireAuth(config) {
  return (req, res, next) => {
    if (config.skipAuth) {
      req.user = req.user || { id: 'dev', email: 'dev@localhost', displayName: 'Dev User' };
      return next();
    }

    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }

    // Differentiate between API and page requests
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.redirect('/login');
  };
}

/**
 * Express handler for OAuth callback success.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function handleOAuthCallback(req, res) {
  res.redirect('/');
}

/**
 * Express handler for /logout.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function handleLogout(req, res) {
  if (req.logout) {
    req.logout((err) => {
      if (err) {
        console.error('[auth] Logout error:', err);
      }
      res.redirect('/login');
    });
  } else {
    res.redirect('/login');
  }
}

/**
 * Set up auth-related middleware and routes on an Express app.
 * @param {import('express').Express} app
 * @param {object} config
 */
export function setupAuth(app, config) {
  // Session middleware
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));

  // Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport strategies
  configurePassport(config);

  // --- Public routes (no auth required) ---

  /** Health check endpoint (for Railway / monitoring) */
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  /** Login page */
  app.get('/login', (req, res) => {
    if (config.skipAuth) {
      return res.redirect('/');
    }
    res.render('login', { error: req.query.error || null });
  });

  /** Initiate Google OAuth */
  app.get('/auth/google', (req, res, next) => {
    if (!config.googleClientId || !config.googleClientSecret) {
      return res.redirect('/login?error=oauth_not_configured');
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });

  /** Google OAuth callback */
  app.get('/auth/google/callback', (req, res, next) => {
    if (!config.googleClientId || !config.googleClientSecret) {
      return res.redirect('/login?error=oauth_not_configured');
    }
    passport.authenticate('google', { failureRedirect: '/login?error=auth_failed' })(req, res, () => {
      handleOAuthCallback(req, res);
    });
  });

  /** Logout */
  app.get('/logout', handleLogout);

  // --- Apply auth to all subsequent routes ---
  app.use(requireAuth(config));
}
