const User = require('../models/User');
const Report = require('../models/Report');
const AuditEvent = require('../models/AuditEvent');

const LEGACY_CATEGORIES = ['family', 'health', 'financial', 'ministry', 'relationship', 'other'];

/**
 * Converts records produced before the admin/user and general/sensitive vocabulary change.
 * It is idempotent, so it is safe to run as part of a controlled deployment more than once.
 */
async function migrateRolesAndCategories() {
  const [users, auditEvents, responseRoles, sensitiveCategories, generalCategories] = await Promise.all([
    User.collection.updateMany({ role: 'pastor' }, { $set: { role: 'admin' } }),
    AuditEvent.collection.updateMany({ actorRole: 'pastor' }, { $set: { actorRole: 'admin' } }),
    Report.collection.updateMany(
      { 'responses.authorRole': 'pastor' },
      { $set: { 'responses.$[response].authorRole': 'admin' } },
      { arrayFilters: [{ 'response.authorRole': 'pastor' }] },
    ),
    Report.collection.updateMany(
      { category: { $in: LEGACY_CATEGORIES }, sensitivity: 'private' },
      { $set: { category: 'sensitive' } },
    ),
    Report.collection.updateMany(
      { category: { $in: LEGACY_CATEGORIES }, sensitivity: { $ne: 'private' } },
      { $set: { category: 'general' } },
    ),
  ]);

  return {
    users: users.modifiedCount,
    auditEvents: auditEvents.modifiedCount,
    responseRoles: responseRoles.modifiedCount,
    sensitiveCategories: sensitiveCategories.modifiedCount,
    generalCategories: generalCategories.modifiedCount,
  };
}

module.exports = { migrateRolesAndCategories };
