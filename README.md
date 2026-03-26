# Sanctum — Authorized Agentic RAG

> Your AI agent. Your data. Your rules.

Sanctum is a personal AI agent that reads your Gmail, GitHub, and Notion — and can act on them — using **Auth0 Token Vault** as the identity layer. The agent never stores your credentials. Every write action requires your explicit approval via step-up authentication.

Built for the [Auth0 "Authorized to Act" Hackathon](https://auth0hackathon.devpost.com/).

---

## The core idea

Most personal AI assistants require you to hand over your OAuth tokens. Sanctum flips this: **the agent has no credentials**. It requests scoped tokens on-demand from Auth0 Token Vault, uses them for exactly one operation, and discards them.

```
User logs in with Auth0
    │
    ▼
Grants read access to Gmail / GitHub / Notion
    │
    ▼
Auth0 Token Vault stores the OAuth tokens securely
    │
    ▼
Sanctum agent requests a token for a specific connection
auth0.getAccessTokenForConnection({ connection: 'google-oauth2' })
    │
    ▼
Agent fetches YOUR data using that scoped token
Indexes it into your private per-user vector store
    │
    ▼
You chat with Claude, grounded on your own data
    │
    ▼
Agent wants to send an email? → Action staged, not executed
You review and approve → Token retrieved again from Vault → Action executes
```

---

## Features

- **Authenticated RAG** — every retrieval is gated by a real OAuth token from Token Vault. No shared knowledge base, no cross-user leakage.
- **Per-user isolated stores** — each user's indexed data lives in their own in-memory vector store.
- **Step-up auth gates** — write actions (send email, post GitHub comment) are staged and require explicit user approval before the agent executes them.
- **Revoke at any time** — disconnect any service from the dashboard. Token Vault removes the credentials immediately.
- **Claude-powered reasoning** — uses `claude-sonnet-4-6` to answer questions from your indexed context.

---

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth & Token Vault | Auth0 `@auth0/nextjs-auth0` v4 |
| AI reasoning | Anthropic Claude (`claude-sonnet-4-6`) |
| Styling | Tailwind CSS v4 + Lucide icons |
| Vector store | In-memory per-user (swap for Pinecone in prod) |

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd agent-vault
npm install
```

### 2. Configure Auth0

Follow the full Auth0 setup guide: **[AUTH0_SETUP.md](./AUTH0_SETUP.md)**

### 3. Set environment variables

Copy the example and fill it in:

```bash
cp .env.local.example .env.local
```

```env
AUTH0_SECRET='<32-byte random string: openssl rand -hex 32>'
AUTH0_BASE_URL='http://localhost:3000'
AUTH0_DOMAIN='your-tenant.auth0.com'
AUTH0_CLIENT_ID='your-client-id'
AUTH0_CLIENT_SECRET='your-client-secret'

AUTH0_MGMT_CLIENT_ID='your-mgmt-client-id'
AUTH0_MGMT_CLIENT_SECRET='your-mgmt-client-secret'

ANTHROPIC_API_KEY='your-anthropic-api-key'
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How Token Vault is used

The key Auth0 SDK call in `src/lib/tokenVault.ts`:

```typescript
// Get a user's OAuth token for a connected service — from Token Vault
const tokenResult = await auth0.getAccessTokenForConnection({
  connection: 'google-oauth2',   // the Auth0 connection name
});

// Use the token to call the external API
const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
  headers: { Authorization: `Bearer ${tokenResult.token}` },
});
```

Auth0 Token Vault handles:
- Storing the federated OAuth token after the user connects a service
- Automatically refreshing tokens before they expire
- Returning `null` / throwing if the user hasn't connected the service yet
- Scope enforcement at the Auth0 connection level

Write actions retrieve a fresh token from Token Vault at execution time, after the user approves — so the agent holds a token only for the duration of a single API call.

---

## Project structure

```
src/
├── lib/
│   ├── auth0.ts          # Auth0 client + Management API helper
│   ├── tokenVault.ts     # Token Vault integration (getAccessTokenForConnection)
│   └── rag.ts            # Authenticated RAG pipeline + Claude chat
├── app/
│   ├── page.tsx          # Landing page
│   ├── dashboard/        # Permission dashboard (connect / revoke services)
│   ├── chat/             # Chat interface with step-up auth approval flow
│   └── api/
│       ├── auth/[auth0]/ # Auth0 route handler
│       ├── chat/         # Chat endpoint
│       ├── index-data/   # Trigger data indexing via Token Vault
│       ├── permissions/  # List connected services
│       ├── approve/      # Execute step-up-approved write actions
│       └── revoke/       # Revoke a service connection
├── components/
│   └── Sidebar.tsx       # Shared navigation sidebar
└── middleware.ts         # Auth0 middleware + route protection
```

---

## Security model

| Action | Agent permission |
|---|---|
| Read Gmail inbox | Allowed (read-only Token Vault token) |
| Read GitHub issues | Allowed (read-only Token Vault token) |
| Read Notion pages | Allowed (read-only Token Vault token) |
| Send email | Requires user approval + step-up auth |
| Post GitHub comment | Requires user approval + step-up auth |
| Update Notion page | Requires user approval + step-up auth |
| Store your OAuth tokens | Never — handled entirely by Auth0 Token Vault |

---

## License

MIT
