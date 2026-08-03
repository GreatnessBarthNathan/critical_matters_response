# Critical Matters Response: Secure Evolution Design

Date: 2026-08-03  
Status: Approved design  
Application: Critical Matters Response (CMR)

## 1. Purpose

Critical Matters Response is a confidential pastoral-care application through which approved church leaders can share identified personal matters with one lead pastor. Only the submitting leader and the lead pastor may access the report and its conversation.

This design evolves the existing React, Express and MongoDB prototype. It preserves the verified single-deployment architecture while adding invitation-only membership, stronger account security, immutable report revisions, audit logging and a mobile-first TGN visual system.

## 2. Goals

- Provide an accessible, private channel between an approved church leader and one lead pastor.
- Prevent public account creation and unauthorized cross-account access.
- Make the full leader and pastor workflows practical on a phone.
- Use the regular TGN website's public brand identity rather than an admin-product theme.
- Preserve a trustworthy history of report edits and security-relevant actions.
- Deploy the frontend and backend as one application on one domain.
- Pilot safely with 10–20 trusted leaders before expanding to 100–500 leaders.

## 3. Non-goals for the first release

- Anonymous reports
- Multiple pastors or delegated pastoral-care administrators
- File or media attachments
- Email, SMS or WhatsApp notifications
- Authentication or password-recovery emails
- Public registration
- Public links from the main TGN website
- Report export, public sharing or permanent deletion
- Native iOS or Android applications

## 4. Approved product approach

The approved approach is a secure evolution of the existing codebase.

The application keeps its React/Vite frontend, Node.js/Express backend and MongoDB/Mongoose persistence. Existing report and session behavior will be migrated deliberately instead of rebuilding the product or shipping the interface before the security work is complete.

## 5. Roles and authorization boundary

### 5.1 Lead pastor

There is exactly one lead pastor account. The pastor can:

- Create, revoke and regenerate leader invitations.
- View all leader accounts and activate or deactivate them.
- Issue a password-reset code after personally verifying a leader.
- View every report and its revision history.
- Respond within report conversations.
- Change report status, archive reports and reopen archived reports.
- Review the security audit log.
- Manage their own password, authenticator and recovery codes.

### 5.2 Church leader

A church leader can:

- Create an account only through a valid invitation tied to their email address.
- Manage their profile, password, optional authenticator and recovery codes.
- Create identified confidential reports.
- View only their own reports and pastor responses.
- Edit open reports while preserving an immutable revision history.
- Respond within their own open report conversations.
- Read archived reports.

### 5.3 Enforcement

Every report read and write is scoped to the authenticated leader's ID unless the authenticated account is the lead pastor. Route middleware establishes identity and coarse role access; report services must independently enforce ownership for defense in depth.

No client-supplied role, owner ID or pastor ID is trusted.

## 6. Primary user journeys

### 6.1 Leader onboarding

1. The pastor creates an invitation for a normalized, unique email address.
2. CMR generates a random one-time invitation and displays a copyable link to the pastor.
3. The pastor shares the link personally outside CMR.
4. The leader opens the link within seven days.
5. The leader supplies first name, last name and a password using the invited email address.
6. The invitation is consumed atomically so it cannot be replayed.
7. CMR displays account recovery codes once and asks the leader to save them.
8. The leader enters the application.

### 6.2 Leader report journey

1. The leader signs in through the discreet TGN-branded entry page.
2. The leader selects Create and completes a mobile three-step report flow.
3. CMR validates and submits the report privately to the pastor.
4. The leader follows status and unread activity from the dashboard.
5. The leader and pastor continue a private conversation.
6. The leader may edit the original report while it remains open; each save creates a revision.
7. The pastor archives the matter when care is complete.
8. Both participants can revisit the read-only archive.

### 6.3 Pastor report journey

1. The pastor signs in with password and required TOTP verification.
2. The operational dashboard prioritizes new, important, urgent and unread matters.
3. Opening a new report moves it to In review.
4. The pastor reads the current report, any revisions and the conversation.
5. The pastor responds, changing the state to Awaiting leader.
6. A leader response changes the state to Awaiting pastor.
7. The pastor archives or later reopens the matter.

