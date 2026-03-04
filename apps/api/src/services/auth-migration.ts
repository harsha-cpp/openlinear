import { prisma } from '@openlinear/db';

/**
 * DEPRECATED: User accessToken storage in database
 * 
 * This module is being migrated to local-only storage.
 * GitHub tokens should be stored in desktop secure storage, not cloud DB.
 * 
 * Migration status:
 * - WRITES: Disabled (accessToken no longer stored in DB)
 * - READS: Still available for backward compatibility during transition
 * - TARGET: Complete removal in future release
 * 
 * @see docs/security/trust-boundary.md
 */

const DEPRECATION_WARNING = 
'WARNING: Storing accessToken in database is deprecated. ' +
'Read docs/security/trust-boundary.md for migration guide.';

function maskUserId(userId: string): string {
  return userId.length <= 8 ? userId : `${userId.slice(0, 8)}...`;
}

/**
 * Check if user has a legacy stored token
 * Used during migration to identify users who need to transition
 */
export async function hasLegacyStoredToken(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessToken: true },
  });
  return !!user?.accessToken;
}

/**
 * Migration helper: Clear legacy token from DB
 * Call after token is migrated to local storage
 */
export async function clearLegacyToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { accessToken: null },
  });
}

/**
 * Get legacy token (for backward compatibility during transition)
 * @deprecated Tokens should come from local secure storage
 */
export async function getLegacyToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessToken: true },
  });
  return user?.accessToken ?? null;
}

export async function getLegacyTokenForOperation(
  userId: string,
  operation: string
): Promise<string | null> {
  const token = await getLegacyToken(userId);
  if (token) {
    console.warn(
      `[Auth Migration] ${DEPRECATION_WARNING} operation=${operation} userId=${maskUserId(userId)}`
    );
  }
  return token;
}
