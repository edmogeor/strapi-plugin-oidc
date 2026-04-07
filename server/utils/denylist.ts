/**
 * In-memory denylist for instant session revocation after backchannel logout.
 * Stores the logout timestamp per user ID. A token is considered revoked if it
 * was issued (iat) before the logout time. Entries auto-expire after 24 hours —
 * well past any reasonable JWT lifetime — to prevent unbounded memory growth.
 * Lost on server restart, which is acceptable for this use case.
 */
const revoked = new Map<string, number>();

const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function revokeUser(userId: string): void {
  revoked.set(userId, Date.now());
  setTimeout(() => revoked.delete(userId), CLEANUP_DELAY_MS);
}

/** Returns true if the token (identified by its iat) was issued before the user was logged out. */
export function isUserRevoked(userId: string, iat: number): boolean {
  const logoutTime = revoked.get(userId);
  if (!logoutTime) return false;
  return iat * 1000 <= logoutTime;
}
