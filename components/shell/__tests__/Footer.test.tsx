import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('법적 링크는 처리방침 → 이용약관 → 마케팅 순서다', () => {
    render(<Footer />);
    const nav = screen.getByRole('navigation', { name: '법적 고지' });
    const names = within(nav).getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(['개인정보 처리방침', '서비스 이용약관', '마케팅 수신 동의']);
  });

  it('갈 곳 없는 # 링크를 두지 않는다', () => {
    render(<Footer />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toBe('#');
    }
  });

  it('테마 토글은 저작권 줄이 아니라 사업자 정보 옆에 있다', () => {
    render(<Footer />);
    const info = screen.getByTestId('footer-business-info');
    expect(within(info).getByRole('button', { name: '다크 모드로 전환' })).toBeInTheDocument();
  });

  // 구분선은 CSS 보더(가상 요소)라 DOM 텍스트가 아니다 — `|` 문자로 되돌리면
  // 스크린리더가 항목마다 "세로 막대"를 읽는다.
  it('항목 구분자는 글자로 넣지 않아 스크린리더가 읽지 않는다', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo').textContent).not.toMatch(/[|│｜]/);
  });

  it('서비스의 실제 운영사와 등록증의 사업자 정보를 공개한다', () => {
    render(<Footer />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('서포트비는 주식회사 노온 (NO-ON Corp.)가 운영하는 맞춤 PG 견적 서비스입니다.');
    expect(footer).toHaveTextContent('상호 주식회사 노온 (NO-ON Corp.)');
    expect(footer).toHaveTextContent('대표자 이성연');
    expect(footer).toHaveTextContent('사업자등록번호 652-87-03871');
    expect(footer).toHaveTextContent('사업장 주소 서울특별시 강남구 강남대로112길 47, 2층 867에이호(논현동)');
  });

  // 전자상거래법 제10조·시행령 제11조의4 — 사이버몰 초기 화면의 운영자 표시 항목.
  // 통신판매업은 미신고(B2B)라 신고번호·공정위 사업자정보확인 링크는 두지 않는다.
  it('운영자 전자우편주소와 호스팅서비스 제공자를 표시한다', () => {
    render(<Footer />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('이메일 contact@support-b.com');
    expect(footer).toHaveTextContent('호스팅서비스 제공자 Amazon Web Services, Inc.');
  });

  // Value: protects=사업자 정보가 스크린리더에 항목명·값 쌍(정의 목록)으로 읽히는 구조;
  // fails_when=구분선 배치 리팩터가 dl/dt/dd 를 span·div 로 평탄화하거나 항목을 빠뜨리거나 순서를 바꿀 때;
  // why_new=기존 toHaveTextContent 단언은 마크업 구조를 무시해 평탄화돼도 통과한다; seam=none
  it('사업자 정보는 항목명과 값이 짝지어진 정의 목록으로 읽힌다', () => {
    render(<Footer />);
    const info = screen.getByTestId('footer-business-info');
    const terms = within(info).getAllByRole('term').map((t) => t.textContent?.trim());
    expect(terms).toEqual(['상호', '대표자', '사업자등록번호', '사업장 주소', '이메일', '호스팅서비스 제공자']);
    const definitions = within(info).getAllByRole('definition');
    expect(definitions).toHaveLength(terms.length);
    expect(definitions[2]).toHaveTextContent('652-87-03871');
    expect(within(definitions[4]).getByRole('link', { name: 'contact@support-b.com' })).toBeInTheDocument();
  });

  it('개인정보 처리방침은 다른 고지와 구분되게 강조한다', () => {
    render(<Footer />);
    const privacy = screen.getByRole('link', { name: '개인정보 처리방침' });
    expect(privacy.querySelector('strong')).not.toBeNull();
    const terms = screen.getByRole('link', { name: '서비스 이용약관' });
    expect(terms.querySelector('strong')).toBeNull();
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
  // 푸터의 공개 운영자 연락처는 contact@support-b.com 이다(2026-10-08 사용자 결정).
  // 별도 '문의하기' 링크 대신 사업자 정보의 이메일이 문의 창구다(2026-10-09 사용자 결정).
  it('운영자 이메일은 살아 있는 문의 메일함으로 가는 링크다', () => {
    render(<Footer />);
    const contact = screen.getByRole('link', { name: 'contact@support-b.com' });
    expect(contact).toHaveAttribute('href', 'mailto:contact@support-b.com');
  });

  // 가이드·용어 사전은 별도 레포(docs-supporter-b)가 docs.support-b.com 에서 서빙한다.
  // 서브도메인이라 권위가 나뉘므로 메인에서 크롤 가능한 링크를 둔다(2026-10-18 사용자 결정).
  it('PG 가이드와 용어 사전 링크는 docs 사이트 루트로 같은 탭에서 연다', () => {
    render(<Footer />);
    const docs = screen.getByRole('link', { name: 'PG 가이드와 용어 사전' });
    expect(docs).toHaveAttribute('href', 'https://docs.support-b.com');
    expect(docs).not.toHaveAttribute('target');
  });

  // docs #11에서 발행한 원고의 제목·주소를 검증해 삭제된 가입비 글로 연결되는 회귀를 막는다.
  it('docs 핵심 가이드는 글 제목으로 각 글 주소에 같은 탭에서 연다', () => {
    render(<Footer />);
    const nav = screen.getByRole('navigation', { name: '서포트비 콘텐츠' });
    const links = within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]);
    expect(links).toEqual([
      ['PG 가이드와 용어 사전', 'https://docs.support-b.com', null],
      ['부분 환불은 어떻게 하나요? 주문 취소부터 환불 확인까지', 'https://docs.support-b.com/articles/partial-refund-guide', null],
      ['가상계좌 만들기: 구매자와 쇼핑몰 운영자의 발급 방법', 'https://docs.support-b.com/articles/virtual-account-issuance-guide', null],
      ['PG 수수료 계산법: 수수료율과 실제 정산액이 다른 이유', 'https://docs.support-b.com/articles/pg-fee-calculation', null],
    ]);
  });
});
