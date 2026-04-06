import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getUserConnections } from '@/lib/tokenVault';
import { getIndexedCount } from '@/lib/rag';

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.sub;
  const connections = await getUserConnections(userId);
  const indexedCount = getIndexedCount(userId);

  // Temporary debug — remove after confirming connections work
  console.log('[permissions] userId:', userId);
  console.log('[permissions] connections:', JSON.stringify(connections.map(c => ({ connection: c.connection, connected: c.connected }))));

  return NextResponse.json({ connections, indexedCount });
}