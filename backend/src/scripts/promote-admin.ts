import { connectDb } from "../config/db";
import { UserModel } from "../models/User";

/**
 * Promote an existing user to admin:
 *   npx ts-node src/scripts/promote-admin.ts user@example.com
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx ts-node src/scripts/promote-admin.ts <email>");
    process.exit(1);
  }
  await connectDb();
  const user = await UserModel.findOne({ email });
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }
  user.roles = ["admin", "employee", "faculty"];
  user.activeRole = "admin";
  user.role = "admin";
  user.roleVersion = (user.roleVersion || 0) + 1;
  await user.save();
  console.log("Admin roles synchronized for the explicitly supplied existing account.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
