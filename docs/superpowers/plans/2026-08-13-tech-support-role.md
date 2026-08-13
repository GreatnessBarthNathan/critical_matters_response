# Tech Support Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a strictly separated tech_support role that administers invitations and leader accounts without seeing, inferring, or acting on private reports.

**Architecture:** Authorization is server-first. techSupportOnly protects operational APIs, and reportParticipantOnly blocks Tech Support before a report controller or query runs. React routes and navigation mirror those policies but do not replace server enforcement.

**Tech Stack:** Node.js, Express, Mongoose/MongoDB, JWT cookies, CSRF middleware, React, React Router, Node test runner, Supertest, mongodb-memory-server.

---

## Files and responsibilities

- src/models/User.js and src/models/AuditEvent.js: persist tech_support.
- src/middleware/authMiddleware.js: strict server role guards.
- src/routes/reportRoutes.js: report-only access.
- src/routes/invitationRoutes.js and src/routes/userRoutes.js: support-only operational access.
- app.js: remove the audit API mount.
- src/controllers/userController.js: minimum support account projection.
- src/services/invitationService.js and src/services/authService.js: audit actual actor roles.
- src/utils/seedTechSupport.js, server.js, .env.example, README.md: support bootstrap.
- frontend/src/components/SupportRoute.jsx and frontend/src/components/ReportParticipantRoute.jsx: client guards.
- frontend/src/App.jsx, navigation components, dashboard and account pages: isolated workspaces.
- test/authorization.test.js, test/invitations.test.js, test/auth-security.test.js: coverage.

### Task 1: Define the role and authorization primitives

**Files:**
- Modify: src/models/User.js:27
- Modify: src/models/AuditEvent.js:20
- Modify: src/middleware/authMiddleware.js:43-53
- Test: test/authorization.test.js

- [ ] **Step 1: Write failing role tests**

~~~js
await createUser({ email: 'support@example.test', role: 'tech_support', firstName: 'Support' });
const support = await signedInCookies(app, 'support@example.test');

assert.equal((await User.findOne({ email: 'support@example.test' })).role, 'tech_support');
await authed(request(app).get('/api/reports'), support).expect(403);
await authed(request(app).get('/api/invitations'), support).expect(200);
~~~

- [ ] **Step 2: Run the focused test**

Run:

~~~bash
node --test --test-concurrency=1 test/authorization.test.js
~~~

Expected: FAIL because the enum does not accept tech_support and invitations remain admin-only.

- [ ] **Step 3: Implement exact role guards**

Set the model fields to:

~~~js
role: { type: String, enum: ['user', 'admin', 'tech_support'], default: 'user', index: true },
actorRole: { type: String, enum: ['user', 'admin', 'tech_support'] },
~~~

Add and export these middleware functions:

~~~js
function techSupportOnly(req, res, next) {
  if (req.user?.role !== 'tech_support') {
    const error = new Error('Tech support access is required.');
    error.code = 'FORBIDDEN';
    error.status = 403;
    return next(error);
  }
  return next();
}

function reportParticipantOnly(req, res, next) {
  if (!['user', 'admin'].includes(req.user?.role)) {
    const error = new Error('Confidential matter access is restricted to the sender and pastor.');
    error.code = 'FORBIDDEN';
    error.status = 403;
    return next(error);
  }
  return next();
}
~~~

- [ ] **Step 4: Re-run the focused test**

Run:

~~~bash
node --test --test-concurrency=1 test/authorization.test.js
~~~

Expected: enum acceptance succeeds; route expectations can remain red until Task 2.

- [ ] **Step 5: Commit**

~~~bash
git add src/models/User.js src/models/AuditEvent.js src/middleware/authMiddleware.js test/authorization.test.js
git commit -m "feat: add restricted tech support role"
~~~

### Task 2: Enforce report/support separation at every API boundary

**Files:**
- Modify: src/routes/reportRoutes.js:1-13
- Modify: src/routes/invitationRoutes.js:1-28
- Modify: src/routes/userRoutes.js:1-10
- Modify: app.js:11-68
- Delete: src/routes/auditRoutes.js
- Modify: src/controllers/userController.js:17-37
- Modify: src/services/invitationService.js:92-127,176-193
- Modify: src/services/authService.js:412-438
- Test: test/authorization.test.js
- Test: test/invitations.test.js

