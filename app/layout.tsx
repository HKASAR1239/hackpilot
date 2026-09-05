import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'HackPilot — Projets',
  description:
    'Gestion de projets de hackathon : brief, prototype, tests et livrables.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body>{children}</body>
    </html>
  );
}