### 6.4 Pastor-assisted recovery

1. A leader who has lost both password and recovery codes contacts the pastor outside CMR.
2. The pastor verifies the leader personally.
3. The pastor generates a short-lived, one-time reset code.
4. The leader enters the email, reset code and a new password.
5. CMR revokes existing sessions and consumes the reset code.
6. The pastor never sees or chooses the new password.

## 7. Invitations

An invitation contains:

- Invited normalized email address
- Random token hash
- Created-by pastor ID
- Created, expiry, consumed and revoked timestamps
- Status derived from those timestamps

The plaintext token appears only in the generated invitation link. The database stores only a cryptographic hash. Invitations expire seven days after creation, are single use and can be revoked. Regeneration revokes any previous active invitation for the same email.

Invitation redemption uses an atomic database operation that verifies an active invitation and marks it consumed while creating the account. A used, expired or revoked link returns the same neutral invalid-invitation response.

## 8. Authentication and account security

### 8.1 Credentials and sessions

- Emails are trimmed, lowercased, syntax-validated and unique.
- Passwords and recovery codes use a current, configurable password-hashing work factor.
- Authentication uses HTTP-only, secure, same-site cookies in production.
- State-changing requests require CSRF protection.
- Login, invitation, recovery and TOTP endpoints have independent rate limits.
- Password reset, password change, account deactivation and suspected compromise revoke existing sessions through a server-checked session version.
- Authentication errors do not reveal whether an email address exists.

### 8.2 Two-factor authentication

TOTP through a standards-compatible authenticator app is mandatory for the pastor and optional for leaders. TOTP secrets are encrypted at rest with a dedicated environment-provided encryption key. Secrets never appear in application logs or audit event metadata.

TOTP setup requires successful code verification before activation. Regenerating recovery codes invalidates the previous set. Pastor access is not considered fully configured until TOTP and recovery codes are established.

### 8.3 Recovery

Self-service recovery uses the account email and one unused recovery code. Recovery codes are stored only as hashes and are invalidated individually after use.

Pastor-assisted recovery tokens are random, hashed, short-lived, single-use and bound to one leader account. The reset endpoint does not expose whether the account or token failed validation.

No authentication, invitation or recovery email is sent.

## 9. Report model and lifecycle

A report contains:

- Owner ID
- Private reference number
- Subject
- Detailed original message
- Category
- Priority: normal, important or urgent
- Sensitivity: confidential or highly sensitive
- Status
- Embedded immutable revisions
- Embedded private conversation responses
- Participant-specific read state
- Created, updated, last-activity and archived timestamps

All reports are confidential. The highly sensitive label is an operational cue for added discretion, not a different authorization model.

### 9.1 Statuses

- **New:** Submitted and not opened by the pastor.
- **In review:** Opened by the pastor and not currently awaiting a participant response.
- **Awaiting pastor:** The leader most recently responded.
- **Awaiting leader:** The pastor most recently responded.
- **Archived:** Pastoral care is complete; the report is read-only.

Opening a New report as pastor moves it to In review. Sending a response sets the corresponding awaiting state. The pastor can manually correct an open state, archive a report or reopen an archived report.

### 9.2 Revisions

Leaders may change the subject, category, priority, sensitivity and original message while the report is open. Each successful edit appends an immutable revision containing:

- Editor ID
- Edit timestamp
- Previous values for changed fields
- New values for changed fields
- Revision number

The current report fields remain denormalized for efficient list and detail queries. Neither participant can update or remove a previous revision.

### 9.3 Conversation and read state

Responses contain author ID, author role, message, created timestamp and per-participant read state. Responses cannot be edited or deleted in the first release. Archived reports accept no edits or responses until reopened.

Unread indicators are in-app only. No report content, identity or activity is sent through an external notification provider.

### 9.4 Urgent matters

