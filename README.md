# Critical Matters Response

A private pastoral-care application for church leaders to share sensitive life matters with their
pastor. The React frontend and Node.js API deploy together as one application, with MongoDB as the
database.

Access is **invitation-only**. There is no public sign-up page, and the service sends no email.

## What is included

- React 19 + Vite 7 frontend (not Next.js), mobile-first, in the TGN design system
- Node.js + Express 5 backend (not NestJS), with business rules in focused services
- MongoDB/Mongoose 8 models using a connection string
- HTTP-only cookie sessions with a session version, so accounts can be revoked instantly
- Signed double-submit CSRF protection on every state-changing request
- One-time, expiring, hashed invitations — the only route to an account
- TOTP two-factor authentication, with recovery codes for every account
- Recovery without email: eight one-time recovery codes, plus Tech Support-issued reset codes
- Report lifecycle with immutable revision history and a read-only archive
- Strict privacy: a leader can only ever reach their own matters
- Production server that serves `frontend/dist`

## Requirements

- Node.js 20 or newer
- A MongoDB deployment that supports **transactions** (a replica set or Atlas). Invitation
  redemption and report writes are transactional, so a standalone `mongod` is not sufficient.
- Report titles, bodies, replies, and textual revisions are encrypted at rest before MongoDB stores
  them. This is not end-to-end encryption: the application holds the report key so the Pastor can
  sign in normally on any device and read authorised reports.

## Environment configuration

Copy `.env.example` to `.env` and fill in every value. Generate the secrets rather than inventing
them:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
```

```bash
node -e "console.log('CSRF_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
```

```bash
node -e "console.log('RECOVERY_CODE_PEPPER=' + require('crypto').randomBytes(48).toString('base64url'))"
```

`TOTP_ENCRYPTION_KEY` must decode to exactly 32 bytes; the app refuses to start in production
otherwise:

```bash
node -e "console.log('TOTP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

Generate the report-encryption key separately and keep it in the deployment secret store:

