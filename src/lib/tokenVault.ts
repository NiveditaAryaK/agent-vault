/**
 * Auth0 Token Vault integration
 *
 * Token Vault is Auth0's secure storage for federated OAuth tokens.
 * It lets AI agents retrieve user tokens on-demand via `getAccessTokenForConnection`
 * without ever storing credentials themselves.
 *
 * Key Auth0 SDK method: auth0.getAccessTokenForConnection({ connection, loginHint })
 * - Returns the user's access token for a third-party service (Gmail, GitHub, etc.)
 * - Handles token refresh automatically
 * - Raises a redirect if the user hasn't connected the service yet
 */

import { auth0 } from './auth0';
import { getMgmtToken } from './auth0';
import { NextRequest } from 'next/server';

export type ServiceConnection = 'google-oauth2' | 'github' | 'notion';

export interface ConnectionStatus {
  connection: ServiceConnection;
  connected: boolean;
  scopes: string[];
  label: string;
  icon: string;
  readScopes: string[];
  writeScopes: string[];
  connectedAt?: string;
}

export const SERVICE_CONFIGS: Record<ServiceConnection, Omit<ConnectionStatus, 'connected' | 'connectedAt'>> = {
  'google-oauth2': {
    connection: 'google-oauth2',
    label: 'Google (Gmail + Drive)',
    icon: 'google',
    scopes: [],
    readScopes: ['gmail.readonly', 'drive.readonly'],
    writeScopes: ['gmail.send', 'drive.file'],
  },
  github: {
    connection: 'github',
    label: 'GitHub',
    icon: 'github',
    scopes: [],
    readScopes: ['repo:read', 'read:user'],
    writeScopes: ['repo', 'write:issues'],
  },
  notion: {
    connection: 'notion',
    label: 'Notion',
    icon: 'notion',
    scopes: [],
    readScopes: ['read_content', 'read_user'],
    writeScopes: ['update_content'],
  },
};

/**
 * Get a federated token from Auth0 Token Vault for a specific connection.
 *
 * This is the core Token Vault operation:
 * - Auth0 securely stores the user's OAuth tokens
 * - The agent retrieves them on-demand via getAccessTokenForConnection
 * - The agent never stores or sees the raw credentials
 *
 * @param connection - The Auth0 connection name (e.g., 'google-oauth2')
 * @param req - The Next.js request (needed for session context)
 */
export async function getTokenForConnection(
  connection: ServiceConnection,
  req?: NextRequest
): Promise<string | null> {
  try {
    const tokenResult = await auth0.getAccessTokenForConnection({ connection });
    return tokenResult?.token ?? null;
  } catch (err: any) {
    // RequiresLoginError — user hasn't connected this service yet
    if (err?.code === 'missing_refresh_token' || err?.code === 'missing_session') {
      return null;
    }
    console.error(`Token Vault error for ${connection}:`, err?.message);
    return null;
  }
}

/**
 * Check which services a user has connected via Auth0 Token Vault.
 * Uses the Management API to inspect the user's linked identities.
 */
export async function getUserConnections(userId: string): Promise<ConnectionStatus[]> {
  try {
    const mgmtToken = await getMgmtToken();

    const res = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${mgmtToken}` } }
    );

    if (!res.ok) return buildDisconnectedStatuses();

    const user = await res.json();
    const identities: any[] = user.identities || [];

    return (Object.keys(SERVICE_CONFIGS) as ServiceConnection[]).map((conn) => {
      const identity = identities.find((id: any) => id.connection === conn);
      return {
        ...SERVICE_CONFIGS[conn],
        connected: !!identity,
        connectedAt: identity?.profileData?.created_at,
        scopes: identity?.access_token_scope?.split(' ') || [],
      };
    });
  } catch {
    return buildDisconnectedStatuses();
  }
}

function buildDisconnectedStatuses(): ConnectionStatus[] {
  return (Object.keys(SERVICE_CONFIGS) as ServiceConnection[]).map((conn) => ({
    ...SERVICE_CONFIGS[conn],
    connected: false,
  }));
}

/**
 * Revoke a connection — user removes the agent's access to a service.
 * Deletes the linked identity from the user's Auth0 profile, which also
 * removes the token from Token Vault.
 */
export async function revokeConnection(userId: string, connection: ServiceConnection): Promise<boolean> {
  try {
    const mgmtToken = await getMgmtToken();

    const res = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/identities/${connection}/${userId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${mgmtToken}` },
      }
    );

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Make an authenticated API call to a connected service using its Token Vault token.
 * The token is retrieved from Auth0 Token Vault — never from local storage.
 */
export async function callWithVaultToken(
  connection: ServiceConnection,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getTokenForConnection(connection);

  if (!token) {
    throw new Error(`No Token Vault token available for connection: ${connection}. User must connect this service.`);
  }

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
