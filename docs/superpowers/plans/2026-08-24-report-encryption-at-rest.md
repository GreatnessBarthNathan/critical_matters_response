# Report Encryption at Rest Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: Encrypt report prose at rest in MongoDB while preserving ordinary leader and Pastor login-and-read workflows.

Architecture: A dedicated AES-256-GCM report-encryption utility loads a versioned keyring from deployment secrets and encrypts individual report text fields with field-specific authenticated data. The report service validates and authorises plaintext before writing ciphertext, then decrypts only authorised query results into response objects. An explicit, idempotent migration converts existing reports; legacy reads are permitted only while a temporary deployment flag is enabled.

Tech Stack: Node.js 20, Express 5, Mongoose/MongoDB, Node crypto AES-256-GCM, Node test runner, Supertest, React/Vite.

---

## File structure

| Path | Responsibility |
| --- | --- |
| src/utils/reportEncryption.js | Validates the report keyring and encrypts/decrypts versioned AES-GCM envelopes. |
| src/config/env.js | Validates report-encryption deployment variables and the temporary legacy-read flag. |
| src/models/Report.js | Stores ciphertext safely and gives revisions stable subdocument IDs. |
| src/services/reportService.js | Encrypts on writes, decrypts authorised read models, and restricts encrypted-field searching. |
| src/utils/migrateReportEncryption.js | Performs idempotent dry-run, migration, verification, and rewrap operations without printing prose. |
| scripts/migrate-report-encryption.js | Command-line entry point for the controlled migration. |
| test/crypto.test.js, test/env.test.js, test/reports.test.js, test/migration.test.js | Unit, configuration, API, and migration regression coverage. |
| frontend/src/pages/*.jsx | Accurate encrypted-at-rest and reference-search copy. |
| .env.example, README.md, package.json | Deployment configuration, runbook, and migration scripts. |

### Task 1: Add a versioned report-encryption keyring

Files:
- Create: src/utils/reportEncryption.js
- Modify: src/config/env.js
- Modify: test/helpers/testApp.js
- Modify: test/crypto.test.js
- Modify: test/env.test.js

- [ ] Step 1: Write failing envelope and configuration tests.

Set a base64 32-byte REPORT_ENCRYPTION_KEY and REPORT_ENCRYPTION_KEY_ID=2026-08. Assert a plaintext round trip, different ciphertext for duplicate plaintext, tamper rejection, unknown-key rejection, malformed-key rejection, and production startup rejection when the key is absent.

    const encrypted = encryptReportValue('A confidential title', 'report:507f1f77bcf86cd799439011:title');
    assert.notEqual(encrypted, 'A confidential title');
    assert.equal(decryptReportValue(encrypted, 'report:507f1f77bcf86cd799439011:title'), 'A confidential title');
    assert.throws(() => decryptReportValue(encrypted + 'x', 'report:507f1f77bcf86cd799439011:title'));

- [ ] Step 2: Run node --test --test-concurrency=1 test/crypto.test.js test/env.test.js.

Expected: FAIL because the report keyring and production configuration do not exist.

- [ ] Step 3: Create src/utils/reportEncryption.js with this public API:

    function getReportKeyring(env = process.env) {}
    function encryptReportValue(plaintext, aad, env = process.env) {}
    function decryptReportValue(envelope, aad, env = process.env) {}
    function isEncryptedReportValue(value) {}
    module.exports = { getReportKeyring, encryptReportValue, decryptReportValue, isEncryptedReportValue };

Use AES-256-GCM, 12-byte random IVs, 16-byte tags, and cipher.setAAD/decipher.setAAD. Use envelope format cmr-report.v1.<keyId>.<iv>.<tag>.<ciphertext>. Require a canonical base64 32-byte current key and a URL-safe key ID. Parse REPORT_ENCRYPTION_PREVIOUS_KEYS as comma-separated <key-id>:<base64-key> pairs; reject duplicates and malformed values without exposing keys or plaintext.

- [ ] Step 4: Extend getConfig to require REPORT_ENCRYPTION_KEY and REPORT_ENCRYPTION_KEY_ID in production and accept REPORT_ENCRYPTION_ALLOW_LEGACY_READ only as true or false. Add deterministic test defaults:

    process.env.REPORT_ENCRYPTION_KEY ||= Buffer.alloc(32, 11).toString('base64');
    process.env.REPORT_ENCRYPTION_KEY_ID ||= 'test-current';
    process.env.REPORT_ENCRYPTION_ALLOW_LEGACY_READ ||= 'true';

- [ ] Step 5: Run the focused tests again; expect PASS. Commit:

    git add src/utils/reportEncryption.js src/config/env.js test/helpers/testApp.js test/crypto.test.js test/env.test.js
    git commit -m "feat: add report encryption keyring"

### Task 2: Prepare the report model for encrypted text

Files:
- Modify: src/models/Report.js
- Modify: test/reports.test.js

- [ ] Step 1: Write a failing model test that persists encrypted title, content, response, and revision values. Assert the schema accepts ciphertext larger than plaintext and a new revision receives a stable _id.

    assert.ok(report.revisions[0]._id);
    assert.equal(report.title.startsWith('cmr-report.v1.'), true);

- [ ] Step 2: Run node --test --test-concurrency=1 --test-name-pattern='encrypted report fields' test/reports.test.js.

Expected: FAIL because revisions suppress _id and current plaintext field limits reject valid envelopes.

- [ ] Step 3: Keep plaintext limits in reportService; increase persisted ciphertext limits to title 512, content 15000, and response message 8000. Remove _id:false from revisionSchema, retain _id:false for changed-field objects, and preserve every append-only revision guard.

- [ ] Step 4: Rerun the focused test; expect PASS. Commit:

    git add src/models/Report.js test/reports.test.js
    git commit -m "feat: prepare reports for encrypted text"

### Task 3: Encrypt writes and decrypt only authorised response models

Files:
- Modify: src/services/reportService.js
- Modify: test/reports.test.js
- Modify: test/authorization.test.js

- [ ] Step 1: Add failing API coverage: create, edit, and reply as leader and Pastor; query Report.collection.findOne and assert raw MongoDB does not contain submitted title, content, reply, or revision text. Assert owner/Admin API responses retain plaintext. Assert Tech Support gets 403 before a decrypt helper is reached.

- [ ] Step 2: Run node --test --test-concurrency=1 --test-name-pattern='ciphertext at rest|tech support is denied every report operation' test/reports.test.js test/authorization.test.js.

Expected: FAIL because reports are currently stored as plaintext.

- [ ] Step 3: Implement field-aware helpers that clone response objects before decryption:

    function reportAad(reportId, kind, itemId = '') {}
    function encryptTextField(reportId, kind, plaintext, itemId) {}
    function decryptTextField(reportId, kind, envelope, itemId) {}
    function toReportResponse(report) {}

Allocate report IDs before title/content encryption. Allocate response and revision IDs before their text encryption. Bind title, content, response, and revision:<field>:previous|next values to their report and subdocument IDs. Encrypt only title/content revision values; leave category, sensitivity, and urgency revision values as operational metadata.

- [ ] Step 4: Encrypt after plaintext validation and access checks in createReport, editReport, and respond. Return decrypted clones from create, list, get, edit, respond, transition, and getStats recent. Never save a decrypted clone.

For a non-envelope value, allow legacy passthrough only when REPORT_ENCRYPTION_ALLOW_LEGACY_READ is true; otherwise throw REPORT_DECRYPTION_FAILED with status 503. Restrict search to plaintext reference only and remove MongoDB title/content search.

- [ ] Step 5: Run node --test --test-concurrency=1 test/reports.test.js test/authorization.test.js; expect PASS. Commit:

    git add src/services/reportService.js test/reports.test.js test/authorization.test.js
    git commit -m "feat: encrypt report content at rest"

### Task 4: Add controlled migration and verification tooling

Files:
- Create: src/utils/migrateReportEncryption.js
- Create: scripts/migrate-report-encryption.js
- Modify: package.json
- Modify: test/migration.test.js

- [ ] Step 1: Seed raw legacy reports with plaintext title, content, response message, and revision values. Write failing tests for dry-run with no writes, migration, idempotent rerun, verification, and key-based rewrap. Results expose counts only.

    assert.equal((await migrateReportEncryption({ dryRun: true })).fields, 0);
    assert.equal((await migrateReportEncryption()).fields, 4);
    assert.deepEqual(await verifyReportEncryption(), { scanned: 1, remainingLegacyFields: 0 });

- [ ] Step 2: Run node --test --test-concurrency=1 test/migration.test.js.

Expected: FAIL because no report-encryption migration exists.

- [ ] Step 3: Implement migrateReportEncryption({ dryRun = false, batchSize = 100, rewrap = false }) and verifyReportEncryption(). Read raw documents via Report.collection, identify values without the envelope prefix or an old key during rewrap, and encrypt using the same AAD. Update documents with a compare-and-set filter containing _id and updatedAt; reread and retry conflicts rather than overwriting concurrent writes.

Implement a CLI that accepts --dry-run, --verify, --rewrap, and --batch-size=<1..1000>, requires MONGODB_URI, prints JSON counts only, and disconnects on both success and failure. It is never auto-run on startup. Add the package script:

    "migrate:report-encryption": "node scripts/migrate-report-encryption.js"

- [ ] Step 4: Rerun the migration test; expect PASS. Commit:

    git add src/utils/migrateReportEncryption.js scripts/migrate-report-encryption.js package.json test/migration.test.js
    git commit -m "feat: add report encryption migration"

### Task 5: Make user copy and deployment guidance accurate

Files:
- Modify: .env.example
- Modify: README.md
- Modify: frontend/src/pages/ReportsPage.jsx
- Modify: frontend/src/pages/LoginPage.jsx
- Modify: frontend/src/pages/CreateReportPage.jsx
- Modify: test/client.test.js

- [ ] Step 1: Add failing client assertions that report search says Search by reference and security wording says Private and encrypted in transit and at rest. Assert no user-facing copy claims E2EE.

- [ ] Step 2: Run node --test --test-concurrency=1 test/client.test.js.

Expected: FAIL because current copy promises subject search and session encryption.

- [ ] Step 3: Add these deployment variables and document generation, encrypted backup, dry-run, migration, verification, disabling legacy reads, and key rotation:

    REPORT_ENCRYPTION_KEY=base64-encoded-32-byte-key
    REPORT_ENCRYPTION_KEY_ID=2026-08
    REPORT_ENCRYPTION_PREVIOUS_KEYS=
    REPORT_ENCRYPTION_ALLOW_LEGACY_READ=false

State clearly that this is encryption in transit and at rest, not E2EE; losing every key copy makes report prose unrecoverable.

- [ ] Step 4: Run node --test --test-concurrency=1 test/client.test.js && npm run check; expect PASS. Commit:

    git add .env.example README.md frontend/src/pages/ReportsPage.jsx frontend/src/pages/LoginPage.jsx frontend/src/pages/CreateReportPage.jsx test/client.test.js
    git commit -m "docs: explain report encryption deployment"

### Task 6: Complete release validation

Files:
- Modify: test/crypto.test.js
- Modify: test/reports.test.js
- Modify: README.md

- [ ] Step 1: Add a rotation regression: encrypt a field with a previous key, configure it in REPORT_ENCRYPTION_PREVIOUS_KEYS, read it, rewrap it, then prove raw ciphertext uses the current key ID. Add a legacy-read-disabled API assertion returning safe 503.

- [ ] Step 2: Run node --test --test-concurrency=1 --test-name-pattern='rotation|legacy read' test/crypto.test.js test/reports.test.js test/migration.test.js; expect PASS.

- [ ] Step 3: Run full release validation:

    npm test
    npm run check
    npm run smoke

Expected: all tests pass, frontend lint/build passes, and production SPA/API routing smoke coverage passes.

- [ ] Step 4: Commit:

    git add test/crypto.test.js test/reports.test.js README.md
    git commit -m "test: cover report encryption rotation"

## Self-review

Spec coverage: Tasks 1–3 provide authenticated encryption and all authorised report read/write paths. Task 4 handles existing records, dry runs, verification, and rotation. Task 5 provides accurate wording and an operator runbook. Task 6 proves rollback-safe failures and release readiness.

All planned APIs, keys, flags, envelope format, CLI flags, and keyring format use the same names throughout. The plan removes title/body MongoDB search and preserves Tech Support’s existing report denial. No audit, error, log, or push payload contains report prose.
