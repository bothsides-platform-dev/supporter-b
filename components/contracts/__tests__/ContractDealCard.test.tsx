import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ContractDealCard } from '../ContractDealCard';

afterEach(cleanup);

describe('ContractDealCard', () => {
  it('pg + summary 없음 → /contracts/new?rfp={code} 로 "계약서 보내기" CTA 를 렌더', () => {
    render(<ContractDealCard kind="pg" summary={null} rfpCode="P-2605-0042" />);
    const link = screen.getByRole('link', { name: /계약서 보내기/ });
    expect(link).toHaveAttribute('href', '/contracts/new?rfp=P-2605-0042');
  });

  it('buyer + summary 없음(null) → 아무것도 렌더하지 않는다', () => {
    const { container } = render(
      <ContractDealCard kind="buyer" summary={null} rfpCode="P-2605-0042" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('buyer + summary 없음(undefined) → 아무것도 렌더하지 않는다', () => {
    const { container } = render(
      <ContractDealCard kind="buyer" summary={undefined} rfpCode="P-2605-0042" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('summary 있으면 code + 상태칩 + /contracts/{id} 링크를 렌더 (pg, 상대 서명 대기)', () => {
    render(
      <ContractDealCard
        kind="pg"
        summary={{ id: 'doc-1', code: 'CT-2605-0001', status: 'sent', mySignPending: false }}
        rfpCode="P-2605-0042"
      />,
    );
    expect(screen.getByText('CT-2605-0001')).toBeInTheDocument();
    expect(screen.getByText('상대 서명 대기')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /계약서 보기/ });
    expect(link).toHaveAttribute('href', '/contracts/doc-1');
  });

  it('buyer + mySignPending=true → 링크 라벨이 "계약서 확인·서명"', () => {
    render(
      <ContractDealCard
        kind="buyer"
        summary={{ id: 'doc-1', code: 'CT-2605-0001', status: 'sent', mySignPending: true }}
        rfpCode="P-2605-0042"
      />,
    );
    expect(screen.getByRole('link', { name: /계약서 확인·서명/ })).toBeInTheDocument();
  });

  it('pg + mySignPending=true 여도 링크 라벨은 "계약서 보기"(buyer 전용 문구 아님)', () => {
    render(
      <ContractDealCard
        kind="pg"
        summary={{ id: 'doc-1', code: 'CT-2605-0001', status: 'sent', mySignPending: true }}
        rfpCode="P-2605-0042"
      />,
    );
    expect(screen.getByRole('link', { name: /계약서 보기/ })).toBeInTheDocument();
  });
});