- [ ] **Step 1: Write the report-denial and support-exclusivity matrix**

~~~js
for (const operation of [
  authed(request(app).get('/api/reports'), support),
  authed(request(app).get('/api/reports/stats'), support),
  authed(request(app).get('/api/reports/' + report._id), support),
  csrf(request(app).post('/api/reports'), support).send({ title: 'No access', content: 'Must be rejected.' }),
  csrf(request(app).patch('/api/reports/' + report._id), support).send({ title: 'No access' }),
  csrf(request(app).post('/api/reports/' + report._id + '/responses'), support).send({ message: 'No access' }),
  csrf(request(app).patch('/api/reports/' + report._id + '/status'), support).send({ status: 'archived' }),
]) {
  const response = await operation.expect(403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
}

await csrf(request(app).post('/api/invitations'), support).send({ email: 'support-invite@example.test' }).expect(201);
await authed(request(app).get('/api/users'), support).expect(200);
await csrf(request(app).post('/api/invitations'), pastor).send({ email: 'admin-blocked@example.test' }).expect(403);
await authed(request(app).get('/api/users'), pastor).expect(403);
await authed(request(app).get('/api/audit'), support).expect(404);
await authed(request(app).get('/api/audit'), pastor).expect(404);
~~~

Verify the support account view is minimal:

~~~js
const accounts = await authed(request(app).get('/api/users'), support).expect(200);
assert.deepEqual(Object.keys(accounts.body.users[0]).sort(), [
  'avatarColor', 'createdAt', 'email', 'firstName', 'id', 'isActive', 'lastLoginAt', 'lastName', 'role',
]);
assert.equal('phone' in accounts.body.users[0], false);
assert.equal('ministry' in accounts.body.users[0], false);
assert.equal('reportCount' in accounts.body.users[0], false);
assert.equal('openCount' in accounts.body.users[0], false);
~~~

- [ ] **Step 2: Run the tests and confirm expected failures**

Run:

~~~bash
node --test --test-concurrency=1 test/authorization.test.js test/invitations.test.js
~~~

Expected: FAIL because report routes still admit any non-admin user and support routes still admit admin.

- [ ] **Step 3: Block Tech Support before report handlers**

Use:

~~~js
const { protect, adminOnly, reportParticipantOnly } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, reportParticipantOnly);
~~~

Keep adminOnly on PATCH /:id/status. Tech Support must not reach a controller, report-service method, or MongoDB report query.

- [ ] **Step 4: Make support routes Tech Support-only**

Use:

~~~js
const { protect, techSupportOnly } = require('../middleware/authMiddleware');
const supportWithCsrf = [protect, techSupportOnly, csrfProtection];

router.get('/', protect, techSupportOnly, controller.list);
router.post('/', ...supportWithCsrf, controller.create);
router.delete('/:id', ...supportWithCsrf, controller.revoke);
~~~

For user-account administration:

~~~js
router.get('/', protect, techSupportOnly, controller.listUsers);
router.patch('/:id/status', protect, techSupportOnly, controller.setUserStatus);
router.post('/:id/reset-code', protect, techSupportOnly, controller.issueResetCode);
~~~

Keep PATCH /api/users/profile as authenticated self-service for every role.

- [ ] **Step 5: Remove audit access and report-derived account data**

Delete the auditRoutes import/mount from app.js, then delete src/routes/auditRoutes.js.

Replace listUsers so it does not import or query Report:

~~~js
const users = await User.find({ role: 'user' })
  .select('firstName lastName email role isActive avatarColor createdAt lastLoginAt')
  .sort({ createdAt: -1 });
res.json({ users: users.map((user) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  avatarColor: user.avatarColor,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
})) });
~~~

Replace hard-coded actorRole: admin with actorRole: pastor.role or actorRole: req.user.role in invitation, reset-code, and account-status audit records.

- [ ] **Step 6: Verify API isolation**

Run:

~~~bash
node --test --test-concurrency=1 test/authorization.test.js test/invitations.test.js test/reports.test.js
~~~

Expected: PASS; Tech Support receives 403 for reports, admin receives 403 for support APIs, and both receive 404 for audit API.

- [ ] **Step 7: Commit**

