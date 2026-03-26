'use client';

import { useEffect, useState } from 'react';
import { Shield, RefreshCw, CheckCircle, XCircle, Trash2, Database, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ConnectionStatus {
  connection: string;
  label: string;
  connected: boolean;
  scopes: string[];
  readScopes: string[];
  writeScopes: string[];
  connectedAt?: string;
}

const SERVICE_ICONS: Record<string, string> = {
  'google-oauth2': '🟢',
  github: '⚫',
  notion: '⬜',
};

export default function DashboardPage() {
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [indexedCount, setIndexedCount] = useState(0);
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<{ indexed: number; sources: string[] } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchPermissions() {
    setLoading(true);
    const res = await fetch('/api/permissions');
    if (res.ok) {
      const data = await res.json();
      setConnections(data.connections);
      setIndexedCount(data.indexedCount);
    }
    setLoading(false);
  }

  useEffect(() => { fetchPermissions(); }, []);

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
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top bar */}
      <header className="border-b border-white/5 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold">Sanctum</span>
          <span className="text-white/20">/</span>
          <span className="text-white/50 text-sm">Permission Dashboard</span>
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

      <main className="max-w-4xl mx-auto px-8 py-12">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: 'Connected services', value: `${connectedCount}/3`, color: 'violet' },
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
                          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Connected
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
                        href={`/api/auth/login?connection=${conn.connection}&returnTo=/dashboard`}
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
      </main>
    </div>
  );
}
