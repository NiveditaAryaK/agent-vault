/**
 * Audit Log
 *
 * Records every significant agent action per user so that:
 *  - Users can see exactly what the agent did on their behalf
 *  - Security-sensitive events (writes, revocations, step-up challenges) are traceable
 *  - The trust model is transparent and inspectable
 *
 * Stored in-memory (production: persist to DB / append-only log service).
 */

export type AuditEventType =
  | 'index'
  | 'chat'
  | 'action_staged'
  | 'action_approved'
  | 'action_denied'
  | 'revoke'
  | 'stepup_required';

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  type: AuditEventType;
  details?: string;
  source?: string;
  success?: boolean;
}

// Per-user audit log (in-memory; capped at 100 entries per user)
const auditStore = new Map<string, AuditEntry[]>();

export function logAudit(
  userId: string,
  entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId'>
): void {
  const entries = auditStore.get(userId) || [];
  entries.push({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userId,
    ...entry,
  });
  // Keep the most recent 100 entries
  auditStore.set(userId, entries.slice(-100));
}

/** Returns entries in reverse-chronological order (newest first). */
export function getAuditLog(userId: string): AuditEntry[] {
  return [...(auditStore.get(userId) || [])].reverse();
}
