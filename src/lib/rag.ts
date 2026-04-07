/**
 * Authenticated RAG Pipeline
 *
 * The core innovation: RAG retrieval gated by Auth0 Token Vault.
 * Each user gets an isolated knowledge base built from their own data,
 * fetched using their scoped OAuth tokens via Token Vault.
 *
 * No shared vector DB. No cross-user data leakage.
 * Write actions are staged and require step-up auth before execution.
 */

import Anthropic from '@anthropic-ai/sdk';
import { callWithVaultToken, getUserConnections } from './tokenVault';
import { logAudit } from './audit';

// Lazy-loaded sentence-transformers model (runs locally, no API key needed).
// Uses all-MiniLM-L6-v2 — a lightweight 384-dim model great for semantic search.
// First call downloads ~90MB and caches it; subsequent calls are fast.
type Embedder = (
  text: string,
  options: { pooling: 'mean'; normalize: true }
) => Promise<{ data: Float32Array | number[] }>;

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailPayload {
  body?: {
    data?: string;
  };
  headers?: GmailHeader[];
  parts?: GmailPayload[];
  mimeType?: string;
}

interface GmailMessageSummary {
  id: string;
}

interface GmailMessageListResponse {
  messages?: GmailMessageSummary[];
}

interface GmailMessageResponse {
  id: string;
  payload?: GmailPayload;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  repository_url?: string;
  state: string;
  body?: string;
  html_url: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  private: boolean;
  html_url: string;
  updated_at?: string;
  language?: string;
}

interface IndexFetchResult {
  chunks: DocumentChunk[];
  details: string;
}

export interface IndexServiceResult {
  service: string;
  indexed: number;
  status: 'indexed' | 'empty' | 'error';
  details: string;
}

export interface IndexUserDataResult {
  indexed: number;
  sources: string[];
  results: IndexServiceResult[];
}

let _embedder: Embedder | null = null;
async function getEmbedder() {
  if (!_embedder) {
    const { pipeline } = await import('@xenova/transformers');
    _embedder = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')) as Embedder;
  }
  return _embedder;
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  return new Anthropic({ apiKey });
}

function getAnthropicModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-0';
}

export interface DocumentChunk {
  id: string;
  content: string;
  source: string;
  sourceType: 'email' | 'drive' | 'github';
  metadata: Record<string, string>;
  embedding?: number[];
}

// Per-user isolated RAG stores (production: use per-user Redis or Pinecone namespace)
const userStores = new Map<string, DocumentChunk[]>();

/**
 * Index a user's personal data from all connected services.
 * Uses Token Vault to fetch data — agent never touches raw credentials.
 */
