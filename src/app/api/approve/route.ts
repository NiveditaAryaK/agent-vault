import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { executeApprovedAction } from '@/lib/rag';
import { logAudit } from '@/lib/audit';

/**
 * Step-up auth approval endpoint.
 *
 * Security model: write actions require a FRESH authentication (within 5 min).
 * If the session is stale, we return 403 with a loginUrl that forces Auth0 to
 * re-authenticate the user (max_age=0). After re-auth, the user's cookie is
 * updated and they can click Approve again with a fresh session.
 *
 * This implements the Token Vault step-up pattern:
 *   1. Agent stages the action (never executes autonomously)
 *   2. User reviews and clicks Approve
 *   3. Server verifies fresh authentication — if not, 403 + step-up redirect
 *   4. User re-authenticates, comes back, clicks Approve again
 *   5. Server verifies fresh auth ✓ → retrieves Token Vault token → executes
 */
export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { actionId } = await req.json();
  if (!actionId) return NextResponse.json({ error: 'Action ID required' }, { status: 400 });

  const userId = session.user.sub;

  // ── Step-up auth check ──────────────────────────────────────────────────
  // Require that the user authenticated within the last 5 minutes.
  // auth_time is the standard OIDC claim for when authentication occurred;
  // Auth0 includes it after a forced re-auth (max_age=0).
  const now = Math.floor(Date.now() / 1000);
  const authTime =
    (session.user.auth_time as number | undefined) ||
    session.internal.createdAt;

  const STEP_UP_WINDOW = 300; // 5 minutes
  const isAuthFresh = authTime > 0 && now - authTime < STEP_UP_WINDOW;

  if (!isAuthFresh) {
    const returnTo = encodeURIComponent('/chat');
    return NextResponse.json(
      {
        requiresStepUp: true,
        loginUrl: `/api/auth/login?max_age=0&returnTo=${returnTo}`,
        message:
          'Write actions require re-verification. Re-authenticate, then click Approve again.',
      },
      { status: 403 }
    );
  }
  // ── End step-up check ───────────────────────────────────────────────────

  const result = await executeApprovedAction(userId, actionId);

  logAudit(userId, {
    action: result.success ? `Action executed: ${actionId}` : `Action failed: ${actionId}`,
    type: 'action_approved',
    details: result.message,
    success: result.success,
  });

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { actionId } = await req.json();
  const userId = session.user.sub;

  logAudit(userId, {
    action: `Action denied by user: ${actionId}`,
    type: 'action_denied',
    success: false,
  });

  return NextResponse.json({ success: true, message: 'Action cancelled.' });
}
