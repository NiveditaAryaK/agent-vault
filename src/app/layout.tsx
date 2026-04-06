import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sanctum - Authorized Agentic RAG',
  description: 'Your AI agent. Your data. Your rules. Powered by Auth0 Token Vault.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0a0a0f] text-white">{children}</body>
    </html>
  );
}
