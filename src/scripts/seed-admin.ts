/**
 * Bootstrap script — creates the default Admin and User accounts.
 * Run once after setting up the database:
 *   npx ts-node src/scripts/seed-admin.ts
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { User } from "../models/User.model";

const DEFAULT_USERS = [
  {
    name: "AquaVista Admin",
    email: "admin@Aquavista.dev",
    password: "password",
    role: "admin" as const,
    status: "active" as const,
  },
  {
    name: "AquaVista User",
    email: "user@Aquavista.dev",
    password: "password",
    role: "project_user" as const,
    status: "active" as const,
  },
];

async function seedUsers() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  for (const userData of DEFAULT_USERS) {
    const existing = await User.findOne({ email: { $regex: new RegExp(`^${userData.email}$`, "i") } });
    if (existing) {
      console.log(`User already exists: ${userData.email}`);
      continue;
    }

    await User.create(userData);
    console.log(`Created ${userData.role}: ${userData.email}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

seedUsers().catch((err) => {
  console.error(err);
  process.exit(1);
});
