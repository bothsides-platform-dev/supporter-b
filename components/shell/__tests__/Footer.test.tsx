import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

describe('Footer', () => {
  it('법적 고지는 서비스 안의 하위 페이지로 연결한다', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: '서비스 이용약관' })).toHaveAttribute('href', '/legal/terms');
    expect(screen.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('href', '/legal/privacy');
    expect(screen.getByRole('link', { name: '마케팅 수신 동의' })).toHaveAttribute('href', '/legal/marketing');
  });
  it('renders theme toggle in the footer bottom row', () => {
    render(<Footer />);
    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toBeInTheDocument();
  });

  it('brand line renders the official name 서포트비', () => {
    render(<Footer />);
    expect(screen.getByText('서포트비')).toBeInTheDocument();
  });

  it('서비스의 실제 운영사와 등록증의 사업자 정보를 공개한다', () => {
    render(<Footer />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('서포트비는 주식회사 노온 (NO-ON Corp.)가 운영하는 PG 비교 견적 서비스입니다.');
    expect(footer).toHaveTextContent('상호 주식회사 노온 (NO-ON Corp.)');
    expect(footer).toHaveTextContent('대표자 이성연');
    expect(footer).toHaveTextContent('사업자등록번호 652-87-03871');
    expect(footer).toHaveTextContent('사업장 주소 서울특별시 강남구 강남대로112길 47, 2층 867에이호(논현동)');
  });

  it('저작권은 서비스명 대신 실제 운영사에 귀속해 표시한다', () => {
    render(<Footer />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} 주식회사 노온 (NO-ON Corp.) All rights reserved.`);
    expect(footer).not.toHaveTextContent('서포트비 CORP.');
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

  it('docs 링크를 표시하지 않는다', () => {
    render(<Footer />);
    expect(screen.queryByRole('link', { name: 'PG 용어 사전' })).toBeNull();
  });
});
