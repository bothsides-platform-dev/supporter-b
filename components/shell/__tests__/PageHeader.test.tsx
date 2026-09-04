import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="RFP 목록" />);
    expect(screen.getByRole('heading', { name: 'RFP 목록' })).toBeInTheDocument();
  });

  it('renders a count chip when count is provided', () => {
    render(<PageHeader title="진행중" count={7} />);
    // count should be visible
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('does not render a count chip when count is not provided', () => {
    render(<PageHeader title="진행중" />);
    expect(screen.queryByTestId('page-header-count')).not.toBeInTheDocument();
  });

  it('renders the action slot when provided', () => {
    render(<PageHeader title="RFP" action={<button>새 RFP</button>} />);
    expect(screen.getByRole('button', { name: '새 RFP' })).toBeInTheDocument();
  });

  it('does not render the action slot when not provided', () => {
    render(<PageHeader title="RFP" />);
    expect(screen.queryByTestId('page-header-action')).not.toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<PageHeader title="견적 템플릿" description="자주 쓰는 정산조건을 저장해 둬요." />);
    expect(screen.getByText('자주 쓰는 정산조건을 저장해 둬요.')).toBeInTheDocument();
  });

  it('does not render a description when not provided', () => {
    render(<PageHeader title="견적 템플릿" />);
    expect(screen.queryByTestId('page-header-description')).not.toBeInTheDocument();
  });

  // 기존 호출부(/inbox·/rfp·/messages·/notifications·/opportunities)는 description 을
  // 넘기지 않는다 — 그 경우 48px 고정 스트립이 그대로여야 한다.
  it('keeps the fixed 48px strip when there is no description', () => {
    render(<PageHeader title="받은 견적 요청" count={3} />);
    expect(screen.getByTestId('page-header-row')).toHaveClass('h-12');
  });

  it('drops the fixed height when a description is present', () => {
    render(<PageHeader title="받은 견적 요청" description="설명" />);
    expect(screen.getByTestId('page-header-row')).not.toHaveClass('h-12');
  });
});

// countKind='unread' — 칩이 목록 길이가 아니라 미읽음 수를 담는 경우.
//
// 미읽음은 경고도 오류도 아니다. DESIGN.md §7.3 하드룰이 미읽음 카운트를
// primary 로 규정한다 — 이 칩은 사이드바 알림 배지 바로 옆에 서므로, 색이
// 갈리면 같은 뜻에 색이 둘이 된다. 어서션 문법은 Sidebar.test.tsx 와 같다.
describe('PageHeader — 미읽음 카운트 칩', () => {
  it('미읽음이 있으면 primary 로 칠한다 (warning·error 아님)', () => {
    render(<PageHeader title="알림" count={3} countKind="unread" />);
    const pill = screen.getByTestId('page-header-count');
    expect(pill.className).toMatch(/--md-sys-color-primary\)/);
    expect(pill.className).not.toMatch(/--md-sys-color-(warning|error)\)/);
  });

  // aria-label 이 아니라 sr-only 텍스트를 쓴다 — ARIA 1.2 는 role=generic
  // 요소(맨 span)에 aria-label 을 금지하고, 실제 스크린리더 동작이 들쭉날쭉하다.
  // 사이드바 배지는 <a> 안에 있어서 되는 것이고 이 칩에는 그런 조상이 없다.
  it('스크린리더에 "안 읽음 N건" 으로 읽힌다', () => {
    render(<PageHeader title="알림" count={3} countKind="unread" />);
    const pill = screen.getByTestId('page-header-count');
    expect(pill).toHaveTextContent('안 읽음 3건');
    expect(pill).not.toHaveAttribute('aria-label');
  });

  it('눈에 보이는 것은 숫자뿐이다', () => {
    render(<PageHeader title="알림" count={3} countKind="unread" />);
    const digit = screen.getByText('3');
    expect(digit).toHaveClass('md-numeric');
    // 라벨은 sr-only 라 화면에서 자리를 차지하지 않는다.
    expect(screen.getByText('안 읽음')).toHaveClass('sr-only');
  });

  // 0 은 "다 읽었다"는 유효한 정보라 감추지 않는다. 다만 강조할 미읽음이
  // 없으므로 톤은 중립으로 돌아간다.
  it('미읽음이 0 이면 칩은 남되 중립톤으로 돌아간다', () => {
    render(<PageHeader title="알림" count={0} countKind="unread" />);
    const pill = screen.getByTestId('page-header-count');
    expect(pill).toBeInTheDocument();
    expect(pill.className).toMatch(/--md-sys-color-surface-container\)/);
    expect(pill.className).not.toMatch(/--md-sys-color-primary\)/);
  });

  // 나머지 7개 호출부(/rfp·/inbox·/opportunities·/contracts·/quote-templates·
  // /contract-templates 목록·에디터)는 목록 길이를 센다 — 무영향이어야 한다.
  it('countKind 를 넘기지 않은 목록 길이 칩은 중립톤 그대로다', () => {
    render(<PageHeader title="견적 요청" count={7} />);
    const pill = screen.getByTestId('page-header-count');
    expect(pill.className).toMatch(/--md-sys-color-surface-container\)/);
    expect(pill.className).not.toMatch(/--md-sys-color-primary\)/);
    expect(pill).toHaveTextContent('7');
    expect(pill).not.toHaveTextContent('안 읽음');
  });
});
