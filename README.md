# Sanctum - Authorized Agentic RAG

> Your AI agent. Your data. Your rules.

Sanctum is a personal AI agent that reads your Gmail, GitHub, and Notion - and can act on them - using **Auth0 Token Vault** as the identity layer. The agent never stores your credentials. Every write action requires your explicit approval plus step-up authentication.

Built for the [Auth0 "Authorized to Act" Hackathon](https://auth0hackathon.devpost.com/).

## The core idea

Most personal AI assistants require you to hand over your OAuth tokens. Sanctum flips this: **the agent has no credentials**. It requests scoped tokens on-demand from Auth0 Token Vault, uses them for exactly one operation, and discards them.

```text
User logs in with Auth0
  |
  v
Grants access to Gmail / GitHub / Notion
  |
  v
Auth0 Token Vault stores the OAuth tokens securely
  |
  v
Sanctum requests a token for a specific connection
auth0.getAccessTokenForConnection({ connection: 'google-oauth2' })
  |
  v
Agent fetches the user's data using that scoped token
Indexes it into a private per-user retrieval store
  |
  v
User chats with Gemini over their own data
  |
  v
Agent wants to send an email? -> Action is staged, not executed
User reviews and approves -> Token is retrieved again from Vault -> Action executes
```

## Features

- Authenticated RAG with data fetched using real Token Vault tokens
- Per-user isolated stores to avoid cross-user leakage
- Staged write actions with explicit approval and step-up authentication
- Permission dashboard with connect, revoke, and activity log views
- Gemini-based reasoning over Gmail, GitHub, and Notion context

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth and Token Vault | Auth0 `@auth0/nextjs-auth0` v4 |
| AI reasoning | Google Gemini `gemini-2.0-flash` |
| Embeddings | `@xenova/transformers` with `all-MiniLM-L6-v2` |
| Styling | Tailwind CSS v4 + Lucide icons |
| Retrieval store | In-memory per-user store |

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure Auth0

Follow **[AUTH0_SETUP.md](./AUTH0_SETUP.md)**.

### 3. Set environment variables

```env
AUTH0_SECRET='<32-byte random string>'
AUTH0_BASE_URL='http://localhost:3000'
AUTH0_DOMAIN='your-tenant.auth0.com'
AUTH0_CLIENT_ID='your-client-id'
AUTH0_CLIENT_SECRET='your-client-secret'

AUTH0_MGMT_CLIENT_ID='your-mgmt-client-id'
AUTH0_MGMT_CLIENT_SECRET='your-mgmt-client-secret'

GEMINI_API_KEY='your-gemini-api-key'
```

### 4. Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## How Token Vault is used

The key Auth0 SDK call lives in `src/lib/tokenVault.ts`:

```ts
const tokenResult = await auth0.getAccessTokenForConnection({
  connection: 'google-oauth2',
});

const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
  headers: { Authorization: `Bearer ${tokenResult.token}` },
});
```

Token Vault handles:

- Storing federated OAuth tokens after a user connects a service
- Refreshing tokens before they expire
- Returning no token when the user has not connected that service
- Keeping credentials out of the application entirely

Write actions retrieve a fresh token from Token Vault only at execution time, after the user approves the action.

## Project structure

```text
src/
├── app/
│   ├── api/
│   │   ├── approve/      # Execute approved write actions
│   │   ├── audit/        # Fetch per-user activity log
│   │   ├── auth/[auth0]/ # Auth0 route handler
│   │   ├── chat/         # Chat endpoint
│   │   ├── index-data/   # Trigger indexing via Token Vault
│   │   ├── permissions/  # List connected services
│   │   └── revoke/       # Revoke a connected service
│   ├── chat/             # Chat interface
│   ├── dashboard/        # Permission dashboard
│   └── page.tsx          # Landing page
├── components/
│   └── Sidebar.tsx
├── lib/
│   ├── audit.ts
│   ├── auth0.ts
│   ├── rag.ts
│   └── tokenVault.ts
└── proxy.ts
```

## Security model

| Action | Agent permission |
|---|---|
| Read Gmail inbox | Allowed with Token Vault token |
| Read GitHub issues | Allowed with Token Vault token |
| Read Notion pages | Allowed with Token Vault token |
| Send email | Requires user approval + step-up auth |
| Post GitHub comment | Requires user approval + step-up auth |
| Update Notion page | Staged, but not implemented yet |
| Store OAuth tokens | Never - handled entirely by Auth0 Token Vault |

## Notes

- Retrieval and audit logs are currently in-memory for the hackathon prototype.
- The Notion write path is intentionally not wired yet; the UI and approval flow already account for that limitation.

## License

MIT
