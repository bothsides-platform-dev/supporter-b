import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BizLookupField } from '../BizLookupField';

describe('BizLookupField', () => {
  it('calls onLookup with the formatted bizNo and emits a slim result', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'active' as const,
    }));
    const onResult = vi.fn();
    const onReset = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={onReset}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(onLookup).toHaveBeenCalledWith('123-45-67890'),
    );
    expect(onResult).toHaveBeenCalledWith({
      bizNo: '123-45-67890',
      taxType: 'general',
      status: 'active',
    });
  });

  it('renders only the slim NTS fields (no 상호명/대표자/업종/통신판매업)', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'simple' as const,
      status: 'active' as const,
    }));

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={() => {}}
        onReset={() => {}}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('NTS — 국세청 자동 조회')).toBeInTheDocument(),
    );

    // Slim fields present:
    expect(screen.getByText('사업자번호')).toBeInTheDocument();
    expect(screen.getByText('과세 유형')).toBeInTheDocument();
    expect(screen.getByText('사업자 상태')).toBeInTheDocument();
    expect(screen.getByText('간이과세')).toBeInTheDocument();

    // Pre-Step-6 fields gone:
    expect(screen.queryByText('상호명')).toBeNull();
    expect(screen.queryByText('대표자')).toBeNull();
    expect(screen.queryByText('업종')).toBeNull();
    expect(screen.queryByText('통신판매업')).toBeNull();
  });

  it('shows an error message when onLookup returns valid=false', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({ valid: false as const }));

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={() => {}}
        onReset={() => {}}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(
      await screen.findByText(/사업자번호를 찾지 못했어요/),
    ).toBeInTheDocument();
  });

  it('shows API error message when onLookup returns { valid: false, error: ... }', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: false as const,
      error: '조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
    }));

    render(
      <BizLookupField onLookup={onLookup} onResult={() => {}} onReset={() => {}} />,
    );
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(
      await screen.findByText(/잠시 후 다시 시도해주세요/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '조회' }),
    ).toBeInTheDocument();
  });

  it('shows error and resets to idle when onLookup throws (no infinite loading)', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn().mockRejectedValue(new Error('network'));

    render(
      <BizLookupField onLookup={onLookup} onResult={() => {}} onReset={() => {}} />,
    );
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.queryByText('조회 중…')).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(/오류가 발생했어요/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '조회' })).toBeInTheDocument();
  });
});

describe('BizLookupField — blockedStatuses', () => {
  it('does not call onResult and shows error when closed business is looked up with blockedStatuses', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'closed' as const,
    }));
    const onResult = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={() => {}}
        blockedStatuses={['closed', 'suspended']}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );
    // 패널은 보여주되 onResult는 호출하지 않아야 한다.
    expect(onResult).not.toHaveBeenCalled();
    // 오류 메시지가 표시되어야 한다.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/가입할 수 없어요/);
    // 패널에 "폐업" 텍스트가 보여야 한다.
    expect(screen.getByText('폐업')).toBeInTheDocument();
  });

  it('does not call onResult and shows error when suspended business is looked up with blockedStatuses', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'suspended' as const,
    }));
    const onResult = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={() => {}}
        blockedStatuses={['closed', 'suspended']}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '8888888888');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/가입할 수 없어요/);
    expect(screen.getByText('휴업')).toBeInTheDocument();
  });

  it('still calls onResult for active business even when blockedStatuses is set', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'active' as const,
    }));
    const onResult = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={() => {}}
        blockedStatuses={['closed', 'suspended']}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );
    expect(onResult).toHaveBeenCalledWith({
      bizNo: '123-45-67890',
      taxType: 'general',
      status: 'active',
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('calls onResult for closed business when blockedStatuses is not set (backwards compat)', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'closed' as const,
    }));
    const onResult = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={() => {}}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );
    // blockedStatuses 미지정 시 기존 동작 보존.
    expect(onResult).toHaveBeenCalledWith({
      bizNo: '999-99-99999',
      taxType: 'general',
      status: 'closed',
    });
  });
});
