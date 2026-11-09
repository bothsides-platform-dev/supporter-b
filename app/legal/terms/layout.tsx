import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// 게시 판본의 page.tsx 소스 해시를 보존하도록 SEO 설명은 레이아웃에서 제공한다.
export const metadata: Metadata = {
  description: '서포트비 서비스 이용에 관한 회원과 회사의 권리, 의무와 책임을 확인해요.',
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
