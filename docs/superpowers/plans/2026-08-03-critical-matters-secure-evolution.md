# Critical Matters Secure Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing CMR prototype into the approved invitation-only, audited, mobile-first TGN pastoral-care release without changing its single-deployment React/Express/MongoDB architecture.

**Architecture:** Keep Express as the production API/static server and React/Vite as the browser client. Move security and report business rules from controllers into focused services, persist invitations and metadata-only audit events in dedicated MongoDB collections, and embed report responses/revisions inside their owning report. Build every API capability behind integration tests, then replace the current green pastoral theme with a mobile-first TGN design system using the actual public TGN logo asset.

**Tech Stack:** Node.js 20+, Express 5, MongoDB/Mongoose 8, React 19, Vite 7, React Router, JWT HTTP-only cookies, bcrypt, otplib TOTP, AES-256-GCM, Node test runner, Supertest, mongodb-memory-server, ESLint.

---

## File structure map

### Backend files to create

- `app.js` — constructs the Express application without connecting or listening.
- `src/config/env.js` — validates production environment and returns typed configuration.
- `src/models/Invitation.js` — expiring, hashed, one-time invitation records.
- `src/models/AuditEvent.js` — immutable, metadata-only security events.
- `src/services/auditService.js` — redacts and appends audit events.
- `src/services/invitationService.js` — invitation lifecycle and atomic redemption.
- `src/services/authService.js` — login, password, TOTP, recovery and session revocation rules.
- `src/services/reportService.js` — ownership, lifecycle, response and revision rules.
- `src/utils/crypto.js` — token hashing and AES-GCM secret encryption.
- `src/utils/totp.js` — authenticator setup and verification.
- `src/middleware/csrfMiddleware.js` — signed double-submit CSRF protection.
- `src/controllers/invitationController.js` — invitation HTTP handlers.
- `src/controllers/auditController.js` — pastor audit-list handler.
- `src/routes/invitationRoutes.js` — pastor invitation and public redemption routes.
- `src/routes/auditRoutes.js` — pastor-only audit routes.
- `test/helpers/testApp.js` — isolated MongoDB/app lifecycle for integration tests.
- `test/health.test.js` — application construction and health checks.
- `test/invitations.test.js` — invitation creation, expiry, revocation and replay.
- `test/auth-security.test.js` — login, CSRF, TOTP, recovery and session revocation.
- `test/reports.test.js` — lifecycle, revisions, archive and response behavior.
- `test/authorization.test.js` — complete leader/pastor privacy matrix.
- `test/audit.test.js` — required events and sensitive-content redaction.

### Backend files to modify

- `server.js` — validate environment, connect MongoDB, seed pastor, then listen using `app.js`.
- `package.json` — add test scripts and security/test dependencies.
- `.env.example` — document CSRF, encryption and invitation settings.
- `src/models/User.js` — recovery-code array, session version and encrypted TOTP state.
- `src/models/Report.js` — approved statuses, revisions and participant read state.
- `src/controllers/authController.js` — delegate to auth/invitation services.
- `src/controllers/reportController.js` — delegate to report service.
- `src/controllers/userController.js` — pastor-assisted recovery and account session revocation.
- `src/middleware/authMiddleware.js` — verify session version and TOTP completion.
- `src/middleware/errorMiddleware.js` — stable error codes and production request IDs.
- `src/routes/authRoutes.js`, `src/routes/reportRoutes.js`, `src/routes/userRoutes.js` — expose approved endpoints.

### Frontend files to create

- `frontend/public/tgn-logo.svg` — exact copy of `../TGN/tgn-web-app/public/logo.svg`.
- `frontend/src/design/tokens.css` — TGN colors, typography, spacing and component tokens.
- `frontend/src/components/MobileNav.jsx` — role-specific bottom navigation.
- `frontend/src/components/ReportCard.jsx` — phone-first report summary.
- `frontend/src/components/StepIndicator.jsx` — accessible report/onboarding progress.
- `frontend/src/pages/InvitationPage.jsx` — invitation redemption and recovery-code handoff.
- `frontend/src/pages/TwoFactorPage.jsx` — sign-in verification.
- `frontend/src/pages/InvitationsPage.jsx` — pastor invitation management.
- `frontend/src/pages/SecurityPage.jsx` — TOTP, recovery, reset and audit views.
- `frontend/src/pages/ArchivedReportsPage.jsx` — read-only archive.
- `frontend/src/utils/reportStatus.js` — shared labels, colors and allowed UI actions.

