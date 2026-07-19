import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../models/User';
import { requireScriptSecret } from './require-script-secret';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error('Usage: USER_NEW_PASSWORD=<secret-manager-value> npm run user:set-password -- <email>');
    process.exit(1);
  }

  const newPassword = requireScriptSecret('USER_NEW_PASSWORD');

  await connectDatabase();

  try {
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.error(`User not found: ${email}`);
      process.exitCode = 1;
      return;
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    console.log(`Password updated successfully for ${email}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (error) => {
  console.error('Failed to set user password:', error);
  await disconnectDatabase();
  process.exit(1);
});
