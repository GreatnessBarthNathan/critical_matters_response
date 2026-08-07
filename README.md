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
- TOTP two-factor authentication: required for the pastor, optional for leaders
- Recovery without email: eight one-time recovery codes, plus pastor-issued reset codes
- Metadata-only, append-only audit trail with a pastor review screen
- Auditable report lifecycle with immutable revision history and a read-only archive
- Strict privacy: a leader can only ever reach their own matters
- Production server that serves `frontend/dist`

## Requirements

- Node.js 20 or newer
- A MongoDB deployment that supports **transactions** (a replica set or Atlas). Invitation
  redemption and report writes are transactional, so a standalone `mongod` is not sufficient.

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

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Connection string. Required. |
| `JWT_SECRET` | Signs session cookies. Required. |
| `CSRF_SECRET` | Signs CSRF tokens. Required in production. |
| `TOTP_ENCRYPTION_KEY` | AES-256-GCM key for authenticator secrets. Required in production, exactly 32 bytes. |
| `RECOVERY_CODE_PEPPER` | Extra secret mixed into recovery-code hashes. |
| `RECOVERY_CODE_PREVIOUS_PEPPERS` | Comma-separated old peppers, kept only while rotating. |
| `INVITATION_TTL_DAYS` | Invitation lifetime. Default 7. |
| `ASSISTED_RESET_TTL_MINUTES` | Pastor reset-code lifetime. Default 15. |
| `TRUST_PROXY_HOPS` | Trusted reverse-proxy hops. Keep `0` unless you run behind one. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstraps or promotes the admin account on startup. |

Rotating a secret has consequences: changing `JWT_SECRET` signs everyone out, and changing
`TOTP_ENCRYPTION_KEY` makes every stored authenticator secret unreadable — every user must re-enrol.

## Install, build and run

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build && npm start
```

`npm install` also installs the frontend. `npm run dev` serves the API on `PORT` (default 5000) and
Vite on 5173. In production, `npm start` serves the built frontend and the API from one process.

## First run: admin onboarding

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then start the server. The admin account is created or
   promoted on startup.
2. Sign in at `/login` with those details.
3. The workspace stays locked until two-factor authentication is configured — protected admin
   routes answer `403 ADMIN_TOTP_REQUIRED` until then. Open **Security**, set up an authenticator,
   and confirm the six-digit code.
4. Save the eight recovery codes shown once at the end of setup.
5. Remove `ADMIN_PASSWORD` from the environment and change the password from **Profile**.

## Upgrade existing data

Before deploying this release against an existing database, run the idempotent migration once:

```bash
npm run migrate:roles-and-categories
```

It changes legacy `pastor` roles and response/audit actor roles to `admin`. Legacy report categories
become `sensitive` when their sensitivity was `private`; all other legacy categories become `general`.

## Inviting leaders

1. As the pastor, open **Invitations** and enter the leader's email address.
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
- **Pastor-issued reset code** — if the codes are lost, the pastor verifies who they are speaking to
  in person or by voice, then generates a one-time code from **Church leaders**. It expires after
  `ASSISTED_RESET_TTL_MINUTES`. Completing the reset revokes the leader's existing sessions.

Passwords are never displayed to the pastor, and the pastor cannot read a leader's matters' contents
through any administrative screen.

## Security notes for operators

- **Restrict database access.** Bind MongoDB to a private network or, on Atlas, allow only the
  application server's IP. The database holds the confidential text of every matter.
- **Serve over HTTPS only.** Session cookies are marked `secure` when `NODE_ENV=production`, so
  plain HTTP will not keep anyone signed in.
- **Set `TRUST_PROXY_HOPS` accurately.** Too high and clients can spoof their IP in the audit trail.
- **Deny update and delete on the audit collection** at the database-user level. The model already
  fails closed, but the database should enforce it too.
- **Keep the audit trail metadata-only.** It records who did what and when — never the content of a
  matter.

## Backup and restore checklist

1. Back up daily with `mongodump`, and store the archive encrypted and off the application server.
2. Store the `.env` secrets separately from the data backup. A data backup without
   `TOTP_ENCRYPTION_KEY` and `RECOVERY_CODE_PEPPER` is not fully recoverable.
3. Restore-test quarterly into a scratch database with `mongorestore`, then confirm the health
   endpoint and one sign-in.
4. Verify after every restore: the pastor can sign in with two-factor, a leader sees only their own
   matters, and the audit trail is intact.
5. Record who holds the secrets and how a lost pastor authenticator would be recovered.

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
lints and builds the frontend. `npm run smoke` walks the whole release end to end — pastor
bootstrap and two-factor, invitation and redemption, revisions, cross-leader privacy, both sides of
the conversation, archive, assisted reset and production serving — and needs `frontend/dist`, so
build first.

## Pilot checklist (10–20 leaders)

Before inviting anyone:

- [ ] All secrets generated fresh; `ADMIN_PASSWORD` removed after first sign-in
- [ ] HTTPS enforced and `NODE_ENV=production`
- [ ] Database reachable only from the application server
- [ ] `npm test` and `npm run check` pass on the deployed commit
- [ ] `GET /api/health` returns `ok` over HTTPS
- [ ] Pastor two-factor configured and recovery codes stored offline
- [ ] One backup taken and one restore rehearsed

During the pilot:

- [ ] Invite leaders in small batches, confirming each redemption before the next
- [ ] Confirm with two leaders that neither can see the other's matters
- [ ] Walk one leader through recovery-code sign-in and one through a pastor-issued reset code
- [ ] Exercise the full lifecycle once: create, edit (check the revision history), pastor reply,
      leader reply, archive, confirm read-only, reopen
- [ ] Review the audit trail weekly and confirm it contains no matter content
- [ ] Agree a response-time expectation with leaders, and state plainly that this is not an
      emergency service

Closing the pilot:

- [ ] Deactivate accounts for anyone no longer leading
- [ ] Withdraw unused invitations
- [ ] Rotate `ADMIN_PASSWORD` and review who holds the secrets

## Project structure

```text
app.js                 Express application factory (no connect, no listen)
server.js              Validates the environment, connects, seeds the pastor, listens
src/config/            Environment validation and database connection
src/models/            User, Report, Invitation, AuditEvent
src/services/          auth, invitation, report and audit business rules
src/controllers/       Thin HTTP handlers that delegate to services
src/routes/            Route definitions and rate limits
src/middleware/        Authentication, CSRF, request IDs and error envelope
src/utils/             Crypto, TOTP, tokens and pastor seeding
test/                  Integration tests over the real HTTP surface
frontend/src/design/   TGN design tokens
frontend/src/          React application
```
