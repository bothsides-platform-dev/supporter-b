import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

describe('Footer', () => {
  it('renders theme toggle in the footer bottom row', () => {
    render(<Footer />);
    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toBeInTheDocument();
  });

  it('brand line renders the official name 서포트비', () => {
    render(<Footer />);
    expect(screen.getAllByText(/서포트비 CORP\./)).toHaveLength(2);
  });

  // 도메인 리네임(supporter-b → support-b) 잔재 가드. `supporter-b.io` 는 MX·A
  // 레코드가 모두 없어 이 주소로 간 문의 메일은 전부 반송된다 — 랜딩·로그인 등
  // 비인증 면에 노출되는 유일한 문의 창구라 조용히 유실되면 알 길이 없다.
  // 정본 주소는 suspended 화면과 동일한 help@support-b.com 이다.
  it('문의하기 links to the live support mailbox, not the renamed-away domain', () => {
    render(<Footer />);
    const contact = screen.getByRole('link', { name: '문의하기' });
    expect(contact).toHaveAttribute('href', 'mailto:help@support-b.com');
  });
});
