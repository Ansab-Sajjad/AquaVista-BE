import mongoose, { Document, Schema } from "mongoose";

export interface IRevokedToken extends Document {
  token: string;
  expiresAt: Date;
}

const RevokedTokenSchema = new Schema<IRevokedToken>(
  {
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedToken = mongoose.model<IRevokedToken>("RevokedToken", RevokedTokenSchema);
