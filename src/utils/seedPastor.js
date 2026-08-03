const User = require('../models/User');
const generateRecoveryKey = require('./recoveryKey');

async function seedPastor() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('Pastor bootstrap skipped: ADMIN_EMAIL and ADMIN_PASSWORD are not both set.');
    return;
  }

  const existing = await User.findOne({ email }).select('+password +recoveryKeyHash');
  if (existing) {
    if (existing.role !== 'pastor') {
      existing.role = 'pastor';
      await existing.save();
      console.log(`Existing account promoted to pastor: ${email}`);
    }
    return;
  }

  await User.create({
    firstName: process.env.ADMIN_FIRST_NAME || 'Lead',
    lastName: process.env.ADMIN_LAST_NAME || 'Pastor',
    email,
    password,
    recoveryKeyHash: generateRecoveryKey(),
    role: 'pastor',
  });
  console.log(`Pastor account created: ${email}`);
}

module.exports = seedPastor;
