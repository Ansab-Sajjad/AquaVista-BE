import bcrypt from "bcryptjs";
import mongoose, { Document, Schema } from "mongoose";

export type UserRole = "admin" | "project_user";
export type UserStatus = "active" | "pending" | "inactive";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  company?: string;
  role: UserRole;
  status: UserStatus;
  activationToken?: string;
  activationTokenExpires?: Date;
  resetToken?: string;
  resetTokenExpires?: Date;
  lastActive?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    company: { type: String, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: {
      type: String,
      enum: ["admin", "project_user"],
      default: "project_user",
    },
    status: {
      type: String,
      enum: ["active", "pending", "inactive"],
      default: "pending",
    },
    activationToken: { type: String, select: false },
    activationTokenExpires: { type: Date, select: false },
    resetToken: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    lastActive: { type: Date },
  },
  { timestamps: true }
);

// Hash password before save
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model<IUser>("User", UserSchema);
