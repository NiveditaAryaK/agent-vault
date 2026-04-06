'use client';
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useState } from 'react';
import { Shield, RefreshCw, CheckCircle, XCircle, Trash2, Database, ArrowRight, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';

interface ConnectionStatus {
  connection: string;
  label: string;
  connected: boolean;
  scopes: string[];
  readScopes: string[];
  writeScopes: string[];
  connectedAt?: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  type: string;
  details?: string;
  source?: string;
  success?: boolean;
}

const AUDIT_TYPE_STYLES: Record<string, string> = {
  index: 'text-blue-400 bg-blue-500/10',
  action_staged: 'text-orange-400 bg-orange-500/10',
  action_approved: 'text-green-400 bg-green-500/10',
  action_denied: 'text-white/30 bg-white/5',
  revoke: 'text-red-400 bg-red-500/10',
  stepup_required: 'text-violet-400 bg-violet-500/10',
  chat: 'text-white/40 bg-white/5',
};

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const SERVICE_ICONS: Record<string, string> = {
  'google-oauth2': '🟢',
  github: '⚫',
};

export default function DashboardPage() {
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [indexedCount, setIndexedCount] = useState(0);
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<{ indexed: number; sources: string[] } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  async function fetchPermissions(retries = 2) {
    const res = await fetch('/api/permissions');
    if (res.ok) {
      const data = await res.json();
      // If a connect flow just completed but Management API hasn't caught up yet,
      // retry once after a short delay so the UI reflects the new connection.
      const anyConnected = data.connections?.some((c: ConnectionStatus) => c.connected);
      const params = new URLSearchParams(window.location.search);
      const justConnected = params.get('connected') === '1';
      if (justConnected && !anyConnected && retries > 0) {
        setTimeout(() => fetchPermissions(retries - 1), 4000);
        return;
      }
      setConnections(data.connections);
      setIndexedCount(data.indexedCount);
    }
    setLoading(false);
  }

  async function fetchAuditLog() {
    const res = await fetch('/api/audit');
    if (res.ok) {
      const data = await res.json();
      setAuditLog(data.entries || []);
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.all([fetchPermissions(), fetchAuditLog()]);
    })();
    // Initial dashboard bootstrap only.
    // fetchPermissions intentionally reads the current URL to detect a fresh connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleIndex() {
    setIndexing(true);
    setIndexResult(null);
    const res = await fetch('/api/index-data', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setIndexResult(data);
      await fetchPermissions();
    }
    setIndexing(false);
  }

  async function handleRevoke(connection: string) {
    setRevoking(connection);
    await fetch('/api/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection }),
    });
    await fetchPermissions();
    setRevoking(null);
  }

  const connectedCount = connections.filter((c) => c.connected).length;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      {/* Sidebar */}
      <div className="h-screen sticky top-0">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b border-white/5 px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-white/40 text-sm">Permission Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="flex items-center gap-2 text-sm bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Open chat <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <a
              href="/api/auth/logout"
              className="text-sm text-white/40 hover:text-white transition-colors"
            >
              Sign out
            </a>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-10">
          <div className="max-w-3xl">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-10">
              {[
                { label: 'Connected services', value: `${connectedCount}/2`, color: 'violet' },
                { label: 'Indexed documents', value: indexedCount, color: 'indigo' },
                { label: 'Pending approvals', value: '0', color: 'green' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white/[0.03] border border-white/8 rounded-2xl p-5"
                >
                  <div className={`text-3xl font-bold text-${stat.color}-400 mb-1`}>{stat.value}</div>
                  <div className="text-sm text-white/40">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Connected Services */}
            <section className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">Connected services</h2>
                <div className="text-xs text-white/30 bg-white/5 px-3 py-1 rounded-full">
                  Tokens stored in Auth0 Token Vault
                </div>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <div className="text-white/30 text-sm py-8 text-center">Loading connections...</div>
                ) : connections.map((conn) => (
                  <div
                    key={conn.connection}
                    className="bg-white/[0.02] border border-white/5 rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">{SERVICE_ICONS[conn.connection]}</div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{conn.label}</span>
                            {conn.connected ? (
                              <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                                {/* Animated pulsing green dot */}
                                <span className="relative flex items-center justify-center w-2 h-2">
                                  <span className="absolute inline-block w-2 h-2 rounded-full bg-green-400 opacity-60"
                                    style={{ animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }}
                                  />
                                  <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                                </span>
                                Connected
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                                <XCircle className="w-3 h-3" /> Not connected
                              </span>
                            )}
                          </div>
                          {conn.connected && (
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1.5">
                                {conn.readScopes.map((s) => (
                                  <span key={s} className="text-xs text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded">
                                    read: {s.split('/').pop() || s}
                                  </span>
                                ))}
                                <span className="text-xs text-orange-300/60 bg-orange-500/5 px-2 py-0.5 rounded border border-orange-500/10">
                                  write: requires step-up auth
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {conn.connected ? (
                          <button
                            onClick={() => handleRevoke(conn.connection)}
                            disabled={revoking === conn.connection}
                            className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            {revoking === conn.connection ? 'Revoking...' : 'Revoke access'}
                          </button>
                        ) : (
                          <a
                            href={`/api/auth/connect?connection=${conn.connection}&returnTo=/dashboard`}
                            className="text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Connect
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Index data */}
            <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold mb-1">Index my data</h2>
                  <p className="text-sm text-white/40 max-w-sm">
                    Sanctum will fetch data from your connected services using Token Vault tokens
                    and build your private knowledge base.
                  </p>
                </div>
                <button
                  onClick={handleIndex}
                  disabled={indexing || connectedCount === 0}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/20 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  <Database className="w-4 h-4" />
                  {indexing ? 'Indexing...' : 'Index my data'}
                </button>
              </div>

              {indexResult && (
                <div className="mt-4 bg-green-500/5 border border-green-500/20 rounded-xl p-4 text-sm">
                  <div className="text-green-400 font-medium mb-1">
                    Indexed {indexResult.indexed} documents
                  </div>
                  <div className="text-white/40">
                    Sources: {indexResult.sources.join(', ') || 'None found'}
                  </div>
                </div>
              )}

              {connectedCount === 0 && (
                <div className="mt-4 text-xs text-white/30 text-center">
                  Connect at least one service above to index your data
                </div>
              )}
            </section>

            {/* Security model */}
            <section className="mt-8 bg-violet-950/20 border border-violet-800/20 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" /> Security model
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs text-white/40">
                <div>
                  <div className="text-white/60 font-medium mb-1">What the agent can do:</div>
                  <ul className="space-y-1">
                    <li>Read your emails, repos, pages</li>
                    <li>Answer questions from your data</li>
                    <li>Draft actions (email, comment)</li>
                  </ul>
                </div>
                <div>
                  <div className="text-white/60 font-medium mb-1">What requires your approval:</div>
                  <ul className="space-y-1">
                    <li>Sending any email</li>
                    <li>Posting GitHub comments</li>
                    <li>Modifying any document</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Audit log */}
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-white/40" />
                  Agent activity log
                </h2>
                <button
                  onClick={fetchAuditLog}
                  className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {auditLog.length === 0 ? (
                <div className="text-center text-white/20 text-sm py-10 border border-white/5 rounded-2xl bg-white/[0.01]">
                  No activity yet. Connect a service and start chatting.
                </div>
              ) : (
                <div className="space-y-2">
                  {auditLog.slice(0, 20).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3"
                    >
                      <div className="shrink-0 mt-0.5">
                        {entry.success === false ? (
                          <XCircle className="w-3.5 h-3.5 text-white/25" />
                        ) : entry.success === true ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500/60" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-white/20 mt-0.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-white/70 truncate">{entry.action}</span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${AUDIT_TYPE_STYLES[entry.type] || 'text-white/30 bg-white/5'}`}
                          >
                            {entry.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {entry.details && (
                          <div className="text-xs text-white/30 mt-0.5 truncate">{entry.details}</div>
                        )}
                      </div>
                      <div className="text-xs text-white/20 shrink-0 mt-0.5">
                        {formatRelativeTime(entry.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
