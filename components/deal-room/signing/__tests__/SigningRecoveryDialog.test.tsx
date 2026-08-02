import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SigningRecoveryDialog } from '../SigningRecoveryDialog';
import type { SigningRecoveryCandidate } from '@/lib/types/signing';

afterEach(cleanup);

const cand = (over: Partial<SigningRecoveryCandidate> = {}): SigningRecoveryCandidate => ({
  providerContractId: 'ct_one',
  title: '가맹 계약서',
  sentAt: '2026-08-02T01:00:00Z',
  participantCount: 2,
  ...over,
});

function setup(
  scan: () => Promise<
    { ok: true; candidates: SigningRecoveryCandidate[]; truncated: boolean } | { ok: false; error: string }
  >,
  confirm: (id: string) => Promise<{ ok: true } | { ok: false; error: string }> = async () => ({
    ok: true,
  }),
) {
  const onOpenChange = vi.fn();
  const onLinked = vi.fn();
  render(
    <SigningRecoveryDialog
      open
      onOpenChange={onOpenChange}
      scan={scan}
      confirm={confirm}
      onLinked={onLinked}
    />,
  );
  return { onOpenChange, onLinked };
}

describe('SigningRecoveryDialog', () => {
  it('스캔 결과가 0건이면 올리기로 되돌려 보낸다', async () => {
    setup(async () => ({ ok: true, candidates: [], truncated: false }));
    expect(await screen.findByText('보낸 계약서를 찾지 못했어요')).toBeInTheDocument();
    // 0건에는 연결할 것이 없다.
    expect(screen.queryByRole('button', { name: '이 계약서로 연결해요' })).not.toBeInTheDocument();
  });

  it('후보가 하나면 그 계약을 연결한다', async () => {
    const confirm = vi.fn(async () => ({ ok: true as const }));
    const user = userEvent.setup();
    const { onLinked } = setup(
      async () => ({ ok: true, candidates: [cand()], truncated: false }),
      confirm,
    );
    expect(await screen.findByText('이 계약서를 연결할까요?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '이 계약서로 연결해요' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('ct_one'));
    expect(onLinked).toHaveBeenCalled();
  });

  // 첫 번째를 무조건 보내는 구현이면 이 테스트가 잡는다.
  it('여러 건이면 고른 것을 연결한다', async () => {
    const confirm = vi.fn(async () => ({ ok: true as const }));
    const user = userEvent.setup();
    setup(
      async () => ({
        ok: true,
        candidates: [
          cand({ providerContractId: 'ct_1', title: '첫째' }),
          cand({ providerContractId: 'ct_2', title: '둘째' }),
        ],
        truncated: false,
      }),
      confirm,
    );
    expect(await screen.findByText('어떤 계약서를 연결할까요?')).toBeInTheDocument();
    // 고르기 전에는 연결할 수 없다.
    expect(screen.getByRole('button', { name: '이 계약서로 연결해요' })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /둘째/ }));
    await user.click(screen.getByRole('button', { name: '이 계약서로 연결해요' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('ct_2'));
  });

  // 계약 id 는 확인 payload 지 사용자에게 보여줄 값이 아니다(스크린샷·문의에 남는다).
  it('계약 id 를 화면 텍스트로 노출하지 않는다', async () => {
    setup(async () => ({ ok: true, candidates: [cand({ providerContractId: 'ct_secret' })], truncated: false }));
    await screen.findByText('이 계약서를 연결할까요?');
    expect(screen.queryByText(/ct_secret/)).not.toBeInTheDocument();
  });

  it('잘렸으면 안내와 다시 확인을 띄우고, 다시 확인이 스캔을 재실행한다', async () => {
    const user = userEvent.setup();
    const scan = vi.fn(async () => ({ ok: true as const, candidates: [], truncated: true }));
    setup(scan);
    expect(await screen.findByText(/최근 것부터 확인했어요/)).toBeInTheDocument();
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: '다시 확인해요' }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
  });

  it('스캔이 실패하면 사용자 문구로 알린다(raw 코드 금지)', async () => {
    setup(async () => ({ ok: false, error: 'SEND_IN_PROGRESS' }));
    expect(await screen.findByText(/다른 담당자가 계약서를 작성하고 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/SEND_IN_PROGRESS/)).not.toBeInTheDocument();
  });

  // 이미 다른 곳에 붙은 계약은 그 줄만 사라지고 나머지는 남아야 한다 — 닫아버리면
  // 사용자가 스캔을 처음부터 다시 해야 한다.
  it('PROVIDER_CONTRACT_TAKEN 이면 그 후보만 지우고 열어 둔다', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(async () => ({ ok: false as const, error: 'PROVIDER_CONTRACT_TAKEN' }));
    const { onOpenChange } = setup(
      async () => ({
        ok: true,
        candidates: [
          cand({ providerContractId: 'ct_1', title: '첫째' }),
          cand({ providerContractId: 'ct_2', title: '둘째' }),
        ],
        truncated: false,
      }),
      confirm,
    );
    await screen.findByText('어떤 계약서를 연결할까요?');
    await user.click(screen.getByRole('radio', { name: /첫째/ }));
    await user.click(screen.getByRole('button', { name: '이 계약서로 연결해요' }));

    await waitFor(() => expect(screen.queryByText(/첫째/)).not.toBeInTheDocument());
    expect(screen.getByText(/둘째/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('ALREADY_SENT 면 닫는다', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup(
      async () => ({ ok: true, candidates: [cand()], truncated: false }),
      async () => ({ ok: false, error: 'ALREADY_SENT' }),
    );
    await screen.findByText('이 계약서를 연결할까요?');
    await user.click(screen.getByRole('button', { name: '이 계약서로 연결해요' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  // 연타로 계약이 두 번 붙지 않아야 한다. 이걸 보장하는 건 제출 중 버튼 disabled 이며,
  // 핸들러 안에 같은 검사를 또 두는 건 도달 불가라 넣지 않았다(변이로 확인).
  it('제출 중에는 두 번째 클릭이 요청을 만들지 않는다', async () => {
    let resolve!: (v: { ok: true }) => void;
    const confirm = vi.fn(() => new Promise<{ ok: true }>((r) => (resolve = r)));
    setup(async () => ({ ok: true, candidates: [cand()], truncated: false }), confirm);
    await screen.findByText('이 계약서를 연결할까요?');

    const btn = screen.getByRole('button', { name: '이 계약서로 연결해요' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    resolve({ ok: true });
  });
});