~~~bash
git add app.js src/routes/reportRoutes.js src/routes/invitationRoutes.js src/routes/userRoutes.js src/routes/auditRoutes.js src/controllers/userController.js src/services/invitationService.js src/services/authService.js test/authorization.test.js test/invitations.test.js
git commit -m "feat: separate support operations from pastoral reports"
~~~

### Task 3: Bootstrap the Tech Support account

**Files:**
- Create: src/utils/seedTechSupport.js
- Modify: server.js:1-18
- Modify: .env.example:21-29
- Modify: README.md:60-125
- Test: test/auth-security.test.js

- [ ] **Step 1: Write failing bootstrap tests**

~~~js
process.env.TECH_SUPPORT_EMAIL = 'support@example.test';
process.env.TECH_SUPPORT_PASSWORD = PASSWORD;
await seedTechSupport();
assert.equal((await User.findOne({ email: 'support@example.test' })).role, 'tech_support');

await User.updateOne({ email: 'support@example.test' }, { role: 'user' });
await seedTechSupport();
assert.equal((await User.findOne({ email: 'support@example.test' })).role, 'tech_support');
~~~

Restore original environment values in test cleanup.

- [ ] **Step 2: Run the bootstrap test**

Run:

~~~bash
node --test --test-concurrency=1 test/auth-security.test.js
~~~

Expected: FAIL because seedTechSupport does not exist.

- [ ] **Step 3: Implement the optional startup seeder**

Create src/utils/seedTechSupport.js:

~~~js
const User = require('../models/User');

async function seedTechSupport() {
  const email = process.env.TECH_SUPPORT_EMAIL?.trim().toLowerCase();
  const password = process.env.TECH_SUPPORT_PASSWORD;
  if (!email || !password) return;
  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    if (existing.role !== 'tech_support') {
      existing.role = 'tech_support';
      await existing.save();
      console.log('Existing account assigned to tech support: ' + email);
    }
    return;
  }
  await User.create({
    firstName: process.env.TECH_SUPPORT_FIRST_NAME || 'Tech',
    lastName: process.env.TECH_SUPPORT_LAST_NAME || 'Support',
    email, password, role: 'tech_support',
  });
  console.log('Tech support account created: ' + email);
}

module.exports = seedTechSupport;
~~~

Import it in server.js and call await seedTechSupport() immediately after await seedAdmin(). Add the four TECH_SUPPORT variables to .env.example and document that the initial password must be removed after the first successful sign-in.

- [ ] **Step 4: Verify**

Run:

~~~bash
node --test --test-concurrency=1 test/auth-security.test.js
rg -n "TECH_SUPPORT_(EMAIL|PASSWORD|FIRST_NAME|LAST_NAME)" .env.example README.md
~~~

Expected: PASS; all four variables appear in both documentation files.

- [ ] **Step 5: Commit**

~~~bash
git add src/utils/seedTechSupport.js server.js .env.example README.md test/auth-security.test.js
git commit -m "feat: bootstrap tech support account"
~~~

### Task 4: Create the strict Tech Support workspace

**Files:**
- Create: frontend/src/components/SupportRoute.jsx
- Create: frontend/src/components/ReportParticipantRoute.jsx
- Modify: frontend/src/App.jsx:1-53
- Modify: frontend/src/components/MobileNav.jsx:1-47
- Modify: frontend/src/components/DashboardLayout.jsx:1-105
- Modify: frontend/src/pages/DashboardPage.jsx:1-98
- Modify: frontend/src/pages/UsersPage.jsx:1-174
- Modify: frontend/src/pages/CreateReportPage.jsx:34-35
- Modify: frontend/src/pages/ProfilePage.jsx:20-69
- Delete: frontend/src/pages/SecurityPage.jsx

- [ ] **Step 1: Add client guards**

SupportRoute.jsx:

~~~jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function SupportRoute() {
  const { user } = useAuth();
  return user?.role === 'tech_support' ? <Outlet /> : <Navigate to="/app" replace />;
}
~~~

ReportParticipantRoute.jsx:

~~~jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ReportParticipantRoute() {
  const { user } = useAuth();
  return ['user', 'admin'].includes(user?.role) ? <Outlet /> : <Navigate to="/app" replace />;
}
~~~

- [ ] **Step 2: Partition all routes**

Place only reports/new, reports, reports/archived, and reports/:id inside ReportParticipantRoute. Place only invitations and people inside SupportRoute. Remove the SecurityPage import and do not register /app/security.

