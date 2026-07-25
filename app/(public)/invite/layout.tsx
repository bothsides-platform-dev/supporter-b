import type { Metadata } from 'next';

// 이 세그먼트에는 page.tsx 가 없다(`/invite` 자체는 404) — 레이아웃만 남겨 둔 것은
// 하위 `rfp/[token]`·`workspace/[token]` 페이지가 **자기 metadata 를 선언하지 않기**
// 때문이다. 여기가 그 둘의 유일한 noindex 출처이므로, page.tsx 가 없다고 이 파일을
// 지우면 토큰이 박힌 초대 URL 이 조용히 색인 대상이 된다.
export const metadata: Metadata = {
  title: '견적 요청 초대',
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
