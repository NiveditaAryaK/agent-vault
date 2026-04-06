import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getCurrentConnectionStatuses } from '@/lib/tokenVault';
import { getIndexedCount } from '@/lib/rag';

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.sub;
  const connections = await getCurrentConnectionStatuses();
  const indexedCount = getIndexedCount(userId);

  return NextResponse.json({ connections, indexedCount });
}
