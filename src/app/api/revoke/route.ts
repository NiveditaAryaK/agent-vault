import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { revokeConnection, ServiceConnection } from '@/lib/tokenVault';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { connection } = await req.json();
  if (!connection) return NextResponse.json({ error: 'Connection required' }, { status: 400 });

  const userId = session.user.sub;
  const success = await revokeConnection(userId, connection as ServiceConnection);

  logAudit(userId, {
    action: `Revoked access to ${connection}`,
    type: 'revoke',
    details: success
      ? 'Token removed from Auth0 Token Vault. Agent can no longer access this service.'
      : 'Revocation failed — check Management API permissions.',
    source: connection,
    success,
  });

  return NextResponse.json({ success });
}
