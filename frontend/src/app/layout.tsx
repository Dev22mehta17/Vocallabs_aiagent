import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Agent Workflow Builder | mini n8n',
  description: 'Enterprise AI Agent Workflow Builder with Hasura, PostgreSQL, LLM execution engine, and dual-layer security permissions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
