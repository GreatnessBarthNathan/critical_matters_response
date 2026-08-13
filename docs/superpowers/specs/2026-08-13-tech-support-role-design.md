# Tech Support Role Design

## Purpose

Introduce a restricted `tech_support` role so technical support can administer account access and invitations without seeing pastoral matters. Report privacy remains exclusive to the report owner and the pastor/admin.

## Roles and responsibilities

| Role | Allowed areas | Explicitly excluded areas |
| --- | --- | --- |
| `user` | Own reports, replies, profile, own account security | Other users' accounts, invitations, all other reports |
| `admin` | All reports, replies, report lifecycle, profile, own account security | Invitations, account administration, operational Security page, audit data |
| `tech_support` | Support dashboard, invitations, user-account activation/deactivation, one-time password reset codes, profile, own account security | Every report endpoint, report counts/status/metadata, report audit activity, report notifications, operational audit data |

`admin` is the pastoral role. It does not inherit Tech Support permissions. `tech_support` is an operational role and does not inherit report permissions.

## Access model

Authorization is enforced by the server, not the client UI.

- Every `/api/reports` route requires a report participant role (`user` or `admin`). Requests from `tech_support` return `403` before any report query or mutation occurs.
- Invitation routes and user-account administration routes require exactly `tech_support`. Requests from `admin` and `user` return `403`.
- The operational `/api/audit` route is not exposed to any application role for now. Audit records continue to be written server-side for security and future incident investigation, but there is no UI or API access path.
- Tech Support account lists expose only first name, last name, email, and active status. They omit phone, ministry, biography, report counts, open-report counts, report IDs, titles, content, responses, timestamps, and all other report-derived data.

## UI

### Admin

The admin navigation contains only report-related work, profile, help/privacy, and its personal authentication settings. It has no links to Invitations, Accounts, Security, or audit views.

### Tech Support

The Tech Support dashboard provides links to:

1. Invitations: create, list, and withdraw invitation links.
2. Accounts: list basic account details, activate/deactivate accounts, and issue one-time reset codes.
3. Profile: update the support worker's own profile, password, two-factor authentication, recovery codes, and browser-push preference.

There is no Reports navigation, report route, report summary, report count, or audit-log navigation for Tech Support.

## Provisioning

The server optionally creates or assigns the Tech Support account during startup when both variables are present:

- `TECH_SUPPORT_EMAIL`
- `TECH_SUPPORT_PASSWORD`
- `TECH_SUPPORT_FIRST_NAME` (optional; defaults to `Tech`)
- `TECH_SUPPORT_LAST_NAME` (optional; defaults to `Support`)

An existing account at `TECH_SUPPORT_EMAIL` is assigned the `tech_support` role. Deployment operators remove `TECH_SUPPORT_PASSWORD` after first sign-in and then change the account password from Profile.

## Audit and safety

All sensitive changes remain server-audited, including invitation changes, account status changes, reset-code issuance, and support authentication events. The role responsible for the action is recorded as `tech_support` rather than being mislabelled as `admin`.

Push notifications remain report-recipient-only: report creation notifies active admins, and pastoral replies notify the report owner. Tech Support is never selected as a report-notification recipient.

## Error handling

- Unauthorized support operations return the existing stable `403 FORBIDDEN` envelope.
- Report access denials never distinguish report existence from permission status beyond the role-level `403`; Tech Support does not receive report content or metadata.
- Failed invitation, account, and reset-code operations retain the existing validation and CSRF protections.

## Tests

Automated authorization tests will verify:

1. Tech Support may create/list/withdraw invitations and administer user account status/reset codes.
2. Tech Support receives `403` for every report route: list, stats, read, create, edit, reply, and status transition.
3. Tech Support account results contain only the approved minimum fields and no report-derived values.
4. Admin receives `403` for all Tech Support operational routes.
5. Audit events record the `tech_support` actor role while remaining unavailable through application routes.
6. Existing user/admin report privacy behavior remains unchanged.
