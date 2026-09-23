require("dotenv").config();

const mongoose = require("mongoose");
const { UserModel } = require("./src/models/User");

async function main() {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected.");

    const user = await UserModel.findOneAndUpdate(
      { email: "g.a.u.r.a.v.2.1.8.6.0@gmail.com" },
      {
        $set: {
          role: "admin",
          emailVerified: true
        }
      },
      { new: true }
    );

    console.log("USER FOUND:", !!user);
    console.log("EMAIL:", user?.email);
    console.log("ROLE:", user?.role);
    console.log("EMAIL VERIFIED:", user?.emailVerified);

    await mongoose.disconnect();
    console.log("Done.");
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
}

main();
