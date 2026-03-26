import Link from 'next/link';
import { Shield, Lock, Zap, Eye, ArrowRight, GitBranch } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Sanctum</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/api/auth/login" className="text-sm text-white/60 hover:text-white transition-colors">
            Sign in
          </a>
          <a
            href="/api/auth/login"
            className="text-sm bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Get started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-950/50 border border-violet-800/40 text-violet-300 text-sm px-4 py-1.5 rounded-full mb-8">
          <Lock className="w-3.5 h-3.5" />
          Powered by Auth0 Token Vault
        </div>

        <h1 className="text-6xl font-bold tracking-tight max-w-3xl leading-tight mb-6">
          Your AI agent.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
            Your data.
          </span>{' '}
          Your rules.
        </h1>

        <p className="text-xl text-white/50 max-w-2xl mb-12 leading-relaxed">
          Sanctum connects your AI agent to Gmail, GitHub, and Notion — using Auth0 Token Vault
          to authenticate every action. Read anything. Write nothing without your approval.
        </p>

        <div className="flex items-center gap-4">
          <a
            href="/api/auth/login"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-6 py-3 rounded-xl font-semibold text-base transition-colors"
          >
            Connect your services <ArrowRight className="w-4 h-4" />
          </a>
          <Link
            href="#how-it-works"
            className="text-white/50 hover:text-white text-base transition-colors"
          >
            How it works
          </Link>
        </div>

        {/* Flow diagram */}
        <div className="mt-20 w-full max-w-4xl">
          <div className="grid grid-cols-3 gap-4 relative">
            <div className="absolute top-1/2 left-[33%] right-[33%] h-px bg-gradient-to-r from-violet-500/50 to-violet-500/50 -translate-y-1/2" />
            {[
              {
                icon: Lock,
                title: 'Auth0 Token Vault',
                desc: 'Your OAuth tokens stored securely. The agent never sees credentials.',
                color: 'violet',
              },
              {
                icon: Zap,
                title: 'Authenticated RAG',
                desc: 'Agent fetches your data using scoped tokens. Private vector index per user.',
                color: 'indigo',
              },
              {
                icon: Eye,
                title: 'Step-up Auth Gates',
                desc: 'Any write action requires your explicit approval. Full audit trail.',
                color: 'purple',
              },
            ].map((item, i) => (
              <div
                key={i}
                className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 text-left relative z-10"
              >
                <div className={`w-10 h-10 rounded-xl bg-${item.color}-600/20 border border-${item.color}-500/30 flex items-center justify-center mb-4`}>
                  <item.icon className={`w-5 h-5 text-${item.color}-400`} />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* How it works */}
      <section id="how-it-works" className="px-8 py-24 max-w-5xl mx-auto w-full">
        <h2 className="text-3xl font-bold mb-12 text-center">How Sanctum works</h2>
        <div className="space-y-6">
          {[
            {
              step: '01',
              title: 'Connect your services',
              desc: 'Sign in with Auth0. Connect Gmail, GitHub, or Notion. Auth0 Token Vault stores your OAuth tokens securely — Sanctum never touches your credentials.',
            },
            {
              step: '02',
              title: 'Agent indexes your data',
              desc: 'Sanctum fetches your emails, repos, and pages using your scoped read tokens from Token Vault. Data is embedded into a private vector index — isolated to you.',
            },
            {
              step: '03',
              title: 'Chat with your data',
              desc: "Ask anything. The agent retrieves relevant context from your indexed data and answers using Claude. It always cites which service it pulled from.",
            },
            {
              step: '04',
              title: 'Approve before any action',
              desc: 'If the agent wants to send an email or post a comment, it proposes the action and waits. You approve via step-up authentication. Nothing writes without your consent.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="flex gap-8 bg-white/[0.02] border border-white/5 rounded-2xl p-6"
            >
              <div className="text-4xl font-bold text-white/10 font-mono w-12 shrink-0">
                {item.step}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-white/40 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-8 py-6 flex items-center justify-between text-sm text-white/30">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4" />
          Built for Auth0 Authorized to Act Hackathon
        </div>
        <div>Auth0 Token Vault + Claude + Next.js</div>
      </footer>
    </div>
  );
}
