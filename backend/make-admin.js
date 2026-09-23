require("dotenv").config();

const mongoose = require("mongoose");
const { UserModel } = require("./src/models/User");

async function main() {
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || process.argv[2] || "").trim().toLowerCase();
  if (!email) throw new Error("Set ADMIN_BOOTSTRAP_EMAIL or pass an existing account email explicitly.");
  await mongoose.connect(process.env.MONGO_URI);

  const user = await UserModel.findOneAndUpdate(
    { email },
    {
      $set: {
        role: "admin",
        roles: ["admin", "employee", "faculty"],
        activeRole: "admin",
        roleVersion: 1,
        emailVerified: true
      }
    },
    { new: true }
  );

  console.log("USER FOUND:", !!user);
  console.log("ROLES SYNCHRONIZED:", user?.roles);
  console.log("EMAIL VERIFIED:", user?.emailVerified);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("ERROR:", error);
  process.exit(1);
});