Urgent matters receive the strongest visual priority and sorting weight. Report creation and urgent-state views state plainly that CMR is not an emergency service and direct users to local emergency services or a trusted nearby person when there is immediate danger.

## 10. Security audit

Audit events are immutable and pastor-visible. Each event contains:

- Actor ID and role when authenticated
- Action type
- Target type and opaque target ID
- Result: success or failure
- Timestamp
- Redacted request metadata such as IP and user-agent

Covered events include sign-in, sign-out, TOTP changes, invitation creation or use, recovery, password changes, session revocation, account activation, report access, report edits, responses, status changes, archive and reopen actions.

Audit events never contain report subject, report body, response text, password, token, cookie, recovery code or TOTP secret. Application logs follow the same redaction rules.

## 11. Data model boundaries

CMR uses four primary MongoDB collections:

- `users`
- `invitations`
- `reports`
- `auditEvents`

Responses and revisions remain embedded within reports because they share the report's authorization boundary and lifecycle and because expected conversation sizes are modest. Invitations require independent expiry and lookup behavior. Audit events require append-only storage, independent retention and pastor-facing filtering.

The expected 100–500 leader scale does not require separate services, queues or databases in the first release.

## 12. Application architecture

The production deployment remains a single Node.js application. Express exposes `/api`, serves `frontend/dist` and returns the React application for non-API routes.

Backend feature boundaries:

- Authentication
- Invitations
- Reports
- Notifications/read state
- Users
- Audit

Controllers validate transport input and format HTTP responses. Service modules own workflows and authorization rules. Models own persistence and indexes. Middleware establishes authenticated identity, CSRF validation and coarse role gates.

Frontend feature boundaries mirror the user journeys:

- Entry and authentication
- Invitation onboarding
- Leader home and reports
- Pastor overview and reports
- Invitations and account security
- Profile and recovery
- Shared TGN design system

## 13. Request data flow

A protected report mutation follows this sequence:

1. The React client sends validated data with credentials and CSRF protection.
2. Express authentication resolves and validates the active session.
3. Validation rejects malformed or oversized input.
4. The report service checks role, ownership, lifecycle state and allowed transition.
5. MongoDB persists the report mutation and revision when applicable.
6. The audit service records metadata-only activity.
7. The controller returns a sanitized response object.
8. The client updates status, unread indicators and accessible success feedback.

Security-critical operations do not report success if their required audit event cannot be persisted.

## 14. Error handling and privacy

API failures use stable error codes with plain-language messages. Field validation returns field-specific feedback. Login, invitation and recovery failures use neutral messages to prevent account discovery.

The frontend preserves unsent report and response text when a retryable network or database error occurs. It distinguishes validation failures, expired sessions, forbidden access, missing records and temporary service failures without exposing implementation details.

Server logs and monitoring redact authorization headers, cookies, tokens, secrets, report fields and response text. Unexpected production errors return a generic request identifier rather than a stack trace.

## 15. Mobile-first TGN design system

The interface uses the actual public TGN logo from `tgn-web-app/public/logo.svg` and copies that asset into CMR during implementation so CMR does not depend on another running application.

Approved visual language:

- Deep navy `#0c0e1c`
- Electric blue `#1a80e6`
- Light-blue gradient accents including `#51a2ff`
- White and pale-blue content surfaces
- Sora headings and Poppins supporting text
- Rounded cards, pill buttons and restrained shadows

The design draws from the regular TGN public web application, not an admin interface.

### 15.1 Mobile behavior

- Design and browser tests begin at phone widths.
- Touch targets are at least 44 by 44 CSS pixels.
- Forms are single column.
- Report creation is a three-step flow.
- Lists use compact report cards rather than horizontally scrolling tables.
- Primary actions may remain sticky where they do not obscure content.
- Essential behavior never depends on hover.
- Leader bottom navigation: Home, Reports, Create and Profile.
- Pastor bottom navigation: Overview, Reports, Invitations, Security and Profile.

### 15.2 Desktop behavior

