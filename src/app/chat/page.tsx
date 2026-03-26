'use client';

import { useState, useRef, useEffect } from 'react';
import { Shield, Send, AlertCircle, CheckCircle, XCircle, ArrowLeft, Info } from 'lucide-react';
import Link from 'next/link';

interface PendingAction {
  id: string;
  type: string;
  description: string;
  details: Record<string, string>;
  requiresStepUp: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  pendingAction?: PendingAction;
  actionResult?: { success: boolean; message: string };
}

const ACTION_ICONS: Record<string, string> = {
  send_email: '📧',
  post_github_comment: '💬',
  update_notion: '📝',
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm Sanctum, your authorized AI agent. I have read access to your connected services via Auth0 Token Vault. Ask me anything about your emails, GitHub issues, or Notion pages. If you want me to take action — send a reply, post a comment — I'll propose it and wait for your approval.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history }),
      });

      if (!res.ok) {
        throw new Error('Chat request failed');
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
          pendingAction: data.pendingAction,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(actionId: string, messageIndex: number) {
    setApproving(actionId);
    const res = await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId }),
    });
    const result = await res.json();

    setMessages((prev) =>
      prev.map((msg, i) =>
        i === messageIndex
          ? { ...msg, pendingAction: undefined, actionResult: result }
          : msg
      )
    );
    setApproving(null);
  }

  async function handleDeny(actionId: string, messageIndex: number) {
    await fetch('/api/approve', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId }),
    });

    setMessages((prev) =>
      prev.map((msg, i) =>
        i === messageIndex
          ? { ...msg, pendingAction: undefined, actionResult: { success: false, message: 'Action cancelled by user.' } }
          : msg
      )
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold">Sanctum</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/30 bg-white/[0.03] border border-white/5 px-3 py-1.5 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          Token Vault active
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-3xl mx-auto w-full">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : 'order-0'}`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-violet-600 flex items-center justify-center">
                    <Shield className="w-3 h-3" />
                  </div>
                  <span className="text-xs text-white/40">Sanctum</span>
                </div>
              )}

              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-sm'
                    : 'bg-white/[0.04] border border-white/5 text-white/90 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Info className="w-3 h-3 text-white/20" />
                  {msg.sources.map((s) => (
                    <span key={s} className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Pending action — step-up auth gate */}
              {msg.pendingAction && (
                <div className="mt-3 bg-orange-950/30 border border-orange-500/20 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-orange-300 mb-1">
                        Action requires your approval
                      </div>
                      <div className="text-xs text-white/50 mb-1">
                        {ACTION_ICONS[msg.pendingAction.type]} {msg.pendingAction.description}
                      </div>
                      {Object.entries(msg.pendingAction.details).map(([k, v]) => (
                        <div key={k} className="text-xs text-white/30">
                          <span className="text-white/40 capitalize">{k}:</span> {v}
                        </div>
                      ))}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleApprove(msg.pendingAction!.id, i)}
                          disabled={approving === msg.pendingAction.id}
                          className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" />
                          {approving === msg.pendingAction.id ? 'Executing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleDeny(msg.pendingAction!.id, i)}
                          className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                          Deny
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action result */}
              {msg.actionResult && (
                <div
                  className={`mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                    msg.actionResult.success
                      ? 'text-green-400 bg-green-500/5 border-green-500/20'
                      : 'text-white/40 bg-white/[0.02] border-white/5'
                  }`}
                >
                  {msg.actionResult.success ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  {msg.actionResult.message}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.04] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/5 px-6 py-4 max-w-3xl mx-auto w-full">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask about your emails, repos, or pages..."
            className="flex-1 bg-white/[0.04] border border-white/8 rounded-xl px-4 py-3 text-sm outline-none focus:border-violet-500/50 transition-colors placeholder:text-white/20"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/20 disabled:cursor-not-allowed p-3 rounded-xl transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs text-white/20 text-center mt-3">
          Write actions require your explicit approval via step-up authentication
        </div>
      </div>
    </div>
  );
}
