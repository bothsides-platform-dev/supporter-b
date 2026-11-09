import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// 게시 판본의 page.tsx 소스 해시를 보존하도록 SEO 설명은 레이아웃에서 제공한다.
export const metadata: Metadata = {
  description: '서포트비의 마케팅 정보 수신 동의 내용과 동의 철회 방법을 확인해요.',
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return children;
}
