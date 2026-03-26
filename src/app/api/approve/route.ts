import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { executeApprovedAction } from '@/lib/rag';

/**
 * Step-up auth approval endpoint.
 * The user explicitly approves a pending write action.
 * In production: integrate Auth0 step-up auth (MFA challenge) before executing.
 */
export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { actionId } = await req.json();
  if (!actionId) return NextResponse.json({ error: 'Action ID required' }, { status: 400 });

  const userId = session.user.sub;
  const result = await executeApprovedAction(userId, actionId);

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // User denied the action — just confirm deletion (action is already removed on approve)
  const { actionId } = await req.json();
  return NextResponse.json({ success: true, message: 'Action cancelled.' });
}
