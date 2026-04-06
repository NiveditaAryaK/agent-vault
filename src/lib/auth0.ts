import { Auth0Client } from '@auth0/nextjs-auth0/server';

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
  secret: process.env.AUTH0_SECRET!,
  appBaseUrl: process.env.AUTH0_BASE_URL!,
  enableConnectAccountEndpoint: true,
  routes: {
    login: '/api/auth/login',
    callback: '/api/auth/callback',
    logout: '/api/auth/logout',
    connectAccount: '/api/auth/connect',
  },
  authorizationParameters: {
    scope: 'openid profile email offline_access',
  },
});

// Get Auth0 Management API token (for user identity lookups)
let mgmtToken: string | null = null;
let mgmtTokenExpiry = 0;

export async function getMgmtToken(): Promise<string> {
  if (mgmtToken && Date.now() < mgmtTokenExpiry) return mgmtToken;

  const res = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.AUTH0_MGMT_CLIENT_ID,
      client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET,
      audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
    }),
  });

  const data = await res.json() as { access_token: string; expires_in: number };
  mgmtToken = data.access_token;
  mgmtTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return mgmtToken!;
}
