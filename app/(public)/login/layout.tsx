import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '로그인',
  alternates: { canonical: '/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
