# Report Encryption at Rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with checkpoints.

**Goal:** Encrypt report prose at rest in MongoDB while preserving ordinary login and report workflows for leaders and the Pastor.

**Architecture:** Add a versioned AES-256-GCM envelope for report title, body, replies, and revision values. Keep report authorization unchanged and decrypt only after an owner/Admin access query. Add explicit configuration validation, a repeatable migration/verification CLI, and key-rotation support with a current and previous key.

**Tech Stack:** Node.js, Express, Mongoose/MongoDB, Node `crypto`, React/Vite, Node test runner, MongoDB transactions.

---

### Task 1: Add report-encryption configuration and crypto primitives

**Files:**
- Modify: `src/config/env.js`
- Modify: `.env.example`
- Modify: `src/utils/crypto.js`
- Create: `src/utils/reportEncryption.js`
- Test: `test/env.test.js`
- Test: `test/reportEncryption.test.js`

- [ ] **Step 1: Write failing key-validation tests**

Add tests that require `REPORT_ENCRYPTION_KEY` in production, reject non-canonical Base64 and non-32-byte values, and permit a distinct optional `REPORT_ENCRYPTION_PREVIOUS_KEY` only when it is valid.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test --test-concurrency=1 test/env.test.js test/reportEncryption.test.js`

Expected: failure because report-key validation and report encryption helpers do not exist.

- [ ] **Step 3: Implement the versioned AES-256-GCM envelope**

Use a payload shaped like `{ v: 1, k: "current", iv, tag, data }`, where `iv` is 12 random bytes, `tag` is the 16-byte GCM authentication tag, and all binary values are base64url. Expose `encryptReportValue(value)`, `decryptReportValue(value)`, `isEncryptedReportValue(value)`, and `decryptLegacyOrEncryptedValue(value)`. Use `REPORT_ENCRYPTION_KEY` and an optional previous key; never return plaintext from error messages.

- [ ] **Step 4: Add environment documentation**

Add `REPORT_ENCRYPTION_KEY` and optional `REPORT_ENCRYPTION_PREVIOUS_KEY` generation examples to `.env.example` and document that production startup requires the current key.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test --test-concurrency=1 test/env.test.js test/reportEncryption.test.js`

Expected: all focused tests pass, including tamper rejection, current/previous-key reads, and legacy plaintext detection.

Commit: `feat: add versioned report encryption primitives`

### Task 2: Store encrypted report content and decrypt authorised responses

**Files:**
- Modify: `src/models/Report.js`
- Modify: `src/services/reportService.js`
- Modify: `src/controllers/reportController.js` only if response shaping needs a helper
- Test: `test/reports.test.js`

- [ ] **Step 1: Add persistence and API round-trip tests**

Create a report, fetch it as its owner and Admin, and assert both receive original plaintext while a direct Mongo document inspection contains encrypted wrappers for title/content, response messages, and revision previous/next values. Assert Tech Support still receives the existing denial and no report query/decrypt path is reachable.

- [ ] **Step 2: Run the focused report tests and confirm the new assertions fail**

Run: `node --test --test-concurrency=1 test/reports.test.js`

Expected: new ciphertext assertions fail against the current plaintext schema.

- [ ] **Step 3: Add focused model helpers**

Define `Report.ENCRYPTED_FIELDS` and helpers in `reportService` that encrypt a report before persistence and decrypt a hydrated report after authorization. Encrypt response messages and revision changed values recursively without encrypting metadata. Keep `Report` validation limits on plaintext before encryption, and avoid applying Mongoose `trim` to ciphertext after the value is encrypted.

- [ ] **Step 4: Apply helpers to every write/read path**

Use the helpers in create, list, get, edit, respond, and status/read-state flows. Ensure audit metadata receives only field names and never values. Ensure push payloads remain generic.

- [ ] **Step 5: Run focused report/security tests and commit**

Run: `node --test --test-concurrency=1 test/reports.test.js test/authorization.test.js test/notifications.test.js`

Expected: report round-trips pass, Mongo plaintext assertions pass, Tech Support remains denied, and notifications remain content-free.

Commit: `feat: encrypt report content at rest`

### Task 3: Validate production configuration and safe failures

