import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getAuditLog } from '@/lib/audit';

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.sub;
  const entries = getAuditLog(userId);

  return NextResponse.json({ entries });
}
