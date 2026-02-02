---
id: KAL-21
title: Google OAuth authentication
status: In Progress
assignee:
  - '@ros'
created_date: '2026-02-02 18:45'
updated_date: '2026-02-02 18:45'
labels:
  - auth
  - web
dependencies:
  - KAL-15
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Google OAuth 2.0 to protect the dashboard. Use passport.js + passport-google-oauth20. Session-based auth with express-session. Whitelist allowed Google email(s) via ALLOWED_EMAILS env var. Add SKIP_AUTH=true env var to bypass in local dev. All dashboard routes and API endpoints require auth. Login page at /login, callback at /auth/google/callback, logout at /logout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Google OAuth login flow works (login → Google consent → redirect back)
- [ ] #2 Only emails in ALLOWED_EMAILS can access the dashboard
- [ ] #3 Unauthenticated requests to dashboard/API routes redirect to /login
- [ ] #4 SKIP_AUTH=true bypasses all auth checks for local dev
- [ ] #5 /api/health remains unauthenticated (for Railway health checks)
- [ ] #6 100% test coverage on auth middleware and routes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Install deps: passport, passport-google-oauth20, express-session
2. Add auth config vars to config.js
3. Create src/auth.js with passport setup, middleware, routes
4. Wire auth into server.js — protect dashboard + API routes, keep /api/health open
5. Create views/login.ejs
6. Write comprehensive tests with mocked passport strategies
7. Verify 100% coverage
<!-- SECTION:PLAN:END -->