**Files:**
- Modify: `src/config/env.js`
- Modify: `server.js`
- Test: `test/env.test.js`
- Test: `test/server.test.js` or the existing server/config test file

- [ ] **Step 1: Add startup behavior tests**

Assert production configuration rejects a missing or malformed current report key before MongoDB connection, while development/test configuration can use the test key. Assert a wrong key produces a safe unavailable-message error without returning ciphertext or the underlying crypto exception.

- [ ] **Step 2: Implement startup validation and stable error mapping**

Call report-key validation with the existing config validation before `connectDatabase()`. Map decrypt failures to the existing safe service error envelope and log only a correlation ID and technical code.

- [ ] **Step 3: Run the focused suite and commit**

Run: `node --test --test-concurrency=1 test/env.test.js test/server.test.js`

Expected: all configuration and safe-failure tests pass.

Commit: `feat: fail safely when report encryption is unavailable`

### Task 4: Build idempotent existing-report migration and verification commands

**Files:**
- Create: `src/utils/migrateReportEncryption.js`
- Create: `src/utils/verifyReportEncryption.js`
- Modify: `package.json` scripts
- Test: `test/reportEncryptionMigration.test.js`
- Modify: `README.md`

- [ ] **Step 1: Write migration tests against plaintext fixtures**

Seed reports containing legacy plaintext title/content, replies, and revision values. Assert dry-run returns counts without changing data, migration encrypts every sensitive field, rerunning changes nothing, and verification reports zero plaintext sensitive fields. Assert metadata remains queryable.

- [ ] **Step 2: Implement bounded, idempotent migration**

Process reports in deterministic `_id` batches. Convert only unversioned sensitive values, save each report in a transaction where available, and skip already encrypted values. Emit aggregate counts and IDs only; never print content.

- [ ] **Step 3: Implement verification**

Scan all reports and return non-zero exit status if any sensitive field is legacy plaintext or malformed ciphertext. Include counts and report IDs only.

- [ ] **Step 4: Add scripts and operator documentation**

Add `npm run migrate:report-encryption -- --dry-run`, `npm run migrate:report-encryption`, and `npm run verify:report-encryption`. Document encrypted backup, staging dry run, production run, verification, and temporary legacy-read window.

- [ ] **Step 5: Run migration tests and commit**

Run: `node --test --test-concurrency=1 test/reportEncryptionMigration.test.js`

Expected: dry run, conversion, rerun, and verification all pass.

Commit: `feat: add report encryption migration tools`

### Task 5: Add key rotation support

**Files:**
- Modify: `src/utils/reportEncryption.js`
- Create: `src/utils/rotateReportEncryption.js`
- Modify: `package.json`
- Test: `test/reportEncryptionRotation.test.js`
- Modify: `README.md`

- [ ] **Step 1: Add rotation tests**

Encrypt a report with the previous key, set current and previous environment keys, assert reads succeed, rotate it, and assert the new envelope uses the current key. Assert removing the previous key after verification still permits reads.

- [ ] **Step 2: Implement bounded rotation**

Add an idempotent rotation command that rewrites only old-version ciphertext, reports counts, and never emits plaintext. Require both current and previous key configuration during rotation.

- [ ] **Step 3: Run tests and commit**

Run: `node --test --test-concurrency=1 test/reportEncryptionRotation.test.js test/reportEncryption.test.js`

Expected: all rotation and envelope tests pass.

Commit: `feat: support report encryption key rotation`

### Task 6: Update user-facing security copy and complete verification

**Files:**
- Modify: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/src/pages/CreateReportPage.jsx`
- Modify: `README.md`
- Test: existing frontend lint/build and full Node suite

- [ ] **Step 1: Replace inaccurate E2EE wording**

Use “Private and encrypted” or “Encrypted in transit and at rest.” Do not use “end-to-end encrypted.” Keep the Pastor and leader workflow unchanged.

- [ ] **Step 2: Run verification**

Run: `npm run check` and `npm test`.

Expected: frontend lint/build pass and the complete test suite passes with report ciphertext, migration, rotation, authorization, and notification coverage.

- [ ] **Step 3: Commit final integration**

Commit: `feat: complete encrypted report storage rollout`