```bash
node -e "console.log('REPORT_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Connection string. Required. |
| `JWT_SECRET` | Signs session cookies. Required. |
| `CSRF_SECRET` | Signs CSRF tokens. Required in production. |
| `TOTP_ENCRYPTION_KEY` | AES-256-GCM key for authenticator secrets. Required in production, exactly 32 bytes. |
| `REPORT_ENCRYPTION_KEY` | AES-256-GCM key for report titles, bodies, replies, and textual revisions. Required in production, exactly 32 bytes. |
| `REPORT_ENCRYPTION_KEY_ID` | Non-secret identifier for the active report key. Defaults to `current`. |
| `REPORT_ENCRYPTION_PREVIOUS_KEY` / `_ID` | Temporary previous report key and identifier during rotation. |
| `RECOVERY_CODE_PEPPER` | Extra secret mixed into recovery-code hashes. |
| `RECOVERY_CODE_PREVIOUS_PEPPERS` | Comma-separated old peppers, kept only while rotating. |
| `INVITATION_TTL_DAYS` | Invitation lifetime. Default 7. |
| `ASSISTED_RESET_TTL_MINUTES` | Tech Support reset-code lifetime. Default 15. |
| `TRUST_PROXY_HOPS` | Trusted reverse-proxy hops. Keep `0` unless you run behind one. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstraps or promotes the admin account on startup. |
| `TECH_SUPPORT_EMAIL` / `TECH_SUPPORT_PASSWORD` | Creates or assigns the restricted technical-support account on startup. |
| `TECH_SUPPORT_FIRST_NAME` / `TECH_SUPPORT_LAST_NAME` | Optional technical-support display name. Defaults to `Tech Support`. |

Rotating a secret has consequences: changing `JWT_SECRET` signs everyone out, and changing
`TOTP_ENCRYPTION_KEY` makes every stored authenticator secret unreadable — every user must re-enrol.
For report encryption, set a new key and key ID, keep the old values as
`REPORT_ENCRYPTION_PREVIOUS_KEY` and `REPORT_ENCRYPTION_PREVIOUS_KEY_ID`, then run
`npm run rotate:report-encryption`. Verify with `npm run verify:report-encryption` before removing
the previous key.

## Install, build and run

```bash
npm install
```

After deploying the encrypted-report release, create an encrypted MongoDB backup, check the
migration without changing data, then convert existing reports:

```bash
npm run migrate:report-encryption -- --dry-run
npm run migrate:report-encryption
npm run verify:report-encryption
```

The migration is repeatable and reports counts only; it never prints report content. New and
edited reports are encrypted automatically. During a controlled migration window, legacy plaintext
records can still be read, but the application always writes encrypted values.

```bash
npm run dev
```

```bash
npm run build && npm start
```

`npm install` also installs the frontend. `npm run dev` serves the API on `PORT` (default 5000) and
Vite on 5173. In production, `npm start` serves the built frontend and the API from one process.

## Browser push notifications

Push notifications are optional and require HTTPS in production. Generate VAPID keys once, put the
resulting values in your deployment environment, and keep the private key secret:

```bash
npm run generate:vapid-keys
```

Set `VAPID_SUBJECT` to a contact URI such as `mailto:admin@yourchurch.org`. Leaders and admins opt in
separately on each device from **Profile**. Tech Support cannot subscribe or receive report alerts.
Alerts are deliberately generic and never include report content.

## First run: admin onboarding

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then start the server. The admin account is created or
   promoted on startup.
2. Sign in at `/login` with those details.
3. Two-factor authentication is optional. Open **Security** to set up an authenticator and confirm
   the six-digit code whenever you are ready.
4. Save the eight recovery codes shown once at the end of setup.
5. Remove `ADMIN_PASSWORD` from the environment and change the password from **Profile**.

## First run: technical-support onboarding

1. Set `TECH_SUPPORT_EMAIL` and `TECH_SUPPORT_PASSWORD`, then start the server. You can optionally
   set `TECH_SUPPORT_FIRST_NAME` and `TECH_SUPPORT_LAST_NAME` (they default to `Tech Support`). A new
   account is created with the `tech_support` role, or an existing account at that address is reassigned to it.
   `TECH_SUPPORT_EMAIL` must be different from `ADMIN_EMAIL`.
2. Sign in at `/login` with those details. This role manages invitations, user access and reset codes.
   It cannot access confidential matter reports or browser push notifications.
3. **After the first sign-in, remove `TECH_SUPPORT_PASSWORD` from the environment and change the
   password from Profile.** Leaving a bootstrap password configured is unsafe and lets a future startup
   reassign any account that uses the configured email.

## Upgrade existing data

Before deploying this release against an existing database, run the idempotent migration once:

```bash
npm run migrate:roles-and-categories
```

It changes legacy `pastor` roles and response/audit actor roles to `admin`. Legacy report categories
become `sensitive` when their sensitivity was `private`; all other legacy categories become `general`.

## Inviting leaders

1. As Tech Support, open **Invitations** and enter the leader's email address.
2. Copy the generated link immediately — the token is shown once and only its hash is stored.
3. Share the link privately, in person or through a channel you already trust. It expires after
   `INVITATION_TTL_DAYS` and works exactly once.
4. The leader opens the link, sets their name and password, and saves their own recovery codes.

Creating a new invitation for an address withdraws any active invitation for that address. Withdraw
one at any time from the same screen.

## Recovery without email

Two paths, both without messaging anyone:

- **Recovery code** — the leader enters their email, one saved recovery code and a new password at
  `/forgot-password`. Each code works once.
- **Tech Support-issued reset code** — if the codes are lost, Tech Support verifies who they are speaking to
  in person or by voice, then generates a one-time code from **Church leaders**. It expires after
  `ASSISTED_RESET_TTL_MINUTES`. Completing the reset revokes the leader's existing sessions.

Passwords are never displayed to Tech Support. Tech Support cannot read a leader's matters' contents
through any screen; report access belongs only to the leader and the admin handling the report.

## Security notes for operators

- **Restrict database access.** Bind MongoDB to a private network or, on Atlas, allow only the
  application server's IP. The database holds encrypted confidential fields for every matter.
- **Serve over HTTPS only.** Session cookies are marked `secure` when `NODE_ENV=production`, so
  plain HTTP will not keep anyone signed in.
- **Set `TRUST_PROXY_HOPS` accurately.** Too high and clients can spoof their IP in the audit trail.

## Backup and restore checklist

1. Back up daily with `mongodump`, and store the archive encrypted and off the application server.
2. Store the `.env` secrets separately from the data backup. A data backup without
   `REPORT_ENCRYPTION_KEY`, `TOTP_ENCRYPTION_KEY`, and `RECOVERY_CODE_PEPPER` is not fully recoverable.
3. Restore-test quarterly into a scratch database with `mongorestore`, then confirm the health
   endpoint and one sign-in.
4. Verify after every restore: an admin can sign in, a leader sees only their own matters, and Tech
   Support can manage account access without seeing reports.
5. Record who holds the secrets and how a lost administrator authenticator would be recovered.

## Health endpoints

- `GET /api/health` — returns `{"status":"ok","service":"Critical Matters Response"}`. Use it for
  uptime checks; it needs no authentication and reveals nothing else.
- Unknown `/api/*` paths always return JSON, never the HTML application shell.

Every error response uses one shape, and never includes a stack trace:

```json
{ "error": { "code": "REPORT_ARCHIVED", "message": "This matter is archived and read-only.", "fields": {}, "requestId": "opaque-id" } }
```

The `requestId` is also returned as the `X-Request-Id` header and written to the server log, so a
person can quote it without exposing any detail of their matter.

## Verification

```bash
npm test
```

```bash
npm run check
```

```bash
npm run build && npm run smoke
```

`npm test` runs the API integration suite against an in-memory MongoDB replica set. `npm run check`
lints and builds the frontend. `npm run smoke` walks the whole release end to end — admin bootstrap,
invitation and redemption, revisions, cross-leader privacy, both sides of the conversation, archive,
Tech Support-assisted reset and production serving — and needs `frontend/dist`, so
build first.

## Pilot checklist (10–20 leaders)

Before inviting anyone:

- [ ] All secrets generated fresh; `ADMIN_PASSWORD` removed after first sign-in
- [ ] HTTPS enforced and `NODE_ENV=production`
- [ ] Database reachable only from the application server
- [ ] `npm test` and `npm run check` pass on the deployed commit
- [ ] `GET /api/health` returns `ok` over HTTPS
- [ ] Admin recovery codes stored offline
- [ ] One backup taken and one restore rehearsed

During the pilot:

- [ ] Invite leaders in small batches, confirming each redemption before the next
- [ ] Confirm with two leaders that neither can see the other's matters
- [ ] Walk one leader through recovery-code sign-in and one through a Tech Support-issued reset code
- [ ] Exercise the full lifecycle once: create, edit (check the revision history), admin reply,
      leader reply, archive, confirm read-only, reopen
- [ ] Agree a response-time expectation with leaders, and state plainly that this is not an
      emergency service

Closing the pilot:

- [ ] Deactivate accounts for anyone no longer leading
- [ ] Withdraw unused invitations
- [ ] Rotate `ADMIN_PASSWORD` and review who holds the secrets

## Project structure

```text
app.ts                 Express application factory (no connect, no listen)
server.ts              Validates the environment, connects, seeds bootstrap accounts, listens
app.js/server.js        Small CommonJS compatibility entrypoints for existing process managers
src/config/            Environment validation and database connection
src/models/            User, Report, Invitation, AuditEvent
src/services/          auth, invitation and report business rules
src/controllers/       Thin HTTP handlers that delegate to services
src/routes/            Route definitions and rate limits
src/middleware/        Authentication, CSRF, request IDs and error envelope
src/utils/             Crypto, TOTP, tokens and account seeding
test/                  Integration tests over the real HTTP surface (executed through tsx)
frontend/src/design/   TGN design tokens
frontend/src/          React TypeScript application (`.tsx` components, `.ts` utilities)
tsconfig.json          Backend TypeScript configuration
frontend/tsconfig.json Frontend TypeScript configuration
```

The project is authored in TypeScript while retaining the two small CommonJS entrypoint
wrappers for backwards-compatible process-manager and test imports. `npm run typecheck` validates
both projects; `npm run check` runs typechecking, linting, and the production frontend build.
The initial migration keeps TypeScript's `noCheck` compatibility mode for the existing dynamic
Mongoose/Express boundaries; typed API/auth contracts are in place, and stricter checking can be
enabled incrementally without changing runtime behaviour.