export async function indexUserData(userId: string): Promise<IndexUserDataResult> {
  const connections = await getUserConnections(userId);
  const chunks: DocumentChunk[] = [];
  const sources: string[] = [];
  const results: IndexServiceResult[] = [];

  for (const conn of connections) {
    if (!conn.connected) continue;

    try {
      if (conn.connection === 'google-oauth2') {
        const gmailResult = await fetchGmailChunks();
        chunks.push(...gmailResult.chunks);
        if (gmailResult.chunks.length > 0) sources.push('Gmail');
        results.push({
          service: 'Gmail',
          indexed: gmailResult.chunks.length,
          status: gmailResult.chunks.length > 0 ? 'indexed' : 'empty',
          details: gmailResult.details,
        });
      }

      if (conn.connection === 'github') {
        const githubResult = await fetchGithubChunks();
        chunks.push(...githubResult.chunks);
        if (githubResult.chunks.length > 0) sources.push('GitHub');
        results.push({
          service: 'GitHub',
          indexed: githubResult.chunks.length,
          status: githubResult.chunks.length > 0 ? 'indexed' : 'empty',
          details: githubResult.details,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown indexing error';
      console.error(`Failed to index ${conn.connection}:`, err);
      results.push({
        service: conn.connection === 'google-oauth2' ? 'Gmail' : 'GitHub',
        indexed: 0,
        status: 'error',
        details: message,
      });
    }
  }

  userStores.set(userId, await embedChunks(chunks));

  logAudit(userId, {
    action: `Indexed ${chunks.length} document${chunks.length !== 1 ? 's' : ''}`,
    type: 'index',
    details: results.length
      ? results.map((result) => `${result.service}: ${result.details}`).join(' | ')
      : 'No connected services available for indexing',
    success: true,
  });

  return { indexed: chunks.length, sources, results };
}

async function fetchGmailChunks(): Promise<IndexFetchResult> {
  const queries = [
    { label: 'important mail', value: 'is:important' },
    { label: 'recent inbox mail', value: 'in:inbox newer_than:30d' },
    { label: 'recent mail', value: 'newer_than:120d' },
  ];

  let messages: GmailMessageSummary[] = [];
  let queryUsed = queries[0].label;

  for (const query of queries) {
    const res = await callWithVaultToken(
      'google-oauth2',
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(query.value)}`
    );

    if (!res.ok) {
      throw new Error(`Gmail indexing failed with ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as GmailMessageListResponse;
    messages = data.messages || [];
    queryUsed = query.label;

    if (messages.length > 0) {
      break;
    }
  }

  const chunks: DocumentChunk[] = [];

  for (const msg of messages.slice(0, 10)) {
    const msgRes = await callWithVaultToken(
      'google-oauth2',
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`
    );
    if (!msgRes.ok) continue;

    const msgData = (await msgRes.json()) as GmailMessageResponse;
    const headers = msgData.payload?.headers || [];
    const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
    const from = headers.find((h) => h.name === 'From')?.value || '';
    const date = headers.find((h) => h.name === 'Date')?.value || '';
    const body = extractEmailBody(msgData.payload);

    if (body.trim()) {
      chunks.push({
        id: `gmail-${msg.id}`,
        content: `Email from: ${from}\nSubject: ${subject}\nDate: ${date}\n\n${body.slice(0, 1000)}`,
        source: 'Gmail',
        sourceType: 'email',
        metadata: { subject, from, date, messageId: msg.id },
      });
    }
  }

  if (chunks.length === 0) {
    return {
      chunks,
      details: `No Gmail messages matched the fallback queries (${queries.map((query) => query.label).join(', ')}).`,
    };
  }

  return {
    chunks,
    details: `Indexed ${chunks.length} Gmail message${chunks.length !== 1 ? 's' : ''} from ${queryUsed}.`,
  };
}

function extractEmailBody(payload?: GmailPayload): string {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const body = extractEmailBody(part);
      if (body) return body;
    }
  }
  return '';
}

async function fetchGithubChunks(): Promise<IndexFetchResult> {
  const headers = { Accept: 'application/vnd.github+json' };
  const issueRes = await callWithVaultToken(
    'github',
    'https://api.github.com/issues?filter=assigned&state=open&per_page=20',
    { headers }
  );

  if (!issueRes.ok) {
    throw new Error(`GitHub indexing failed with ${issueRes.status} ${issueRes.statusText}`);
  }

  const issues = (await issueRes.json()) as unknown;
  if (Array.isArray(issues) && issues.length > 0) {
    return {
      chunks: (issues as GitHubIssue[]).slice(0, 10).map((issue) => ({
        id: `github-issue-${issue.id}`,
        content: `GitHub Issue #${issue.number}: ${issue.title}\nRepo: ${issue.repository_url?.split('/').slice(-2).join('/')}\nStatus: ${issue.state}\n\n${issue.body?.slice(0, 800) || '(no body)'}`,
        source: 'GitHub',
        sourceType: 'github' as const,
        metadata: {
          title: issue.title,
          url: issue.html_url,
          state: issue.state,
          number: String(issue.number),
        },
      })),
      details: `Indexed ${Math.min(issues.length, 10)} assigned GitHub issue${issues.length === 1 ? '' : 's'}.`,
    };
  }

  const repoRes = await callWithVaultToken(
    'github',
    'https://api.github.com/user/repos?sort=updated&per_page=10',
    { headers }
  );

  if (!repoRes.ok) {
    throw new Error(`GitHub repo fallback failed with ${repoRes.status} ${repoRes.statusText}`);
  }

  const repos = (await repoRes.json()) as unknown;
  if (!Array.isArray(repos) || repos.length === 0) {
    return {
      chunks: [],
      details: 'No assigned issues or accessible repositories were returned by GitHub.',
    };
  }

  return {
    chunks: (repos as GitHubRepo[]).slice(0, 10).map((repo) => ({
      id: `github-repo-${repo.id}`,
      content: `GitHub Repository: ${repo.full_name}\nVisibility: ${repo.private ? 'private' : 'public'}\nPrimary language: ${repo.language || 'unknown'}\nLast updated: ${repo.updated_at || 'unknown'}\n\n${repo.description || '(no description)'}`,
      source: 'GitHub',
      sourceType: 'github' as const,
      metadata: {
        title: repo.full_name,
        url: repo.html_url,
        visibility: repo.private ? 'private' : 'public',
        language: repo.language || 'unknown',
      },
    })),
    details: `No assigned issues found, so Sanctum indexed ${Math.min(repos.length, 10)} recently updated GitHub repos instead.`,
  };
}

