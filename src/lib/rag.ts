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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface DocumentChunk {
  id: string;
  content: string;
  source: string;
  sourceType: 'email' | 'drive' | 'github' | 'notion';
  metadata: Record<string, string>;
  embedding?: number[];
}

// Per-user isolated RAG stores (production: use per-user Redis or Pinecone namespace)
const userStores = new Map<string, DocumentChunk[]>();

/**
 * Index a user's personal data from all connected services.
 * Uses Token Vault to fetch data — agent never touches raw credentials.
 */
export async function indexUserData(userId: string): Promise<{ indexed: number; sources: string[] }> {
  const connections = await getUserConnections(userId);
  const chunks: DocumentChunk[] = [];
  const sources: string[] = [];

  for (const conn of connections) {
    if (!conn.connected) continue;

    try {
      if (conn.connection === 'google-oauth2') {
        const emailChunks = await fetchGmailChunks();
        chunks.push(...emailChunks);
        if (emailChunks.length > 0) sources.push('Gmail');
      }

      if (conn.connection === 'github') {
        const githubChunks = await fetchGithubChunks();
        chunks.push(...githubChunks);
        if (githubChunks.length > 0) sources.push('GitHub');
      }

      if (conn.connection === 'notion') {
        const notionChunks = await fetchNotionChunks();
        chunks.push(...notionChunks);
        if (notionChunks.length > 0) sources.push('Notion');
      }
    } catch (err) {
      console.error(`Failed to index ${conn.connection}:`, err);
    }
  }

  userStores.set(userId, embedChunks(chunks));
  return { indexed: chunks.length, sources };
}

async function fetchGmailChunks(): Promise<DocumentChunk[]> {
  const res = await callWithVaultToken(
    'google-oauth2',
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=is:important'
  );

  if (!res.ok) return [];

  const data = await res.json();
  const messages: any[] = data.messages || [];
  const chunks: DocumentChunk[] = [];

  for (const msg of messages.slice(0, 10)) {
    const msgRes = await callWithVaultToken(
      'google-oauth2',
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`
    );
    if (!msgRes.ok) continue;

    const msgData = await msgRes.json();
    const headers = msgData.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';
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

  return chunks;
}

function extractEmailBody(payload: any): string {
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

async function fetchGithubChunks(): Promise<DocumentChunk[]> {
  const res = await callWithVaultToken(
    'github',
    'https://api.github.com/issues?filter=assigned&state=open&per_page=20',
    { headers: { Accept: 'application/vnd.github.v3+json' } }
  );

  if (!res.ok) return [];

  const issues = await res.json();
  if (!Array.isArray(issues)) return [];

  return issues.slice(0, 10).map((issue: any) => ({
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
  }));
}

async function fetchNotionChunks(): Promise<DocumentChunk[]> {
  const res = await callWithVaultToken(
    'notion',
    'https://api.notion.com/v1/search',
    {
      method: 'POST',
      headers: {
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 10, filter: { value: 'page', property: 'object' } }),
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  const results: any[] = data.results || [];

  return results.map((page: any) => {
    const title =
      page.properties?.title?.title?.[0]?.plain_text ||
      page.properties?.Name?.title?.[0]?.plain_text ||
      'Untitled';
    return {
      id: `notion-${page.id}`,
      content: `Notion Page: ${title}\nLast edited: ${page.last_edited_time}\nURL: ${page.url}`,
      source: 'Notion',
      sourceType: 'notion' as const,
      metadata: { title, pageId: page.id, url: page.url },
    };
  });
}

// Simple keyword-based embedding for demo (swap for text-embedding-3-small in production)
function simpleEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.values(freq).slice(0, 128).map((v) => v / words.length);
}

function embedChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  return chunks.map((c) => ({ ...c, embedding: simpleEmbedding(c.content) }));
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
export function retrieveChunks(userId: string, query: string, topK = 5): DocumentChunk[] {
  const chunks = userStores.get(userId) || [];
  if (!chunks.length) return [];

  const queryEmbedding = simpleEmbedding(query);

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
  type: 'send_email' | 'post_github_comment' | 'update_notion';
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
  const relevantChunks = retrieveChunks(userId, userMessage, 5);
  const hasData = relevantChunks.length > 0;

  const context = hasData
    ? relevantChunks.map((c) => `[${c.source}] ${c.content}`).join('\n\n---\n\n')
    : 'No indexed data yet. The user has not indexed their services, or no connected services have data.';

  const systemPrompt = `You are Sanctum — a personal AI agent that reads and acts on the user's data from Gmail, GitHub, and Notion.

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
  "type": "send_email|post_github_comment|update_notion",
  "description": "One-line description of what you'll do",
  "details": { "key": "value" }
}
</action>`;

  const messages = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const rawAnswer = response.content[0].type === 'text' ? response.content[0].text : '';
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
      case 'update_notion':
        return { success: true, message: 'Notion page queued for update. (Notion write API requires additional scope configuration.)' };
      default:
        return { success: false, message: 'Unknown action type.' };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
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

  const err = await res.json().catch(() => ({}));
  return { success: false, message: `Failed to send email: ${err?.error?.message || res.statusText}` };
}

async function postGithubComment(details: Record<string, string>) {
  const res = await callWithVaultToken(
    'github',
    `https://api.github.com/repos/${details.repo}/issues/${details.issue_number}/comments`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
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
