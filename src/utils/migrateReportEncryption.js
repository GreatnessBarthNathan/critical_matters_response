const Report = require('../models/Report');
const {
  encryptReportValue,
  isEncryptedReportValue,
  decryptReportValue,
} = require('./reportEncryption');

function eachSensitiveValue(report, visit) {
  for (const field of ['title', 'content']) visit(report[field], (value) => { report[field] = value; });
  for (const response of report.responses || []) {
    visit(response.message, (value) => { response.message = value; });
  }
  for (const revision of report.revisions || []) {
    for (const change of revision.changedFields || []) {
      if (!['title', 'content'].includes(change.field)) continue;
      visit(change.previousValue, (value) => { change.previousValue = value; });
      visit(change.nextValue, (value) => { change.nextValue = value; });
    }
  }
}

function encryptedFieldCount(report) {
  let count = 0;
  eachSensitiveValue(report, (value) => {
    if (typeof value === 'string' && isEncryptedReportValue(value)) count += 1;
  });
  return count;
}

function legacyFieldCount(report) {
  let count = 0;
  eachSensitiveValue(report, (value) => {
    if (typeof value === 'string' && !isEncryptedReportValue(value)) count += 1;
  });
  return count;
}

function encryptLegacyFields(report) {
  let converted = 0;
  eachSensitiveValue(report, (value, replace) => {
    if (typeof value === 'string' && !isEncryptedReportValue(value)) {
      replace(encryptReportValue(value));
      converted += 1;
    }
  });
  if (converted && report.$locals) report.$locals.allowEncryptedRevisionRewrite = true;
  return converted;
}

function verifyEncryptedFields(report) {
  let encrypted = 0;
  let invalid = 0;
  eachSensitiveValue(report, (value) => {
    if (typeof value !== 'string' || !isEncryptedReportValue(value)) {
      invalid += 1;
      return;
    }
    encrypted += 1;
    try {
      decryptReportValue(value);
    } catch (_error) {
      invalid += 1;
    }
  });
  return { encrypted, invalid };
}

function rotateEncryptedFields(report) {
  const currentId = process.env.REPORT_ENCRYPTION_KEY_ID || 'current';
  let rotated = 0;
  eachSensitiveValue(report, (value, replace) => {
    if (typeof value !== 'string' || !isEncryptedReportValue(value)) return;
    const keyId = value.split('.')[1];
    if (keyId === currentId) return;
    replace(encryptReportValue(decryptReportValue(value)));
    rotated += 1;
  });
  if (rotated && report.$locals) report.$locals.allowEncryptedRevisionRewrite = true;
  return rotated;
}

async function rotateReportEncryption() {
  const result = { reportsScanned: 0, reportsChanged: 0, fieldsRotated: 0 };
  const cursor = Report.find().cursor();
  for await (const report of cursor) {
    result.reportsScanned += 1;
    const rotated = rotateEncryptedFields(report);
    if (!rotated) continue;
    result.reportsChanged += 1;
    result.fieldsRotated += rotated;
    await report.save();
  }
  return result;
}

async function migrateReportEncryption({ dryRun = false } = {}) {
  const result = { dryRun, reportsScanned: 0, reportsChanged: 0, fieldsConverted: 0 };
  const cursor = Report.find().cursor();
  for await (const report of cursor) {
    result.reportsScanned += 1;
    if (dryRun) {
      result.fieldsConverted += legacyFieldCount(report);
      continue;
    }
    const converted = encryptLegacyFields(report);
    if (!converted) continue;
    result.fieldsConverted += converted;
    result.reportsChanged += 1;
    await report.save();
  }
  return result;
}

async function verifyReportEncryption() {
  const result = { reportsScanned: 0, encryptedFields: 0, invalidFields: 0, invalidReportIds: [] };
  const cursor = Report.find().lean().cursor();
  for await (const report of cursor) {
    result.reportsScanned += 1;
    const status = verifyEncryptedFields(report);
    result.encryptedFields += status.encrypted;
    result.invalidFields += status.invalid;
    if (status.invalid) result.invalidReportIds.push(String(report._id));
  }
  return result;
}

module.exports = {
  encryptedFieldCount,
  legacyFieldCount,
  migrateReportEncryption,
  rotateReportEncryption,
  verifyReportEncryption,
};