// Fallback keyword-frequency embedding (used only if the local model fails to load)
function keywordEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  // Pad/truncate to 384 dims to match all-MiniLM-L6-v2 dimension
  const vals = Object.values(freq).map((v) => v / (words.length || 1));
  return vals.length >= 384 ? vals.slice(0, 384) : [...vals, ...new Array(384 - vals.length).fill(0)];
}

/**
 * Get a semantic embedding using sentence-transformers/all-MiniLM-L6-v2.
 * Runs entirely locally via @xenova/transformers — no API key required.
 * Falls back to keyword frequency if the model fails to load.
 */
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const embedder = await getEmbedder();
    // all-MiniLM-L6-v2 has a 256-token limit; slice conservatively
    const output = await embedder(text.slice(0, 512), { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn('Local embedding model failed, using keyword fallback:', message);
    return keywordEmbedding(text);
  }
}

async function embedChunks(chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
  return Promise.all(chunks.map(async (c) => ({ ...c, embedding: await getEmbedding(c.content) })));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

/**
 * Retrieve the most relevant chunks for a query from the user's private store.
 * No other user's data is ever accessed — each store is keyed by userId.
 */
export async function retrieveChunks(userId: string, query: string, topK = 5): Promise<DocumentChunk[]> {
  const chunks = userStores.get(userId) || [];
  if (!chunks.length) return [];

  const queryEmbedding = await getEmbedding(query);

  return chunks
    .map((chunk) => ({
      chunk,
      score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => r.chunk);
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PendingAction {
  id: string;
  type: 'send_email' | 'post_github_comment';
  description: string;
  details: Record<string, string>;
  requiresStepUp: boolean;
}

export interface AgentResponse {
  answer: string;
  sources: string[];
  pendingAction?: PendingAction;
}

// Pending write actions awaiting step-up auth approval
const pendingActions = new Map<string, PendingAction>();

/**
 * Main reasoning loop:
 * 1. Retrieve relevant context from user's Token Vault-authenticated sources
 * 2. Reason with Claude
 * 3. If user wants a write action — stage it and require step-up auth
 */
export async function chat(
  userId: string,
  userMessage: string,
  history: ChatMessage[]
): Promise<AgentResponse> {
  let relevantChunks = await retrieveChunks(userId, userMessage, 5);

  if (relevantChunks.length === 0) {
    const indexResult = await indexUserData(userId);
    if (indexResult.indexed > 0) {
      relevantChunks = await retrieveChunks(userId, userMessage, 5);
    }
  }

  const hasData = relevantChunks.length > 0;

  const context = hasData
    ? relevantChunks.map((c) => `[${c.source}] ${c.content}`).join('\n\n---\n\n')
    : 'No indexed data yet. The user has not indexed their services, or no connected services have data.';

  const systemPrompt = `You are Sanctum — a personal AI agent that reads and acts on the user's data from Gmail and GitHub.

Your security contract:
- You have READ access to data indexed from the user's connected services via Auth0 Token Vault
- For any WRITE action (sending email, posting comments, updating docs), stage the action — never execute without step-up authentication
- Always cite which service your information came from
- If data is unavailable, say so clearly

User's indexed context:
${context}

If the user asks you to WRITE, SEND, or MODIFY anything, respond normally then append an action block:
<action>
{
  "type": "send_email|post_github_comment",
  "description": "One-line description of what you'll do",
  "details": { "key": "value" }
}
</action>`;

  const normalizedHistory = history.filter((m, index) => !(index === 0 && m.role === 'assistant'));
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: getAnthropicModel(),
    max_tokens: 1200,
    system: systemPrompt,
    messages: [
      ...normalizedHistory.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const rawAnswer = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  const actionMatch = rawAnswer.match(/<action>([\s\S]*?)<\/action>/);
  const answer = rawAnswer.replace(/<action>[\s\S]*?<\/action>/, '').trim();

  let pendingAction: PendingAction | undefined;

  if (actionMatch) {
    try {
      const actionData = JSON.parse(actionMatch[1].trim());
      const actionId = `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingAction = {
        id: actionId,
        type: actionData.type,
        description: actionData.description,
        details: actionData.details || {},
        requiresStepUp: true,
      };
      pendingActions.set(actionId, pendingAction);
      logAudit(userId, {
        action: `Agent proposed: ${pendingAction.description}`,
        type: 'action_staged',
        details: `Type: ${pendingAction.type} | Requires step-up auth before execution`,
      });
    } catch {
      // Malformed action block — skip silently
    }
  }

  const sources = [...new Set(relevantChunks.map((c) => c.source))];
  return { answer, sources, pendingAction };
}

/**
 * Execute a staged write action after the user approves via step-up auth.
 * Tokens are retrieved fresh from Auth0 Token Vault at execution time.
 */
export async function executeApprovedAction(
  userId: string,
  actionId: string
): Promise<{ success: boolean; message: string }> {
  const action = pendingActions.get(actionId);
  if (!action) return { success: false, message: 'Action not found or expired.' };

  pendingActions.delete(actionId);

  try {
    switch (action.type) {
      case 'send_email':
        return await sendEmail(action.details);
      case 'post_github_comment':
        return await postGithubComment(action.details);
      default:
        return { success: false, message: 'Unknown action type.' };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, message };
  }
}

async function sendEmail(details: Record<string, string>) {
  const message = [`To: ${details.to}`, `Subject: ${details.subject}`, '', details.body].join('\n');
  const encoded = Buffer.from(message).toString('base64url');

  const res = await callWithVaultToken(
    'google-oauth2',
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (res.ok) return { success: true, message: `Email sent to ${details.to}` };
  const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
  return { success: false, message: `Failed to send email: ${err?.error?.message || res.statusText}` };
}

async function postGithubComment(details: Record<string, string>) {
  const res = await callWithVaultToken(
    'github',
    `https://api.github.com/repos/${details.repo}/issues/${details.issue_number}/comments`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: details.body }),
    }
  );

  if (res.ok) return { success: true, message: 'GitHub comment posted.' };
  return { success: false, message: 'Failed to post GitHub comment. Check write scope.' };
}

export function hasIndexedData(userId: string): boolean {
  return (userStores.get(userId)?.length ?? 0) > 0;
}

export function getIndexedCount(userId: string): number {
  return userStores.get(userId)?.length ?? 0;
}
     
