/**
 * In-memory JWT denylist for logout invalidation.
 * Tokens are automatically pruned once they reach their expiry.
 */

interface DenylistEntry {
  expiresAt: Date;
}

class TokenDenylist {
  private store = new Map<string, DenylistEntry>();

  add(token: string, expiresAt: Date): void {
    this.store.set(token, { expiresAt });
  }

  has(token: string): boolean {
    const entry = this.store.get(token);
    if (!entry) return false;

    // Auto-prune expired entries on read
    if (entry.expiresAt <= new Date()) {
      this.store.delete(token);
      return false;
    }

    return true;
  }

  /** Prune all expired tokens — call periodically if needed. */
  prune(): void {
    const now = new Date();
    for (const [token, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) this.store.delete(token);
    }
  }
}

export const denylist = new TokenDenylist();
