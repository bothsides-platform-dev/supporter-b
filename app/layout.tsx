import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AxiomWebVitals } from "next-axiom";
import { siteConfig } from "@/lib/site-config";
import { CANVAS_COLOR } from "@/lib/theme/canvas-colors";
import { getChannelMember } from "@/lib/channel-io/server";
import { ChannelTalk } from "@/components/shell/ChannelTalk";
import { Analytics } from "@/components/shell/Analytics";
import { Clarity } from "@/components/shell/Clarity";
import { FirstTouchCapture } from "@/components/shell/FirstTouchCapture";
import "./globals.css";

const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "45 920",
});

const jetbrainsMono = localFont({
  src: "../public/fonts/JetBrainsMonoVariable.ttf",
  variable: "--font-mono",
  display: "swap",
  weight: "100 800",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.title, template: "%s — 서포트비" },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
  alternates: { canonical: "/", types: { "text/plain": "/llms.txt" } },
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
  verification: {
    other: { 'naver-site-verification': 'f8d3af23920f570dd4a5b13980fa0d1f43f53f5e' },
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
  // 캔버스 토큰(styles/tokens.css --md-sys-color-background)과 동일해야 한다 —
  // 어긋나면 앱 진입 시 상태바 색이 튄다. app/__tests__/chrome-colors.test.ts 가 고정.
  // 값 출처는 lib/theme/canvas-colors.ts 하나다(리터럴 재기입 금지).
  // 이 정적 선언은 OS 설정 기준의 첫 페인트용이고, 인앱 토글 이후에는
  // lib/theme/chrome-color.ts 가 두 태그를 실효 테마로 덮는다.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: CANVAS_COLOR.light },
    { media: "(prefers-color-scheme: dark)",  color: CANVAS_COLOR.dark },
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
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${pretendard.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Inline script prevents theme flash (FOUC) before React hydration.
            같은 자리에서 브라우저 크롬 색도 실효 테마로 맞춰, 하이드레이션 전까지 상태바가
            OS 설정을 따라가 버리는 구간을 없앤다. 방식은 lib/theme/chrome-color.ts 와 동일
            (media 없는 태그 하나를 head 맨 앞에 만들어 "첫 매치" 규칙으로 이긴다) — 위
            viewport.themeColor 가 내보내는 media 스코프 태그 두 개는 건드리지 않는다.
            로직이 두 벌인 것은 의도다: 인라인 스크립트는 번들 이전에 실행돼야 해서 모듈을
            import 할 수 없다. 값은 리터럴이 아니라 lib/theme/canvas-colors.ts 를 보간한다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('support-b-theme');var t=s?JSON.parse(s)?.state?.theme:null;var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');var m=document.createElement('meta');m.setAttribute('name','theme-color');m.setAttribute('data-chrome-sync','');m.setAttribute('content',d?'${CANVAS_COLOR.dark}':'${CANVAS_COLOR.light}');document.head.insertBefore(m,document.head.firstChild);})();`,
          }}
        />
        <Clarity />
      </head>
      <body className="min-h-full flex flex-col">
        <AxiomWebVitals />
        <FirstTouchCapture />
        {children}
        <ChannelTalk pluginKey={pluginKey} member={member} />
        <Analytics gaId={gaId} />
      </body>
    </html>
  );
}
