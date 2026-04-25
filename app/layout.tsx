import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pixel Agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0f0f1a' }}>{children}</body>
    </html>
  );
}