### Frontend files to modify

- `frontend/index.html` — Sora/Poppins font loading and TGN theme metadata.
- `frontend/src/App.jsx` — invitation, TOTP, archive and pastor routes.
- `frontend/src/context/AuthContext.jsx` — CSRF bootstrap and pending-TOTP session state.
- `frontend/src/api/client.js` — CSRF header, stable API errors and session-expiry handling.
- `frontend/src/components/Brand.jsx` — actual TGN logo and CMR wordmark.
- `frontend/src/components/AuthLayout.jsx` — discreet sign-in shell without public registration.
- `frontend/src/components/DashboardLayout.jsx` — mobile bottom nav and responsive desktop sidebar.
- `frontend/src/pages/LoginPage.jsx` — no public signup and TOTP continuation.
- `frontend/src/pages/RegisterPage.jsx` — remove public route; onboarding moves to InvitationPage.
- `frontend/src/pages/ForgotPasswordPage.jsx` — recovery-code and pastor-code paths.
- `frontend/src/pages/DashboardPage.jsx` — operational mobile-first leader/pastor summaries.
- `frontend/src/pages/CreateReportPage.jsx` — three-step mobile report flow.
- `frontend/src/pages/ReportsPage.jsx` — cards on phones, table enhancement on desktop.
- `frontend/src/pages/ReportDetailPage.jsx` — approved lifecycle and revision drawer.
- `frontend/src/pages/ProfilePage.jsx` — optional leader TOTP and recovery management.
- `frontend/src/pages/UsersPage.jsx` — pastor reset-code and session-revocation actions.
- `frontend/src/styles.css` — retain only layout/page styles that consume the new tokens.
- `README.md` — invitation, TOTP, secrets, pilot and deployment instructions.

## Task 1: Testable application boundary and environment validation

**Files:**
- Create: `app.js`
- Create: `src/config/env.js`
- Create: `test/helpers/testApp.js`
- Create: `test/health.test.js`
- Modify: `server.js`
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install test and security dependencies**

Run:

```bash
npm install otplib@12.0.1 qrcode@1.5.4
npm install --save-dev supertest@7.1.4 mongodb-memory-server@10.2.0
```

Expected: root `package.json` contains the four packages and `npm audit --omit=dev` completes without an actionable runtime advisory.

- [ ] **Step 2: Add the failing health test**

Create `test/health.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../app');

test('GET /api/health returns service readiness', async () => {
  const response = await request(createApp()).get('/api/health').expect(200);
  assert.deepEqual(response.body, {
    status: 'ok',
    service: 'Critical Matters Response',
  });
});
```

Add to root `package.json`:

```json
"test": "node --test --test-concurrency=1 test/*.test.js"
```

- [ ] **Step 3: Run the test and verify the missing app boundary**

Run: `npm test -- --test-name-pattern='service readiness'`

Expected: FAIL with `Cannot find module '../app'`.

- [ ] **Step 4: Extract Express construction and validate environment**

Create `app.js` exporting `createApp()`. Move middleware and route registration out of `server.js`; keep database connection, pastor seeding and `listen()` in `server.js`.

Create `src/config/env.js` with this public interface:

