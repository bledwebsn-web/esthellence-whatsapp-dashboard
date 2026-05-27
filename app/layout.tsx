import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Esthellence WhatsApp Dashboard",
  description: "Dashboard conversationnel Esthellence",
};

const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('esthellence_theme');
    var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (stored === 'auto' || !stored)
        ? (systemPrefersDark ? 'dark' : 'light')
        : 'dark';
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <style>{`
          :root {
            --app-bg: #050509;
            --app-fg: #e2e8f0;
            --app-muted: #94a3b8;
            --app-border: rgba(255, 255, 255, 0.10);
            --app-panel: rgba(255, 255, 255, 0.03);
            --app-panel-strong: rgba(255, 255, 255, 0.05);
            --app-panel-soft: rgba(255, 255, 255, 0.04);
            --app-header: rgba(2, 6, 23, 0.90);
            --app-sidebar: rgba(255, 255, 255, 0.02);
            --app-composer: rgba(5, 5, 9, 0.95);
            --app-input: rgba(255, 255, 255, 0.06);
            --app-input-border: rgba(255, 255, 255, 0.10);
            --app-inbound-bg: rgba(255, 255, 255, 0.06);
            --app-inbound-border: rgba(255, 255, 255, 0.10);
            --app-outbound-bg: rgba(34, 211, 238, 0.92);
            --app-outbound-text: #020617;
            --app-tick-sent: #64748b;
            --app-tick-delivered: #64748b;
            --app-tick-read: #082f49;
            --app-tick-failed: #b91c1c;
            --app-accent: #22d3ee;
            --app-accent-soft: rgba(34, 211, 238, 0.10);
            --app-accent-border: rgba(34, 211, 238, 0.30);
            --app-badge-bg: rgba(255, 255, 255, 0.10);
            --app-badge-text: #e2e8f0;
            --app-warning-bg: rgba(251, 191, 36, 0.10);
            --app-warning-border: rgba(251, 191, 36, 0.20);
          }

          html.light {
            --app-bg: #f7f7f8;
            --app-fg: #020617;
            --app-muted: #475569;
            --app-border: rgba(15, 23, 42, 0.10);
            --app-panel: rgba(255, 255, 255, 0.78);
            --app-panel-strong: rgba(255, 255, 255, 0.92);
            --app-panel-soft: rgba(255, 255, 255, 0.88);
            --app-header: rgba(255, 255, 255, 0.90);
            --app-sidebar: rgba(255, 255, 255, 0.70);
            --app-composer: rgba(255, 255, 255, 0.94);
            --app-input: rgba(248, 250, 252, 0.98);
            --app-input-border: rgba(148, 163, 184, 0.22);
            --app-inbound-bg: rgba(255, 255, 255, 1);
            --app-inbound-border: rgba(226, 232, 240, 1);
            --app-outbound-bg: #22d3ee;
            --app-outbound-text: #020617;
            --app-tick-sent: #475569;
            --app-tick-delivered: #475569;
            --app-tick-read: #155e75;
            --app-tick-failed: #b91c1c;
            --app-accent: #0891b2;
            --app-accent-soft: rgba(34, 211, 238, 0.12);
            --app-accent-border: rgba(34, 211, 238, 0.28);
            --app-badge-bg: rgba(15, 23, 42, 0.05);
            --app-badge-text: #0f172a;
            --app-warning-bg: rgba(251, 191, 36, 0.12);
            --app-warning-border: rgba(251, 191, 36, 0.22);
          }

          html.dark {
            color-scheme: dark;
          }

          html.light {
            color-scheme: light;
          }

          body {
            background: var(--app-bg);
            color: var(--app-fg);
            font-family: Arial, Helvetica, sans-serif;
          }
        `}</style>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-[var(--app-bg)] text-[var(--app-fg)] font-sans">
        {children}
      </body>
    </html>
  );
}
