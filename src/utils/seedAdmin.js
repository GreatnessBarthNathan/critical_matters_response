const User = require('../models/User');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('Admin bootstrap skipped: ADMIN_EMAIL and ADMIN_PASSWORD are not both set.');
    return;
  }

  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      console.log(`Existing account promoted to admin: ${email}`);
    }
    return;
  }

  await User.create({
    firstName: process.env.ADMIN_FIRST_NAME || 'Lead',
    lastName: process.env.ADMIN_LAST_NAME || 'Pastor',
    email,
    password,
    role: 'admin',
  });
  console.log(`Admin account created: ${email}`);
}

module.exports = seedAdmin;
