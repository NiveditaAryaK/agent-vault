import { NextRequest, NextResponse } from 'next/server';
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

  if (action === 'logout') {
    return auth0.startInteractiveLogin({ returnTo: '/' });
  }

  if (action === 'callback') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.json({ error: 'Unknown auth action' }, { status: 404 });
}
