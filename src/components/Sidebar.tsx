'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, LayoutDashboard, MessageSquare, Lock } from 'lucide-react';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col h-full bg-[#0a0a0f] border-r border-white/5"
      style={{ width: '240px', minWidth: '240px' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-base tracking-tight">Sanctum</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                active
                  ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-violet-400' : 'text-white/30'}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-4 py-4 border-t border-white/5 space-y-3">
        {/* Security Active badge */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-green-500/5 border border-green-500/15 rounded-xl">
          <div className="relative flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <div
              className="absolute w-2 h-2 rounded-full bg-green-400"
              style={{ animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.6 }}
            />
          </div>
          <span className="text-xs font-medium text-green-400">Security Active</span>
        </div>

        {/* Powered by */}
        <div className="flex items-center gap-2 px-1">
          <Lock className="w-3 h-3 text-white/20 shrink-0" />
          <span className="text-[11px] text-white/25 leading-tight">
            Powered by Auth0 Token Vault
          </span>
        </div>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </aside>
  );
}
