import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: '/',
    display: 'standalone',
    // 라이트 캔버스 토큰(styles/tokens.css --md-sys-color-background)과 동일.
    // manifest 는 라이트/다크 변형을 담지 못하므로 라이트 기준으로 고정한다.
    // app/__tests__/chrome-colors.test.ts 가 토큰과의 일치를 고정.
    theme_color: '#FFFFFF',
    background_color: '#FFFFFF',
    lang: 'ko',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