```js
function getConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const required = ['MONGODB_URI', 'JWT_SECRET'];
  if (production) required.push('CSRF_SECRET', 'TOTP_ENCRYPTION_KEY');
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing required environment values: ${missing.join(', ')}`);
  if (production && Buffer.from(env.TOTP_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return { production, port: Number(env.PORT || 5000), mongodbUri: env.MONGODB_URI };
}

module.exports = { getConfig };
```

Document `CSRF_SECRET`, `TOTP_ENCRYPTION_KEY`, `INVITATION_TTL_DAYS=7`, and `ASSISTED_RESET_TTL_MINUTES=15` in `.env.example`.

- [ ] **Step 5: Verify application construction**

Run: `npm test -- --test-name-pattern='service readiness'`

Expected: PASS.

- [ ] **Step 6: Commit the boundary**

```bash
git add app.js server.js src/config/env.js test/health.test.js package.json package-lock.json .env.example
git commit -m "test: add isolated application harness"
```

## Task 2: Security primitives, session revocation and audit storage

**Files:**
- Create: `src/models/AuditEvent.js`
- Create: `src/services/auditService.js`
- Create: `src/utils/crypto.js`
- Create: `src/utils/totp.js`
- Create: `src/middleware/csrfMiddleware.js`
- Create: `test/auth-security.test.js`
- Create: `test/audit.test.js`
- Modify: `src/models/User.js`
- Modify: `src/utils/authToken.js`
- Modify: `src/middleware/authMiddleware.js`
- Modify: `app.js`

- [ ] **Step 1: Write failing tests for session revocation, CSRF and redaction**

Use the test helper to assert:

```js
test('rejects a state-changing request without matching CSRF values', async () => {
  await request(app).post('/api/auth/logout').expect(403);
});

test('revoked session version is rejected', async () => {
  user.sessionVersion += 1;
  await user.save();
  await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
});

test('audit metadata never stores sensitive fields', async () => {
  await auditService.record({
    action: 'report.view',
    targetType: 'report',
    targetId: report.id,
    metadata: { title: 'secret', content: 'private', ip: '127.0.0.1' },
  });
  const event = await AuditEvent.findOne();
  assert.equal(event.metadata.ip, '127.0.0.1');
  assert.equal(event.metadata.title, undefined);
  assert.equal(event.metadata.content, undefined);
});
```

- [ ] **Step 2: Run the focused tests**

Run: `npm test -- --test-name-pattern='CSRF|revoked session|audit metadata'`

Expected: FAIL because the model fields, middleware and audit service do not exist.

- [ ] **Step 3: Implement security utilities**

`src/utils/crypto.js` must export:

```js
module.exports = {
  hashToken,
  safeEqual,
  encryptSecret,
  decryptSecret,
};
```

Use SHA-256 for random token lookup hashes, `crypto.timingSafeEqual` for comparisons, and AES-256-GCM with a fresh 12-byte IV for TOTP secret encryption. Store ciphertext as `iv.authTag.ciphertext`, all base64url encoded.

`src/utils/totp.js` must export `createTotpSetup(email)`, `verifyTotp(secret, token)`, and `toQrDataUrl(otpauthUrl)` using issuer `Critical Matters Response`.

- [ ] **Step 4: Add security state to users and JWTs**

Add these fields to `User`:

```js
sessionVersion: { type: Number, default: 0 },
recoveryCodeHashes: { type: [String], default: [], select: false },
totp: {
  enabled: { type: Boolean, default: false },
  encryptedSecret: { type: String, default: '', select: false },
},
assistedReset: {
  tokenHash: { type: String, default: '', select: false },
  expiresAt: Date,
},
```

Include `sessionVersion` as `sv` in JWT payloads and reject tokens whose `sv` differs from the current user.

- [ ] **Step 5: Implement signed double-submit CSRF**

`GET /api/auth/csrf` sets readable cookie `cmr_csrf` to `random.signature`, where signature is an HMAC-SHA256 of the random value using `CSRF_SECRET`, and returns the same value in `{ csrfToken }`. For `POST`, `PATCH`, `PUT`, and `DELETE`, compare the cookie to `X-CSRF-Token` and verify the signature before routing. Exempt only invitation inspection and login endpoints that do not rely on an existing authenticated cookie.

- [ ] **Step 6: Implement immutable audit events**

`AuditEvent` stores actor, actorRole, action, targetType, targetId, result, metadata and timestamp. Reject document updates in schema middleware. `auditService.record()` accepts only metadata keys `ip`, `userAgent`, `requestId`, `reason`, and `changedFields`.

- [ ] **Step 7: Run security tests and commit**

Run: `npm test -- --test-name-pattern='CSRF|revoked session|audit metadata'`

Expected: PASS.

```bash
git add src/models/User.js src/models/AuditEvent.js src/services/auditService.js src/utils/crypto.js src/utils/totp.js src/utils/authToken.js src/middleware/authMiddleware.js src/middleware/csrfMiddleware.js app.js test
git commit -m "feat: add security primitives and audit storage"
```

## Task 3: Invitation-only onboarding

**Files:**
- Create: `src/models/Invitation.js`
- Create: `src/services/invitationService.js`
- Create: `src/controllers/invitationController.js`
- Create: `src/routes/invitationRoutes.js`
- Create: `test/invitations.test.js`
- Modify: `app.js`
- Modify: `src/routes/authRoutes.js`
- Modify: `src/controllers/authController.js`

- [ ] **Step 1: Write invitation lifecycle tests**

Cover these exact outcomes:

```js
await pastorApi.post('/api/invitations').send({ email: 'leader@example.com' }).expect(201);
await anonymousApi.post('/api/invitations').send({ email: 'x@example.com' }).expect(401);
await leaderApi.post('/api/invitations').send({ email: 'x@example.com' }).expect(403);
await anonymousApi.post('/api/auth/register').send(publicPayload).expect(404);
await redeem(invitationToken, invitedEmail).expect(201);
await redeem(invitationToken, invitedEmail).expect(400); // replay
await redeem(expiredToken, invitedEmail).expect(400);
await redeem(revokedToken, invitedEmail).expect(400);
await redeem(validToken, 'different@example.com').expect(400);
```

- [ ] **Step 2: Run tests and confirm public registration still exists**

Run: `npm test -- --test-name-pattern='invitation|public registration'`

Expected: FAIL because invitation endpoints are missing and `/api/auth/register` still accepts public registration.

- [ ] **Step 3: Implement the invitation model and service**

The service interface is:

```js
createInvitation({ email, pastor, ip, userAgent })
listInvitations()
revokeInvitation({ invitationId, pastor })
inspectInvitation(plainToken)
redeemInvitation({ plainToken, firstName, lastName, password })
```

Hash tokens before storage, enforce a seven-day expiry, revoke prior active invitations for the same email, and redeem using a Mongoose transaction so account creation and invitation consumption succeed together.

- [ ] **Step 4: Expose routes and remove public registration**

Routes:

```text
GET    /api/invitations/:token          public neutral inspection
POST   /api/invitations/:token/redeem   public redemption
GET    /api/invitations                 pastor only
POST   /api/invitations                 pastor only
DELETE /api/invitations/:id             pastor only
```

Remove `POST /api/auth/register`. Successful redemption returns the safe user, recovery codes shown once, and an authenticated session cookie.

- [ ] **Step 5: Verify invitation behavior and commit**

Run: `npm test -- --test-name-pattern='invitation|public registration'`

Expected: PASS.

```bash
git add src/models/Invitation.js src/services/invitationService.js src/controllers/invitationController.js src/routes/invitationRoutes.js src/routes/authRoutes.js src/controllers/authController.js app.js test/invitations.test.js
git commit -m "feat: require one-time leader invitations"
```

## Task 4: TOTP and no-email recovery workflows

**Files:**
- Create: `src/services/authService.js`
- Modify: `src/controllers/authController.js`
- Modify: `src/controllers/userController.js`
- Modify: `src/routes/authRoutes.js`
- Modify: `src/routes/userRoutes.js`
- Modify: `src/utils/seedPastor.js`
- Modify: `test/auth-security.test.js`

- [ ] **Step 1: Add failing TOTP and recovery tests**

Required cases:

```js
assert.equal(pastorLogin.body.requiresTotp, true);
await request(app).get('/api/reports').set('Cookie', pendingTotpCookie).expect(401);
await verifyTotp(validCode).expect(200);
await verifyTotp(invalidCode).expect(401);
await recoverWithCode(recoveryCodes[0]).expect(200);
await recoverWithCode(recoveryCodes[0]).expect(400); // single use
await pastorIssueReset(leader.id).expect(201);
await assistedReset(resetCode, 'NewSecurePassword!').expect(200);
await request(app).get('/api/auth/me').set('Cookie', preResetCookie).expect(401);
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --test-name-pattern='TOTP|recovery|assisted reset'`

Expected: FAIL because setup, verification and reset endpoints are absent.

- [ ] **Step 3: Implement auth service and routes**

Service methods:

```js
login({ email, password })
beginTotpSetup(user)
confirmTotpSetup(user, token)
verifyLoginTotp({ pendingToken, token })
regenerateRecoveryCodes(user)
recoverWithCode({ email, recoveryCode, newPassword })
issueAssistedReset({ leaderId, pastor })
completeAssistedReset({ email, resetCode, newPassword })
changePassword({ user, currentPassword, newPassword })
```

Pending-TOTP JWTs contain `{ sub, purpose: 'totp-login' }`, expire in five minutes and cannot access protected routes. Generate eight recovery codes, hash each separately and show plaintext only once.

- [ ] **Step 4: Require pastor TOTP**

Pastor bootstrap creates the account but marks onboarding incomplete until TOTP is confirmed. Protected pastor routes return `403 PASTOR_TOTP_REQUIRED` until setup completes. Leaders may enable TOTP voluntarily.

- [ ] **Step 5: Verify recovery and commit**

Run: `npm test -- --test-name-pattern='TOTP|recovery|assisted reset'`

Expected: PASS.

```bash
git add src/services/authService.js src/controllers/authController.js src/controllers/userController.js src/routes/authRoutes.js src/routes/userRoutes.js src/utils/seedPastor.js test/auth-security.test.js
git commit -m "feat: add TOTP and pastor-assisted recovery"
```

## Task 5: Report lifecycle, immutable revisions and conversations

**Files:**
- Create: `src/services/reportService.js`
- Create: `test/reports.test.js`
- Modify: `src/models/Report.js`
- Modify: `src/controllers/reportController.js`
- Modify: `src/routes/reportRoutes.js`

- [ ] **Step 1: Write failing lifecycle and revision tests**

Assert the exact state transitions:

```js
assert.equal(created.status, 'new');
assert.equal((await pastorOpen()).status, 'in_review');
assert.equal((await pastorRespond()).status, 'awaiting_leader');
assert.equal((await leaderRespond()).status, 'awaiting_pastor');
assert.equal((await pastorArchive()).status, 'archived');
await leaderEditArchived().expect(409);
await leaderRespondArchived().expect(409);
assert.equal((await pastorReopen()).status, 'in_review');
```

For editing, assert revision 1 stores only changed fields with old/new values and that an attempted update to `revisions.0` is rejected.

- [ ] **Step 2: Run report tests and verify old status behavior fails**

Run: `npm test -- --test-name-pattern='lifecycle|revision|archived'`

Expected: FAIL because current statuses are `submitted`, `responded`, and `closed` and no revisions exist.

- [ ] **Step 3: Implement approved report schema**

Use statuses `new`, `in_review`, `awaiting_pastor`, `awaiting_leader`, and `archived`. Add embedded revisions:

```js
{
  revisionNumber: Number,
  editor: ObjectId,
  changedFields: [{ field: String, previousValue: Mixed, nextValue: Mixed }],
  createdAt: Date,
}
```

Retain embedded responses and add read flags for both participants. Prevent revision mutation in `reportService`; controllers never accept `revisions` or `responses` as update fields.

- [ ] **Step 4: Implement report service rules**

Service interface:

```js
createReport({ user, input })
listReports({ user, filters, pagination })
getReport({ user, reportId, markRead })
editReport({ user, reportId, changes })
respond({ user, reportId, message })
transition({ pastor, reportId, status })
getStats(user)
```

Automatically move New to In review on pastor access. Apply priority sort weight urgent, important, normal before last activity on pastor queues.

- [ ] **Step 5: Verify lifecycle and commit**

Run: `npm test -- --test-name-pattern='lifecycle|revision|archived'`

Expected: PASS.

```bash
git add src/models/Report.js src/services/reportService.js src/controllers/reportController.js src/routes/reportRoutes.js test/reports.test.js
git commit -m "feat: add auditable report lifecycle"
```

## Task 6: Authorization matrix, audit routes and stable API errors

**Files:**
- Create: `src/controllers/auditController.js`
- Create: `src/routes/auditRoutes.js`
- Create: `test/authorization.test.js`
- Modify: `src/middleware/errorMiddleware.js`
- Modify: `app.js`
- Modify: `test/audit.test.js`

- [ ] **Step 1: Add the complete privacy matrix**

For report create, list, detail, edit, respond, transition, revision view and archive, assert:

```text
anonymous       401 for every operation
owning leader   allowed only for create/list/detail/edit/respond/revisions
other leader    404 for detail/edit/respond/revisions; never appears in list
pastor          allowed for list/detail/respond/transition/revisions; cannot edit original leader text
```

Also assert leaders receive `403` from invitation, audit and user-administration endpoints.

- [ ] **Step 2: Run matrix tests**

Run: `npm test -- --test-name-pattern='privacy matrix|audit route'`

Expected: FAIL until every service-level ownership rule and audit route is connected.

- [ ] **Step 3: Add audit list endpoint and stable errors**

Expose pastor-only `GET /api/audit` with action, actor, targetType, result, date and page filters. Return only safe metadata.

Error JSON format:

```json
{
  "error": {
    "code": "REPORT_ARCHIVED",
    "message": "This matter is archived and read-only.",
    "fields": {},
    "requestId": "opaque-id"
  }
}
```

Never return stack traces in production. Use neutral `INVALID_CREDENTIALS`, `INVALID_INVITATION`, and `INVALID_RECOVERY` codes.

- [ ] **Step 4: Verify all backend behavior**

Run: `npm test`

Expected: all tests PASS with zero skipped authorization cases.

- [ ] **Step 5: Commit the hardened API**

```bash
git add src/controllers/auditController.js src/routes/auditRoutes.js src/middleware/errorMiddleware.js app.js test
git commit -m "test: enforce privacy and audit boundaries"
```

## Task 7: TGN design system, discreet entry and invitation onboarding

**Files:**
- Create: `frontend/public/tgn-logo.svg`
- Create: `frontend/src/design/tokens.css`
- Create: `frontend/src/components/StepIndicator.jsx`
- Create: `frontend/src/pages/InvitationPage.jsx`
- Create: `frontend/src/pages/TwoFactorPage.jsx`
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/context/AuthContext.jsx`
- Modify: `frontend/src/components/Brand.jsx`
- Modify: `frontend/src/components/AuthLayout.jsx`
- Modify: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/src/pages/ForgotPasswordPage.jsx`

- [ ] **Step 1: Copy the approved TGN asset and define tokens**

Copy the exact bytes from `/Users/osazeeagbonze/Documents/TGN/tgn-web-app/public/logo.svg` to `frontend/public/tgn-logo.svg` and verify:

```bash
cmp frontend/public/tgn-logo.svg /Users/osazeeagbonze/Documents/TGN/tgn-web-app/public/logo.svg
```

Expected: exit code 0.

Define tokens including:

```css
:root {
  --tgn-navy: #0c0e1c;
  --tgn-blue: #1a80e6;
  --tgn-sky: #51a2ff;
  --tgn-surface: #f0f5ff;
  --tgn-card: #ffffff;
  --tgn-text: #0c0e1c;
  --tgn-muted: #66718a;
  --tgn-gradient: linear-gradient(101deg, var(--tgn-blue), var(--tgn-sky));
  --font-heading: 'Sora', sans-serif;
  --font-body: 'Poppins', sans-serif;
  --touch-target: 44px;
}
```

- [ ] **Step 2: Replace public landing/registration with discreet entry**

The root route redirects authenticated users to `/app` and unauthenticated users to `/login`. Remove `/register` from public routing. Login contains the TGN logo, CMR name, email, password and recovery link—no public signup or ministry details.

- [ ] **Step 3: Build invitation and TOTP routes**

Add `/invite/:token` with loading, invalid, form, recovery-code and completion states. Add `/verify-two-factor` that consumes only the pending TOTP login state. Recovery codes must require an explicit saved acknowledgement before dashboard navigation.

- [ ] **Step 4: Add CSRF-aware client behavior**

Fetch `/auth/csrf` when AuthProvider starts and after authentication changes. For mutations, attach `X-CSRF-Token`. Convert stable API errors to an `ApiError` containing `code`, `message`, `fields`, and `requestId`. Preserve form values after retryable failures.

- [ ] **Step 5: Lint, build and commit**

Run: `npm --prefix frontend run lint && npm --prefix frontend run build`

Expected: both commands pass; `frontend/dist/index.html` references generated assets.

```bash
git add frontend
git commit -m "feat: add TGN invitation and sign-in experience"
```

## Task 8: Mobile-first leader and pastor workspaces

**Files:**
- Create: `frontend/src/components/MobileNav.jsx`
- Create: `frontend/src/components/ReportCard.jsx`
- Create: `frontend/src/pages/InvitationsPage.jsx`
- Create: `frontend/src/pages/SecurityPage.jsx`
- Create: `frontend/src/pages/ArchivedReportsPage.jsx`
- Create: `frontend/src/utils/reportStatus.js`
- Modify: `frontend/src/components/DashboardLayout.jsx`
- Modify: `frontend/src/pages/DashboardPage.jsx`
- Modify: `frontend/src/pages/CreateReportPage.jsx`
- Modify: `frontend/src/pages/ReportsPage.jsx`
- Modify: `frontend/src/pages/ReportDetailPage.jsx`
- Modify: `frontend/src/pages/ProfilePage.jsx`
- Modify: `frontend/src/pages/UsersPage.jsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Implement the mobile navigation contract**

Leader tabs are Home, Reports, Create and Profile. Pastor tabs are Overview, Reports, Invitations, Security and Profile. Each target is at least 44px, indicates the current route with icon plus text, respects the safe-area inset, and disappears at the desktop-sidebar breakpoint.

- [ ] **Step 2: Convert dashboard and report lists to phone-first cards**

At widths below 768px, show two high-value statistics (Open and New replies), the create action, priority-aware report cards and no horizontal tables. At desktop widths, enhance the same data into the operational table selected during brainstorming.

Use the status mapping:

```js
export const reportStatus = {
  new: { label: 'New', tone: 'blue' },
  in_review: { label: 'In review', tone: 'gold' },
  awaiting_pastor: { label: 'Awaiting pastor', tone: 'purple' },
  awaiting_leader: { label: 'Pastor responded', tone: 'blue' },
  archived: { label: 'Archived', tone: 'neutral' },
};
```

- [ ] **Step 3: Convert report creation into three steps**

Step 1 captures subject, category and priority. Step 2 captures message. Step 3 captures sensitivity, emergency disclaimer acknowledgement for urgent priority and final review. Back preserves values; refresh restores an unsent draft from `sessionStorage`; successful submission clears it.

- [ ] **Step 4: Add revision and archive interfaces**

Report detail shows status, conversation and a revision-history drawer. Archived reports hide edit/reply controls and show a read-only explanation. Pastor view adds Archive/Reopen and allowed status actions.

- [ ] **Step 5: Add full mobile pastor tools**

Invitations page supports create, copy, revoke, regenerate and status filters. Security page supports pastor TOTP, recovery-code regeneration and paginated audit review. Users page supports activation and one-time reset-code generation without exposing passwords.

- [ ] **Step 6: Verify responsive build and commit**

Run: `npm --prefix frontend run lint && npm --prefix frontend run build`

Expected: PASS.

```bash
git add frontend/src
git commit -m "feat: add mobile-first leader and pastor workspaces"
```

## Task 9: Accessibility, production serving and end-to-end verification

**Files:**
- Modify: `frontend/src/styles.css`
- Modify: `server.js`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `test/health.test.js`

- [ ] **Step 1: Add production static-serving assertions**

Build the frontend, construct the app in production test mode and assert `/login` returns the built `index.html`, `/api/health` returns JSON, and unknown `/api/*` paths return JSON 404 rather than HTML.

- [ ] **Step 2: Complete accessibility behavior**

Verify semantic headings, labels, `aria-current`, live error/success regions, dialog focus trapping, Escape closure, focus restoration, non-color status text and `prefers-reduced-motion`. Add CSS:

```css
:focus-visible { outline: 3px solid var(--tgn-sky); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
```

- [ ] **Step 3: Document deployment and pilot operations**

README must include environment generation, pastor TOTP onboarding, invitation flow, no-email recovery, MongoDB network restriction, build/start commands, backup/restore checklist, health endpoints and the 10–20 leader pilot checklist.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm test
npm run check
find src test -name '*.js' -print0 | xargs -0 -n1 node --check
node --check app.js
node --check server.js
npm audit --omit=dev
```

Expected: all tests pass, lint passes, production build succeeds, all syntax checks exit 0, and runtime audit reports no actionable vulnerability.

- [ ] **Step 5: Run end-to-end smoke flow**

Against a temporary MongoDB database: bootstrap pastor, configure pastor TOTP, create invitation, redeem as leader, create/edit report, verify revision, verify a second leader receives 404, respond as pastor, respond as leader, archive, verify read-only behavior, issue assisted reset and verify old session revocation.

Expected terminal summary:

```text
CMR smoke test passed: invitation, TOTP, privacy, revisions, conversation, archive, recovery, and production serving.
```

- [ ] **Step 6: Commit the completed release**

```bash
git add README.md package.json frontend/src/styles.css server.js test
git commit -m "chore: verify secure mobile pilot release"
```
