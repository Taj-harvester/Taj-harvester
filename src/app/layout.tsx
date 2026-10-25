import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Taj Harvester — Spare Parts & Billing ERP',
  description: 'Production inventory, POS billing, dealer order PDF generator, pending dues ledger, and Excel backup system for Taj Harvester tractor and harvester spare parts.',
  openGraph: {
    title: 'Taj Harvester — Spare Parts & Billing ERP',
    description: 'Production inventory, POS billing, dealer order PDF generator, pending dues ledger, and Excel backup system for Taj Harvester tractor and harvester spare parts.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="bg-slate-50 text-slate-900 antialiased selection:bg-amber-600 selection:text-white"
      >
        {children}
      </body>
    </html>
  );
}
