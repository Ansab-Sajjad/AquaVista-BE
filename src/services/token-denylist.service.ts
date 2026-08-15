/**
 * MongoDB-backed JWT denylist for logout invalidation.
 * Tokens are automatically pruned by MongoDB's TTL index (expireAfterSeconds: 0).
 */

import { RevokedToken } from "../models/RevokedToken.model";

class TokenDenylist {
  async add(token: string, expiresAt: Date): Promise<void> {
    await RevokedToken.create({ token, expiresAt });
  }

  async has(token: string): Promise<boolean> {
    const entry = await RevokedToken.findOne({ token }).lean().exec();
    if (!entry) return false;

    if (entry.expiresAt <= new Date()) {
      await RevokedToken.deleteOne({ _id: entry._id }).exec();
      return false;
    }

    return true;
  }
}

export const denylist = new TokenDenylist();
