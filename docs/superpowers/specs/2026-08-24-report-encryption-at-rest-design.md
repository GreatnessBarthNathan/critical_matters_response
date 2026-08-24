# Report Encryption at Rest Design

## Status

Approved on 2026-08-24.

## Goal

Protect the private text of church matters in MongoDB while keeping the Pastor's experience simple: the Pastor signs in normally on any authorised device and can immediately read reports. This is encryption in transit and at rest, not end-to-end encryption.

## Scope

- Encrypt all new and existing report text before it is stored in MongoDB.
- Keep current user and Admin/Pastor report workflows unchanged.
- Preserve the existing Tech Support boundary: it cannot retrieve report data or decrypted text.
- Provide safe, explicit data migration and encryption-key rotation.

## Non-goals

- End-to-end encryption or user-managed decryption keys.
- A recovery phrase, device-approval flow, or other technical requirement for the Pastor.
- Encrypting dashboard operational metadata required for filtering and triage.

## Threat model and terminology

The application will use authenticated encryption at rest to protect data in a leaked MongoDB database, backup, or read-only database export. HTTPS protects data in transit. The Node application holds the report-encryption key in its production environment and therefore can decrypt authorised reports; this design must not be presented as end-to-end encryption.

The application already enforces owner-or-Admin report access and rejects Tech Support from report routes. Encryption is an additional protection layer and does not replace those authorisation checks.

## Data classification

### Encrypted fields

- `Report.title`
- `Report.content`
- `Report.responses[].message`
- Textual revision values, including previous and next title/content values

Every encrypted value uses a fresh random nonce and an authenticated-encryption tag. Plaintext limits and validation run before encryption.

### Operational metadata retained as plaintext

- Report ID and reference
- Owner ID
- Category, sensitivity, urgency, priority weight, and status
- Created, updated, and last-activity timestamps
- Read-state timestamps
- Response author IDs, author roles, and response timestamps
- Revision number, editor ID, field name, and timestamp

This permits status queues, priority sorting, pagination, ownership enforcement, and generic push notifications without exposing report prose in the database.

## Key management

The deployment supplies a base64-encoded 32-byte `REPORT_ENCRYPTION_KEY` through its secret environment configuration. It is never persisted to MongoDB, returned by an API, logged, or committed to source control.

The server validates the key at startup and refuses to run in production if it is missing or malformed. Deployment operators must keep an offline, access-controlled backup of the key; losing every copy makes encrypted report text unrecoverable.

Encrypted payloads record a non-secret encryption version/key identifier. Rotation uses a new current key plus a temporary previous key. Reads accept both versions after access checks; an explicit rotation job re-encrypts old-version fields with the current key. The previous key is removed only after verification that no old-version ciphertext remains.

## Encryption and access flow

1. A leader submits a report or reply through the normal authenticated API.
2. The application validates the plaintext, authorises the actor, and encrypts sensitive fields before persistence.
3. MongoDB receives ciphertext and non-sensitive metadata only.
4. On a report read, the application first constrains the query to the owner or Admin/Pastor. It then decrypts only the returned report's sensitive fields.
5. Tech Support is rejected by report-route middleware before a report query or decrypt operation.
6. Push notifications stay generic and contain no report title, content, or reply text.

Edits, responses, and report revisions follow the same pattern. Plaintext must never be inserted into audit metadata, errors, or server logs.

## Existing-report migration

The release includes an explicit migration command, not an automatic startup migration.

1. The operator creates and verifies an encrypted MongoDB backup.
2. A dry run reports eligible document and field counts without reading or printing their content.
3. The migration converts unversioned plaintext report fields in bounded, idempotent batches.
4. Each successfully converted field is marked with its encryption version so a rerun skips it.
5. The application temporarily supports legacy plaintext reads only during the controlled migration window. It always writes new or edited values encrypted.
6. A verification command confirms no plaintext sensitive fields remain. Only then can legacy-read support be removed.

Migration logs contain IDs and aggregate counts only; they never contain titles, report bodies, response messages, or revision values.

## Failure handling

- Encryption failure prevents the write; no partially encrypted report is saved.
- Decryption failure returns a safe unavailable-message response and records technical diagnostics without plaintext.
- Authentication and authorisation failure happens before decryption.
- An unavailable or malformed report key prevents production startup.
- Password reset, account activation, Tech Support reset-code issuance, and device changes do not alter encrypted historical reports or their readability for an authorised Pastor.

## User experience and copy

No additional setup is shown to leaders or the Pastor. They continue to sign in, submit, read, edit, and reply as they do today.

Security copy may say “private and encrypted,” “encrypted in transit,” or “encrypted at rest.” It must not claim end-to-end encryption.

## Verification

Automated coverage will prove that:

- persisted report, response, and revision prose is ciphertext, not plaintext;
- owners and Admin/Pastor retain all authorised report actions;
- Tech Support cannot retrieve encrypted or decrypted report content through UI or API routes;
- normal report creation, editing, replies, archival, and revision history round-trip correctly;
- migration is idempotent and correctly handles existing reports, replies, and revisions;
- missing, malformed, and incorrect keys fail safely;
- key rotation reads old ciphertext, writes current ciphertext, and completes only after all records are re-encrypted;
- logs, audit events, and push payloads do not contain plaintext report content.

## Rollout

1. Add the new encryption key to deployment secrets and verify startup in a staging copy of the database.
2. Deploy application support for encrypted reads and writes.
3. Back up production, dry-run the migration, run it, and verify results.
4. Monitor decrypt and migration error counters without collecting report content.
5. Remove temporary legacy plaintext-read support only after verification.
