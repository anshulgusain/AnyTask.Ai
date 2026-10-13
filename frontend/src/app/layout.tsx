import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AnyTask AI — Autonomous Browser Form Filling & Task Agent',
  description: 'AI Agent platform powered by OpenAI Agent SDK, Express, Next.js, and Prisma for autonomous web tasks and automated form submissions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
