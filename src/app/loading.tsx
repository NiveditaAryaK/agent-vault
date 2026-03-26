import { Shield } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        {/* Animated logo */}
        <div className="relative">
          {/* Outer ring */}
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0%, rgba(139,92,246,0.6) 40%, transparent 60%)',
              animation: 'spin 1.4s linear infinite',
              borderRadius: '18px',
              padding: '2px',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
          {/* Logo box */}
          <div
            className="relative w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center"
            style={{
              boxShadow: '0 0 32px 0 rgba(139,92,246,0.35)',
              animation: 'logoBreath 2s ease-in-out infinite',
            }}
          >
            <Shield className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-1.5">
          <span
            className="text-lg font-semibold tracking-tight text-white"
            style={{ animation: 'fadeInUp 0.5s ease-out both' }}
          >
            Sanctum
          </span>
          <span
            className="text-xs text-white/30"
            style={{ animation: 'fadeInUp 0.5s ease-out 0.1s both' }}
          >
            Loading your secure workspace...
          </span>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5" style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-violet-500"
              style={{
                animation: `loadingDot 1.2s ease-in-out infinite`,
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes logoBreath {
          0%, 100% { box-shadow: 0 0 24px 0 rgba(139,92,246,0.25); }
          50% { box-shadow: 0 0 48px 0 rgba(139,92,246,0.5); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes loadingDot {
          0%, 60%, 100% { transform: scale(1); opacity: 0.4; }
          30% { transform: scale(1.4); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
