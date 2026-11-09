import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// 게시 판본의 page.tsx 소스 해시를 보존하도록 SEO 설명은 레이아웃에서 제공한다.
export const metadata: Metadata = {
  description: '서포트비가 수집하는 개인정보 항목, 이용 목적, 보유기간과 개인정보 보호책임자 연락처를 확인해요.',
};

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