- [ ] **Step 3: Render exact role navigation**

Add:

~~~js
export const techSupportTabs = [
  { to: '/app', end: true, label: 'Support', icon: LayoutDashboard },
  { to: '/app/invitations', label: 'Invitations', icon: MailPlus },
  { to: '/app/people', label: 'Accounts', icon: UsersRound },
  { to: '/app/profile', label: 'Profile', icon: UserRound },
];
~~~

Remove Invitations, Accounts/Leaders, and Security from admin navigation. Remove the Security title. Render Tech support as the role label and leave only Help & privacy as the Tech Support secondary link.

- [ ] **Step 4: Render report-free support pages**

Before calling /reports/stats, return a Tech Support dashboard containing only:

~~~jsx
<section className="page-intro"><div>
  <h2>Technical support</h2>
  <p>Manage secure access and invitations. Confidential matters are not available to this role.</p>
</div></section>
<div className="card-list">
  <Link className="button button--ghost button--full" to="/app/invitations">Manage invitations</Link>
  <Link className="button button--ghost button--full" to="/app/people">Manage accounts</Link>
</div>
~~~

In UsersPage, show only account name, email, active status, reset-code, and activate/deactivate controls. Remove ministry, phone, report counts, and open-count text. In CreateReportPage, use:

~~~jsx
if (user.role !== 'user') return <Navigate to="/app" replace />;
~~~

In ProfilePage, label the role Tech support while retaining its personal password, TOTP, recovery-code, and push settings.

- [ ] **Step 5: Verify frontend compilation**

Run:

~~~bash
npm run check
~~~

Expected: PASS; ESLint and the Vite production build complete.

- [ ] **Step 6: Commit**

~~~bash
git add frontend/src/App.jsx frontend/src/components/SupportRoute.jsx frontend/src/components/ReportParticipantRoute.jsx frontend/src/components/MobileNav.jsx frontend/src/components/DashboardLayout.jsx frontend/src/pages/DashboardPage.jsx frontend/src/pages/UsersPage.jsx frontend/src/pages/CreateReportPage.jsx frontend/src/pages/ProfilePage.jsx frontend/src/pages/SecurityPage.jsx
git commit -m "feat: add tech support workspace"
~~~

### Task 5: Full regression, privacy scan, and delivery

**Files:**
- Modify only files named in Tasks 1-4 if a regression test identifies a correction.
- Test: test/*.test.js

- [ ] **Step 1: Run the full server suite**

Run:

~~~bash
npm test
~~~

Expected: PASS; authentication, report privacy, invitations, notifications, migration, database, and authorization suites are green.

- [ ] **Step 2: Scan for forbidden Tech Support exposure**

Run:

~~~bash
rg -n "tech_support|/app/reports|/api/reports|/app/security|/api/audit" frontend/src src app.js
~~~

Expected: report routes use reportParticipantOnly; no Tech Support navigation/route reaches reports; app.js does not mount audit API; Security page is absent.

- [ ] **Step 3: Verify build and repository hygiene**

Run:

~~~bash
npm run check
git diff --check
git status --short
~~~

Expected: PASS, no whitespace errors, and only intended files differ.

- [ ] **Step 4: Commit final corrections if needed**

Run only if Steps 1-3 required a correction:

~~~bash
git add app.js server.js .env.example README.md src/models/User.js src/models/AuditEvent.js src/middleware/authMiddleware.js src/routes/reportRoutes.js src/routes/invitationRoutes.js src/routes/userRoutes.js src/controllers/userController.js src/services/invitationService.js src/services/authService.js src/utils/seedTechSupport.js frontend/src/App.jsx frontend/src/components/SupportRoute.jsx frontend/src/components/ReportParticipantRoute.jsx frontend/src/components/MobileNav.jsx frontend/src/components/DashboardLayout.jsx frontend/src/pages/DashboardPage.jsx frontend/src/pages/UsersPage.jsx frontend/src/pages/CreateReportPage.jsx frontend/src/pages/ProfilePage.jsx test/authorization.test.js test/invitations.test.js test/auth-security.test.js
git commit -m "test: cover tech support privacy boundary"
~~~

- [ ] **Step 5: Sync and push**

Run:

~~~bash
git fetch origin --prune
git rebase origin/master
git push origin main:master
~~~

Expected: GitHub master receives the completed Tech Support role commits.
