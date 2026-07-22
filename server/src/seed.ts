import mongoose from 'mongoose';
import { User, UserRole, UserStatus } from './models/User';
import { config } from './config/environment';

async function seed() {
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to MongoDB');

  // Check if admin already exists
  const existing = await User.findOne({ email: 'admin@hrflowpro.com' });
  if (existing) {
    console.log('Admin user already exists:', existing.email);
    // Update to ACTIVE status just in case
    existing.status = UserStatus.ACTIVE;
    await existing.save();
    console.log('Updated admin status to ACTIVE');
    await mongoose.disconnect();
    return;
  }

  const admin = await User.create({
    email: 'admin@hrflowpro.com',
    username: 'admin',
    password: 'Password123!',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    profile: {
      firstName: 'Super',
      lastName: 'Admin',
      phone: '+91-9999999999',
    },
    permissions: [],
    security: {
      failedLoginAttempts: 0,
      twoFactorEnabled: false,
      sessionTokens: [],
    },
  });

  console.log('Created admin user:', admin.email);
  console.log('Password: Password123!');

  await mongoose.disconnect();
  console.log('Done!');
}

seed().catch(console.error);
