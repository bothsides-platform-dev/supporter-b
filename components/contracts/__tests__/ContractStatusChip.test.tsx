import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ContractStatusChip } from '../ContractStatusChip';

afterEach(cleanup);

describe('ContractStatusChip', () => {
  it('sent + mySignPending=true → "서명 대기"', () => {
    render(<ContractStatusChip status="sent" mySignPending />);
    expect(screen.getByText('서명 대기')).toBeInTheDocument();
  });

  it('sent + mySignPending=false → "상대 서명 대기"', () => {
    render(<ContractStatusChip status="sent" mySignPending={false} />);
    expect(screen.getByText('상대 서명 대기')).toBeInTheDocument();
  });

  it('completed → "서명 완료"', () => {
    render(<ContractStatusChip status="completed" mySignPending={false} />);
    expect(screen.getByText('서명 완료')).toBeInTheDocument();
  });

  it('declined → "반려"', () => {
    render(<ContractStatusChip status="declined" mySignPending={false} />);
    expect(screen.getByText('반려')).toBeInTheDocument();
  });

  it('canceled → "회수"', () => {
    render(<ContractStatusChip status="canceled" mySignPending={false} />);
    expect(screen.getByText('회수')).toBeInTheDocument();
  });

  it('expired → "기한 만료"', () => {
    render(<ContractStatusChip status="expired" mySignPending={false} />);
    expect(screen.getByText('기한 만료')).toBeInTheDocument();
  });
});