Desktop expands the same content hierarchy into a sidebar, wider report lists and split conversation/detail views. It does not introduce a separate admin visual system or desktop-only pastor capabilities.

### 15.3 Accessibility

- Semantic landmarks, headings, labels and buttons
- Visible keyboard focus
- Keyboard-operable navigation and dialogs
- Sufficient text and control contrast
- Screen-reader announcements for errors, status and saved changes
- Reduced-motion support
- Plain-language copy
- No state communicated by color alone

## 16. Entry experience

CMR is not linked from the public TGN website. Visiting the root address displays a discreet TGN-branded sign-in page without public registration or a detailed explanation of the confidential ministry.

Registration is reachable only through a valid invitation URL. Invalid invitation URLs show a neutral failure screen and direct the person to contact the pastor outside the application.

## 17. Production configuration and deployment

Production uses one HTTPS domain and one deployable artifact:

1. Install root and frontend dependencies.
2. Build the React frontend into `frontend/dist`.
3. Start Express.
4. Express serves both the API and built frontend.

MongoDB Atlas provides the database connection string. The hosting provider's secret store contains:

- MongoDB connection string
- Session/JWT signing secrets
- CSRF secret
- TOTP encryption key
- Pastor bootstrap credentials
- Environment and cookie configuration

Startup validation rejects missing, default or insufficiently strong production secrets.

Operational requirements:

- HTTPS-only production traffic
- Restricted MongoDB network access
- Automated encrypted database backups
- A documented and tested restoration procedure
- Liveness and readiness endpoints
- Content-redacted structured logging
- Error monitoring configured to exclude request bodies and secrets

## 18. Testing strategy

### 18.1 Unit tests

- Invitation expiry, revocation and regeneration
- Report lifecycle transitions
- Ownership decisions
- TOTP verification
- Recovery-code consumption
- Pastor-assisted reset expiry and use
- Audit redaction

### 18.2 API integration tests

- Invitation redemption and replay prevention
- Authentication, CSRF and session revocation
- Full leader-versus-leader authorization matrix
- Pastor access and leader restrictions
- Report creation, editing, revision integrity, response and archival
- Brute-force limits
- Security audit creation without sensitive content

Integration tests use an isolated temporary MongoDB database.

### 18.3 Browser and accessibility tests

- Complete leader journey at phone width
- Complete pastor journey at phone width
- Responsive desktop variants
- Expired session and retry behavior without losing form text
- Keyboard navigation
- Automated accessibility checks and manual screen-reader spot checks

### 18.4 Production checks

- Frontend lint and production build
- Server syntax and startup configuration
- Single-origin static frontend and API smoke test
- Health and readiness behavior
- Backup restoration exercise before broad rollout

## 19. Pilot and success criteria

The first release is limited to 10–20 trusted church leaders and the lead pastor. The pilot validates:

- Successful invitation delivery and redemption through personal sharing
- Reliable sign-in, TOTP and recovery
- Comfortable phone use for both roles
- Successful report creation and pastor response
- Correct lifecycle and archive behavior
- Understandable revision history
- Useful audit review
- Zero cross-account authorization failures
- Zero sensitive-content leakage into logs or audit events

The application expands toward 100–500 leaders only after pilot feedback is resolved, backup restoration succeeds and authorization/security tests remain green.

## 20. Decisions summary

- Invitation-only registration with personally shared one-time links
- Seven-day invitation expiry with revocation and regeneration
- One lead pastor only
- All reports identified
- Archived closed matters remain privately readable
- In-app notifications only
- Pastor-assisted recovery after personal verification
- Immutable edit history for open reports
- No attachments in the first release
- Full mobile functionality for both roles
- Mandatory pastor TOTP; optional leader TOTP
- Pastor-visible metadata-only security audit
- Completely separate application with no public TGN link
- Discreet sign-in at the root address
- Mobile-first public TGN theme using the actual TGN logo
- Secure evolution of the current codebase
- Pilot with 10–20 leaders before broader rollout
