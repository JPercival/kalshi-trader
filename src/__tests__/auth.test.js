import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import passport from 'passport';
import { requireAuth, configurePassport, setupAuth, handleLogout, handleOAuthCallback } from '../auth.js';

describe('requireAuth', () => {
  it('passes through when skipAuth is true', () => {
    const middleware = requireAuth({ skipAuth: true });
    const req = {};
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'dev', email: 'dev@localhost', displayName: 'Dev User' });
  });

  it('preserves existing user when skipAuth is true', () => {
    const middleware = requireAuth({ skipAuth: true });
    const existingUser = { id: '123', email: 'test@test.com', displayName: 'Test' };
    const req = { user: existingUser };
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.user).toBe(existingUser);
  });

  it('passes through when user is authenticated', () => {
    const middleware = requireAuth({ skipAuth: false });
    const req = { isAuthenticated: () => true, path: '/' };
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('redirects to /login for unauthenticated page requests', () => {
    const middleware = requireAuth({ skipAuth: false });
    const req = { isAuthenticated: () => false, path: '/portfolio' };
    const redirect = vi.fn();
    const res = { redirect };
    const next = vi.fn();

    middleware(req, res, next);

    expect(redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 JSON for unauthenticated API requests', () => {
    const middleware = requireAuth({ skipAuth: false });
    const req = { isAuthenticated: () => false, path: '/api/stats' };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };
    const next = vi.fn();

    middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('handles missing isAuthenticated method', () => {
    const middleware = requireAuth({ skipAuth: false });
    const req = { path: '/dashboard' };
    const redirect = vi.fn();
    const res = { redirect };
    const next = vi.fn();

    middleware(req, res, next);

    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe('configurePassport', () => {
  it('does not register strategy when credentials are missing', () => {
    // Should not throw
    expect(() => {
      configurePassport({ googleClientId: '', googleClientSecret: '', allowedEmails: [] });
    }).not.toThrow();
  });

  it('serializes and deserializes user via passport', () => {
    // configurePassport calls passport.serializeUser and passport.deserializeUser
    // We need to invoke those callbacks to get coverage
    configurePassport({ googleClientId: '', googleClientSecret: '', allowedEmails: [] });

    // Get the serializer/deserializer from passport
    // Passport stores them internally — we can test by calling passport._serializers and _deserializers
    const serializers = passport._serializers;
    const deserializers = passport._deserializers;

    expect(serializers.length).toBeGreaterThan(0);
    expect(deserializers.length).toBeGreaterThan(0);

    // Test serialize
    const serializeDone = vi.fn();
    serializers[serializers.length - 1]({ id: '1', email: 'a@b.com' }, serializeDone);
    expect(serializeDone).toHaveBeenCalledWith(null, { id: '1', email: 'a@b.com' });

    // Test deserialize
    const deserializeDone = vi.fn();
    deserializers[deserializers.length - 1]({ id: '1', email: 'a@b.com' }, deserializeDone);
    expect(deserializeDone).toHaveBeenCalledWith(null, { id: '1', email: 'a@b.com' });
  });

  it('registers Google strategy when credentials are provided', () => {
    expect(() => {
      configurePassport({
        googleClientId: 'test-id',
        googleClientSecret: 'test-secret',
        allowedEmails: ['test@test.com'],
        callbackURL: '/auth/google/callback',
      });
    }).not.toThrow();
  });

  it('uses default callbackURL when not provided', () => {
    expect(() => {
      configurePassport({
        googleClientId: 'test-id-2',
        googleClientSecret: 'test-secret-2',
        allowedEmails: [],
        // no callbackURL — should default to '/auth/google/callback'
      });
    }).not.toThrow();
  });
});

describe('setupAuth integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.set('view engine', 'ejs');
    app.set('views', new URL('../../views', import.meta.url).pathname);
  });

  describe('with SKIP_AUTH=true', () => {
    beforeEach(() => {
      const config = {
        skipAuth: true,
        sessionSecret: 'test-secret',
        googleClientId: '',
        googleClientSecret: '',
        allowedEmails: [],
      };
      setupAuth(app, config);

      // Add a protected test route after auth
      app.get('/test-protected', (req, res) => {
        res.json({ user: req.user });
      });
    });

    it('GET /api/health returns ok without auth', async () => {
      const res = await supertest(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeGreaterThan(0);
    });

    it('GET /login redirects to / when skipAuth', async () => {
      const res = await supertest(app).get('/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
    });

    it('GET /logout calls req.logout and redirects to /login', async () => {
      const res = await supertest(app).get('/logout');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    it('protected routes get dev user', async () => {
      const res = await supertest(app).get('/test-protected');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('dev@localhost');
    });
  });

  describe('with SKIP_AUTH=false (no Google credentials)', () => {
    beforeEach(() => {
      const config = {
        skipAuth: false,
        sessionSecret: 'test-secret',
        googleClientId: '',
        googleClientSecret: '',
        allowedEmails: ['test@example.com'],
      };
      setupAuth(app, config);

      app.get('/test-protected', (req, res) => {
        res.json({ ok: true });
      });

      app.get('/api/test', (req, res) => {
        res.json({ ok: true });
      });
    });

    it('GET /api/health still works without auth', async () => {
      const res = await supertest(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /login renders login page', async () => {
      const res = await supertest(app).get('/login');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Sign in with Google');
    });

    it('GET /login shows error message', async () => {
      const res = await supertest(app).get('/login?error=auth_failed');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Authentication failed');
    });

    it('GET /login shows custom error message', async () => {
      const res = await supertest(app).get('/login?error=custom_error');
      expect(res.status).toBe(200);
      expect(res.text).toContain('custom_error');
    });

    it('protected page route redirects to /login', async () => {
      const res = await supertest(app).get('/test-protected');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    it('protected API route returns 401', async () => {
      const res = await supertest(app).get('/api/test');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('GET /logout redirects to /login', async () => {
      const res = await supertest(app).get('/logout');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });
  });
});

describe('handleOAuthCallback', () => {
  it('redirects to /', () => {
    const redirect = vi.fn();
    handleOAuthCallback({}, { redirect });
    expect(redirect).toHaveBeenCalledWith('/');
  });
});

describe('handleLogout', () => {
  it('calls req.logout and redirects on success', () => {
    const redirect = vi.fn();
    const req = {
      logout: vi.fn((cb) => cb(null)),
    };
    const res = { redirect };

    handleLogout(req, res);

    expect(req.logout).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('handles logout error and still redirects', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const redirect = vi.fn();
    const req = {
      logout: vi.fn((cb) => cb(new Error('session destroy failed'))),
    };
    const res = { redirect };

    handleLogout(req, res);

    expect(redirect).toHaveBeenCalledWith('/login');
    expect(console.error).toHaveBeenCalledWith('[auth] Logout error:', expect.any(Error));
    vi.restoreAllMocks();
  });

  it('redirects when req.logout does not exist', () => {
    const redirect = vi.fn();
    const req = {};
    const res = { redirect };

    handleLogout(req, res);

    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe('Google OAuth strategy verify callback', () => {
  it('registers strategy and verify callback handles profiles', () => {
    let verifyFn = null;
    const useSpy = vi.spyOn(passport, 'use').mockImplementation((strategy) => {
      // GoogleStrategy stores the verify function as _verify
      if (strategy._verify) {
        verifyFn = strategy._verify;
      }
    });

    configurePassport({
      googleClientId: 'test-id',
      googleClientSecret: 'test-secret',
      allowedEmails: ['allowed@test.com'],
      callbackURL: '/auth/google/callback',
    });

    expect(verifyFn).not.toBeNull();

    // Test: profile with no email
    const done1 = vi.fn();
    verifyFn('token', 'refresh', { emails: null }, done1);
    expect(done1).toHaveBeenCalledWith(null, false, { message: 'No email in Google profile' });

    // Test: profile with empty emails array
    const done1b = vi.fn();
    verifyFn('token', 'refresh', { emails: [] }, done1b);
    expect(done1b).toHaveBeenCalledWith(null, false, { message: 'No email in Google profile' });

    // Test: unauthorized email
    const done2 = vi.fn();
    verifyFn('token', 'refresh', {
      id: '123',
      displayName: 'Test',
      emails: [{ value: 'notallowed@test.com' }],
      photos: [{ value: 'photo.jpg' }],
    }, done2);
    expect(done2).toHaveBeenCalledWith(null, false, { message: 'Email not authorized' });

    // Test: authorized email
    const done3 = vi.fn();
    verifyFn('token', 'refresh', {
      id: '123',
      displayName: 'Allowed User',
      emails: [{ value: 'allowed@test.com' }],
      photos: [{ value: 'photo.jpg' }],
    }, done3);
    expect(done3).toHaveBeenCalledWith(null, {
      id: '123',
      email: 'allowed@test.com',
      displayName: 'Allowed User',
      photo: 'photo.jpg',
    });

    // Test: authorized email with no photos
    const done4 = vi.fn();
    verifyFn('token', 'refresh', {
      id: '456',
      displayName: 'No Photo',
      emails: [{ value: 'allowed@test.com' }],
      photos: null,
    }, done4);
    expect(done4).toHaveBeenCalledWith(null, {
      id: '456',
      email: 'allowed@test.com',
      displayName: 'No Photo',
      photo: null,
    });

    useSpy.mockRestore();
  });

  it('allows all emails when allowedEmails is empty', () => {
    let verifyFn = null;
    const useSpy = vi.spyOn(passport, 'use').mockImplementation((strategy) => {
      if (strategy._verify) {
        verifyFn = strategy._verify;
      }
    });

    configurePassport({
      googleClientId: 'test-id',
      googleClientSecret: 'test-secret',
      allowedEmails: [],
      callbackURL: '/auth/google/callback',
    });

    const done = vi.fn();
    verifyFn('token', 'refresh', {
      id: '789',
      displayName: 'Anyone',
      emails: [{ value: 'anyone@anywhere.com' }],
      photos: [],
    }, done);
    expect(done).toHaveBeenCalledWith(null, {
      id: '789',
      email: 'anyone@anywhere.com',
      displayName: 'Anyone',
      photo: undefined,
    });

    useSpy.mockRestore();
  });
});
