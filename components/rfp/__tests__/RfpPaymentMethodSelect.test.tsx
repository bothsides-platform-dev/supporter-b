import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RfpPaymentMethodSelect } from '../RfpPaymentMethodSelect';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  localStorage.clear();
  useRfpDraftStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe('RfpPaymentMethodSelect', () => {
  it('11종 결제수단 라벨과 카테고리를 렌더한다', () => {
    render(<RfpPaymentMethodSelect />);
    expect(screen.getByText('간편결제')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카드' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가상계좌' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '네이버페이' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '애플페이' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삼성페이' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품권' })).toBeInTheDocument();
  });

  it('결제수단 토글 시 store.requiredPaymentMethods에 추가된다', async () => {
    const user = userEvent.setup();
    render(<RfpPaymentMethodSelect />);

    await user.click(screen.getByRole('button', { name: '카드' }));
    expect(useRfpDraftStore.getState().requiredPaymentMethods).toEqual(['card']);

    await user.click(screen.getByRole('button', { name: '가상계좌' }));
    expect(useRfpDraftStore.getState().requiredPaymentMethods).toEqual([
      'card',
      'virtual_account',
    ]);
  });

  it('애플페이·삼성페이 토글 시 store.requiredPaymentMethods에 추가된다', async () => {
    const user = userEvent.setup();
    render(<RfpPaymentMethodSelect />);

    await user.click(screen.getByRole('button', { name: '애플페이' }));
    await user.click(screen.getByRole('button', { name: '삼성페이' }));
    expect(useRfpDraftStore.getState().requiredPaymentMethods).toEqual([
      'apple_pay',
      'samsung_pay',
    ]);
  });

  it('이미 선택된 결제수단을 다시 누르면 제거된다', async () => {
    const user = userEvent.setup();
    render(<RfpPaymentMethodSelect />);

    await user.click(screen.getByRole('button', { name: '카드' }));
    await user.click(screen.getByRole('button', { name: '카드' }));
    expect(useRfpDraftStore.getState().requiredPaymentMethods).toEqual([]);
  });

  it('커스텀 결제수단을 입력하고 추가하면 store.customPaymentMethods에 들어간다', async () => {
    const user = userEvent.setup();
    render(<RfpPaymentMethodSelect />);

    await user.type(screen.getByPlaceholderText('직접입력 (예: 포인트결제)'), '포인트결제');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(useRfpDraftStore.getState().customPaymentMethods).toEqual([{ label: '포인트결제' }]);
  });

  it('추가한 커스텀 결제수단을 삭제할 수 있다', async () => {
    const user = userEvent.setup();
    useRfpDraftStore.getState().setField('customPaymentMethods', [{ label: '포인트결제' }]);
    render(<RfpPaymentMethodSelect />);

    await user.click(screen.getByRole('button', { name: '포인트결제 삭제' }));
    expect(useRfpDraftStore.getState().customPaymentMethods).toEqual([]);
  });

  it('error가 true면 결제수단 안내 에러 문구를 표시한다', () => {
    render(<RfpPaymentMethodSelect error />);
    expect(screen.getByText('결제수단을 1개 이상 선택해주세요')).toBeInTheDocument();
  });

  it('error가 없으면 에러 문구를 표시하지 않는다', () => {
    render(<RfpPaymentMethodSelect />);
    expect(screen.queryByText('결제수단을 1개 이상 선택해주세요')).not.toBeInTheDocument();
  });
});
