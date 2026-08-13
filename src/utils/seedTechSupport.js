const User = require('../models/User');

// Optional one-time bootstrap for the restricted operational role. The role never receives
// report access, regardless of how it is provisioned.
async function seedTechSupport() {
  const email = process.env.TECH_SUPPORT_EMAIL?.trim().toLowerCase();
  const password = process.env.TECH_SUPPORT_PASSWORD;
  if (!email || !password) return;

  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    if (existing.role !== 'tech_support') {
      existing.role = 'tech_support';
      await existing.save();
      console.log(`Existing account assigned to tech support: ${email}`);
    }
    return;
  }

  await User.create({
    firstName: process.env.TECH_SUPPORT_FIRST_NAME || 'Tech',
    lastName: process.env.TECH_SUPPORT_LAST_NAME || 'Support',
    email,
    password,
    role: 'tech_support',
  });
  console.log(`Tech support account created: ${email}`);
}

module.exports = seedTechSupport;
