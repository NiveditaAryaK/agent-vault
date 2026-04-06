import { auth0 } from '@/lib/auth0';
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Skip auth routes — EXCEPT /api/auth/connect which needs the middleware
  // session context to properly link social accounts via Token Vault.
  if (pathname.startsWith('/api/auth/') && pathname !== '/api/auth/connect') {
    return NextResponse.next();
  }

  const res = await auth0.middleware(req);
  if (res) return res;

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/chat')) {
    const session = await auth0.getSession();
    if (!session) {
      return NextResponse.redirect(new URL('/api/auth/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
