import { NextRequest } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET(req: NextRequest, { params }: { params: Promise<{ auth0: string }> }) {
  const { auth0: action } = await params;
  const url = new URL(req.url);

  if (action === 'login') {
    const connection = url.searchParams.get('connection') || undefined;
    const rawReturnTo = url.searchParams.get('returnTo') || '/dashboard';
    // If connecting a social account, append ?connected=1 so the dashboard
    // knows to retry the permissions fetch (Management API cache lag).
    const returnTo = connection
      ? `${rawReturnTo}${rawReturnTo.includes('?') ? '&' : '?'}connected=1`
      : rawReturnTo;

    return auth0.startInteractiveLogin({
      authorizationParameters: connection ? { connection } : undefined,
      returnTo,
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
