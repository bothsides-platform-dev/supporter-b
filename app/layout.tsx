import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { siteConfig } from "@/lib/site-config";
import { getChannelMember } from "@/lib/channel-io/server";
import { ChannelTalk } from "@/components/shell/ChannelTalk";
import "./globals.css";

const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "45 920",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.title, template: "%s — Supporter B" },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/apple-icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F9FF" },
    { media: "(prefers-color-scheme: dark)",  color: "#1A1C1E" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const member = await getChannelMember();
  const pluginKey = process.env.NEXT_PUBLIC_CHANNEL_IO_PLUGIN_KEY;
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${pretendard.variable} h-full antialiased`}
    >
      <head>
        {/* Inline script prevents theme flash (FOUC) before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('support-b-theme');var t=s?JSON.parse(s)?.state?.theme:null;var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ChannelTalk pluginKey={pluginKey} member={member} />
      </body>
    </html>
  );
}
