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

export type ServiceConnection = 'google-oauth2' | 'github';

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

interface ConnectedAccount {
  id: string;
  connection?: string;
  created_at?: string;
  scopes?: string[];
}

interface ConnectedAccountsResponse {
  connected_accounts?: ConnectedAccount[];
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
};

/**
 * Get a federated token from Auth0 Token Vault for a specific connection.
 *
 * This is the core Token Vault operation:
 * - Auth0 securely stores the user's OAuth tokens
 * - The agent retrieves them on-demand via getAccessTokenForConnection
 * - The agent never stores or sees the raw credentials
 */
export async function getTokenForConnection(
  connection: ServiceConnection
): Promise<string | null> {
  try {
    const tokenResult = await auth0.getAccessTokenForConnection({ connection });
    return tokenResult?.token ?? null;
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
    if (code === 'missing_refresh_token' || code === 'missing_session') {
      return null;
    }
    const message =
      typeof err === 'object' && err !== null && 'message' in err ? String(err.message) : 'Unknown error';
    console.error(`Token Vault error for ${connection}:`, message);
    return null;
  }
}

/**
 * Check which services a user has connected via Auth0 Token Vault.
 * Uses the Management API connected_accounts endpoint and falls back to
 * checking Token Vault directly if the connected account list is unavailable.
 */
export async function getUserConnections(userId: string): Promise<ConnectionStatus[]> {
  const baseStatuses = buildDisconnectedStatuses();

  try {
    const mgmtToken = await getMgmtToken();

    const res = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/connected-accounts`,
      { headers: { Authorization: `Bearer ${mgmtToken}` } }
    );

    if (!res.ok) {
      console.error('[tokenVault] Management API fetch failed:', res.status, await res.text());
      return await hydrateStatusesFromVault(baseStatuses);
    }

    const data = (await res.json()) as ConnectedAccountsResponse;
    const connectedAccounts = data.connected_accounts || [];

    const statuses = (Object.keys(SERVICE_CONFIGS) as ServiceConnection[]).map((conn) => {
      const connectedAccount = connectedAccounts.find((account) => account.connection === conn);
      return {
        ...SERVICE_CONFIGS[conn],
        connected: !!connectedAccount,
        connectedAt: connectedAccount?.created_at,
        scopes: connectedAccount?.scopes || [],
      };
    });
    return await hydrateStatusesFromVault(statuses);
  } catch {
    return await hydrateStatusesFromVault(baseStatuses);
  }
}

function buildDisconnectedStatuses(): ConnectionStatus[] {
  return (Object.keys(SERVICE_CONFIGS) as ServiceConnection[]).map((conn) => ({
    ...SERVICE_CONFIGS[conn],
    connected: false,
  }));
}

async function hydrateStatusesFromVault(statuses: ConnectionStatus[]): Promise<ConnectionStatus[]> {
  const availability = await Promise.all(
    statuses.map(async (status) => {
      const token = await getTokenForConnection(status.connection);
      return { connection: status.connection, connected: Boolean(token) };
    })
  );

  return statuses.map((status) => {
    const vaultStatus = availability.find((item) => item.connection === status.connection);
    return {
      ...status,
      connected: status.connected || Boolean(vaultStatus?.connected),
    };
  });
}

/**
 * Revoke a connection — user removes the agent's access to a service.
 * Deletes the connected account from the user's Auth0 profile, which also
 * removes the token from Token Vault.
 */
export async function revokeConnection(userId: string, connection: ServiceConnection): Promise<boolean> {
  try {
    const mgmtToken = await getMgmtToken();

    const connectedAccountsRes = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/connected-accounts`,
      { headers: { Authorization: `Bearer ${mgmtToken}` } }
    );
    if (!connectedAccountsRes.ok) return false;

    const data = (await connectedAccountsRes.json()) as ConnectedAccountsResponse;
    const connectedAccount = data.connected_accounts?.find((account) => account.connection === connection);
    if (!connectedAccount) return false;

    const res = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/connected-accounts/${encodeURIComponent(connectedAccount.id)}`,
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
