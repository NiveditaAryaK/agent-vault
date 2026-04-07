import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET(req: NextRequest, { params }: { params: Promise<{ auth0: string }> }) {
  const { auth0: action } = await params;
  const url = new URL(req.url);

  if (action === 'login') {
    const connection = url.searchParams.get('connection') || undefined;
    const returnTo = url.searchParams.get('returnTo') || '/dashboard';
    const authorizationParameters = Object.fromEntries(
      [...url.searchParams.entries()].filter(([key]) => key !== 'returnTo')
    );

    if (authorizationParameters.max_age) {
      authorizationParameters.max_age = String(Number(authorizationParameters.max_age));
    }

    return auth0.startInteractiveLogin({
      authorizationParameters: Object.keys(authorizationParameters).length > 0
        ? authorizationParameters
        : connection
          ? { connection }
          : undefined,
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

    try {
      return await auth0.connectAccount({
        connection,
        returnTo,
        ...(scopes.length > 0 ? { scopes } : {}),
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Unknown connect account error.';
      const message = rawMessage.includes('connected account access token')
        ? 'Auth0 Connected Accounts is not fully configured for this app. Enable My Account API access, grant create:me:connected_accounts, and enable Connected Accounts for Token Vault with Offline Access on the provider connection.'
        : rawMessage;

      console.error('[auth connect] failed:', rawMessage);

      const redirectUrl = new URL(rawReturnTo, req.url);
      redirectUrl.searchParams.set('connect_error', message);
      redirectUrl.searchParams.set('connection', connection);

      return NextResponse.redirect(redirectUrl);
    }
  }

  if (action === 'logout') {
    return auth0.middleware(req);
  }

  if (action === 'callback') {
    return auth0.middleware(req);
  }

  return auth0.middleware(req);
}
