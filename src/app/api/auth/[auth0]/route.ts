import { NextRequest } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET(req: NextRequest, { params }: { params: Promise<{ auth0: string }> }) {
  const { auth0: action } = await params;
  const url = new URL(req.url);

  if (action === 'login') {
    const connection = url.searchParams.get('connection') || undefined;
    const returnTo = url.searchParams.get('returnTo') || '/dashboard';

    return auth0.startInteractiveLogin({
      authorizationParameters: connection ? { connection } : undefined,
      returnTo,
    });
  }

  if (action === 'connect') {
    const connection = url.searchParams.get('connection') || undefined;
    const rawReturnTo = url.searchParams.get('returnTo') || '/dashboard';
    const returnTo = `${rawReturnTo}${rawReturnTo.includes('?') ? '&' : '?'}connected=1`;
    const scopes = url.searchParams.getAll('scopes');

    if (!connection) {
      return new Response('A connection is required.', { status: 400 });
    }

    return auth0.connectAccount({
      connection,
      returnTo,
      ...(scopes.length > 0 ? { scopes } : {}),
    });
  }

  if (action === 'logout') {
    return auth0.middleware(req);
  }

  if (action === 'callback') {
    return auth0.middleware(req);
  }

  return auth0.middleware(req);
}
