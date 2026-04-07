# Auth0 Setup Guide for Sanctum

This guide walks you through configuring Auth0 for Sanctum — including Token Vault, social connections, and the Management API.

---

## Step 1: Create an Auth0 tenant

1. Go to [manage.auth0.com](https://manage.auth0.com) and sign up / log in
2. Create a new tenant
3. Note your **Domain**: `your-tenant.us.auth0.com`

---

## Step 2: Create the application

1. In the Auth0 dashboard → **Applications** → **Create Application**
2. Name: `Sanctum`
3. Type: **Regular Web Application**
4. Click **Create**

### Configure the application settings

Go to the **Settings** tab of your new app:

| Field | Value |
|---|---|
| Allowed Callback URLs | `http://localhost:3000/api/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000` |
| Allowed Web Origins | `http://localhost:3000` |

Click **Save Changes**.

### Copy credentials to `.env.local`

```env
AUTH0_DOMAIN='your-tenant.us.auth0.com'
AUTH0_CLIENT_ID='<Client ID from Settings tab>'
AUTH0_CLIENT_SECRET='<Client Secret from Settings tab>'
AUTH0_SECRET='<run: openssl rand -hex 32>'
AUTH0_BASE_URL='http://localhost:3000'
```

> `ANTHROPIC_API_KEY` is covered in Step 8.

---

## Step 3: Enable Token Vault

Token Vault is available in Auth0 for AI Agents.

1. In the dashboard → **Auth0 for AI Agents** (left sidebar)
2. Enable **Token Vault** for your tenant
3. Token Vault will automatically store federated tokens when users connect social providers

> Token Vault is the feature that lets Sanctum call `auth0.getAccessTokenForConnection()` to retrieve a user's Google / GitHub / Notion token without ever storing it.

---

## Step 4: Set up Google (Gmail + Drive) social connection

### Create a Google OAuth app

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project: `Sanctum`
3. Enable these APIs:
   - **Gmail API** — search for it in the API Library
   - **Google Drive API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   ```
   https://your-tenant.us.auth0.com/login/callback
   ```
7. Save — copy the **Client ID** and **Client Secret**

### Add to Auth0

1. Auth0 dashboard → **Authentication** → **Social** → **Create Connection**
2. Select **Google / Gmail**
3. Fill in:
   - Client ID: _(from Google console)_
   - Client Secret: _(from Google console)_
4. Under **Permissions**, add:
   ```
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/drive.readonly
   ```
5. Enable for your **Sanctum** application
6. **Enable Token Vault** toggle on this connection — this is what stores the token in the vault
7. Save

---

## Step 5: Set up GitHub social connection

### Create a GitHub app

1. Go to [github.com/settings/apps](https://github.com/settings/apps)
2. **New GitHub App**
3. Fill in:
   - Application name: `Sanctum`
   - Homepage URL:
     ```
     https://your-tenant.us.auth0.com
     ```
   - Callback URL:
     ```
     https://your-tenant.us.auth0.com/login/callback
     ```
   - Webhooks: disabled
   - Repository and account permissions: select what your app needs in GitHub
4. Register — copy **Client ID** and generate a **Client Secret**

### Add to Auth0

1. Auth0 dashboard → **Authentication** → **Social** → **Create Connection**
2. Select **GitHub**
3. Fill in Client ID and Client Secret
4. Turn on **Connected Accounts for Token Vault**
5. Enable the connection for your **Sanctum** application
6. Save

> GitHub Connected Accounts do not use free-form scopes in Auth0 yet. Configure the required repository/account permissions in the GitHub app itself. `offline_access` is not required for GitHub.

---

## Step 6: Set up Notion social connection

### Create a Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. **New integration** → name: `Sanctum`
3. Capabilities: Read content, Read user information
4. Copy the **Internal Integration Token**

> Note: For production, set up Notion as a public OAuth integration. For the hackathon, the internal token approach is simpler.

### Add to Auth0 (custom connection)

1. Auth0 dashboard → **Authentication** → **Custom** → **Create Connection**
2. Select **OAuth2**
3. Configure with Notion's OAuth endpoints:
   - Authorization URL: `https://api.notion.com/v1/oauth/authorize`
   - Token URL: `https://api.notion.com/v1/oauth/token`
   - Client ID / Secret from your Notion integration
4. Enable Token Vault on this connection
5. Save

---

## Step 7: Set up Management API credentials

Sanctum uses the Auth0 Management API to check which services a user has connected.

1. Auth0 dashboard → **Applications** → **APIs** → **Auth0 Management API**
2. Go to **Machine to Machine Applications** tab
3. Find your **Sanctum** app and click **Authorize**
4. Grant these scopes:
   - `read:users`
   - `read:user_idp_tokens`
   - `delete:user_idp_tokens`
5. Click **Update**

Now create a dedicated M2M app for management:

1. **Applications** → **Create Application**
2. Name: `Sanctum Management`
3. Type: **Machine to Machine**
4. Select **Auth0 Management API** → authorize with the scopes above
5. Copy the **Client ID** and **Client Secret**

Add to `.env.local`:

```env
AUTH0_MGMT_CLIENT_ID='<Sanctum Management Client ID>'
AUTH0_MGMT_CLIENT_SECRET='<Sanctum Management Client Secret>'
```

---

## Step 8: Add AI API keys

Sanctum uses Anthropic for reasoning and a local embedding model for RAG. Only one API key is needed:

```env
# Required — used for chat reasoning
ANTHROPIC_API_KEY='sk-ant-...'

# Optional — defaults to claude-sonnet-4-0
ANTHROPIC_MODEL='claude-sonnet-4-0'
```

Get your API key at: [console.anthropic.com](https://console.anthropic.com)

> **No OpenAI key needed.** Embeddings are generated locally using `sentence-transformers/all-MiniLM-L6-v2` via `@xenova/transformers`. The model (~90MB) is downloaded automatically on first run and cached. No API key, no cost, no rate limits.

---

## Step 9: Verify the setup

Run the app:

```bash
npm run dev
```

1. Go to `http://localhost:3000`
2. Click **Get started** — you should be redirected to Auth0 login
3. Log in with Google
4. You should land on the dashboard with Google shown as **Connected**
5. Click **Index my data** — Sanctum will fetch your Gmail via Token Vault
6. Go to Chat and ask: _"What are my most recent important emails?"_

If you see answers pulled from your inbox, Token Vault is working correctly.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Missing: domain` warning | Make sure `AUTH0_DOMAIN` is set (not `AUTH0_ISSUER_BASE_URL`) |
| Google connection not showing | Check the connection is enabled for your Sanctum app |
| Token Vault returns null | Ensure Token Vault is toggled ON for the specific social connection |
| Management API 403 | Verify the M2M app has `read:user_idp_tokens` scope |
| Gmail fetch fails | Confirm the Gmail API is enabled in Google Cloud Console |

---

## Production deployment

When deploying to Vercel or another host:

1. Deploy the app and note the production URL, for example `https://sanctum.vercel.app`
2. Set `AUTH0_BASE_URL` to that production URL
3. In Auth0, update:
   - **Allowed Callback URLs**: `https://sanctum.vercel.app/api/auth/callback`
   - **Allowed Logout URLs**: `https://sanctum.vercel.app`
   - **Allowed Web Origins**: `https://sanctum.vercel.app`
4. Keep `http://localhost:3000/api/auth/callback` and `http://localhost:3000` in Auth0 too, so local development still works
5. Update the Google and GitHub app settings only if their app configuration needs a production homepage URL; their redirect URI to Auth0 remains your Auth0 tenant callback such as `https://sanctum-dev.us.auth0.com/login/callback`
6. Add the same environment variables from `.env.example` into Vercel Project Settings → Environment Variables
7. Redeploy after saving the environment variables
