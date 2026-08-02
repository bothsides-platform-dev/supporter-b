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
  scan: (opts?: { takeOver?: true }) => Promise<
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
    setup(async () => ({ ok: false, error: 'SNOWSIGN_NETWORK' }));
    expect(await screen.findByText(/전자서명 서비스에 연결하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/SNOWSIGN_NETWORK/)).not.toBeInTheDocument();
  });

  // 스캔이 실패하면 사용자가 할 수 있는 게 있어야 한다 — 닫았다 다시 여는 것 말고.
  it('스캔이 실패해도 다시 확인할 수 있다', async () => {
    const user = userEvent.setup();
    const scan = vi
      .fn<() => Promise<{ ok: boolean; error?: string; candidates?: SigningRecoveryCandidate[]; truncated?: boolean }>>()
      .mockResolvedValueOnce({ ok: false, error: 'SNOWSIGN_NETWORK' })
      .mockResolvedValueOnce({ ok: true, candidates: [cand()], truncated: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup(scan as any);
    await screen.findByText(/전자서명 서비스에 연결하지 못했어요/);

    await user.click(screen.getByRole('button', { name: '다시 확인해요' }));
    expect(await screen.findByText('이 계약서를 연결할까요?')).toBeInTheDocument();
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

describe('SigningRecoveryDialog — 동료가 리스를 쥐고 있을 때', () => {
  const held = async () => ({ ok: false as const, error: 'SEND_HELD_BY_TEAMMATE' });

  // 막혔다는 사실만 알리고 끝내면 사용자가 할 수 있는 게 없다(자리를 비운 탭은
  // 하트비트로 리스를 무한 연장한다). 이어받기를 이 화면 안에서 제안한다.
  it('이어받기를 제안한다 — 스캔 실패 문구로 끝내지 않는다', async () => {
    setup(held);
    expect(await screen.findByRole('button', { name: '이어받기' })).toBeInTheDocument();
  });

  it('이어받기를 누르면 takeOver 로 다시 스캔한다', async () => {
    const user = userEvent.setup();
    const scan = vi
      .fn<(opts?: { takeOver?: true }) => Promise<ReturnType<typeof held> extends Promise<infer R> ? R : never>>()
      .mockResolvedValueOnce({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup(scan as any);
    await screen.findByRole('button', { name: '이어받기' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (scan as any).mockResolvedValueOnce({ ok: true, candidates: [cand()], truncated: false });

    await user.click(screen.getByRole('button', { name: '이어받기' }));
    await waitFor(() => expect(scan).toHaveBeenLastCalledWith({ takeOver: true }));
    expect(await screen.findByText('이 계약서를 연결할까요?')).toBeInTheDocument();
  });

  // 기본 스캔은 절대 뺏지 않는다 — 사용자가 확인하기 전에는.
  it('최초 스캔은 takeOver 없이 부른다', async () => {
    const scan = vi.fn(held);
    setup(scan);
    await screen.findByRole('button', { name: '이어받기' });
    expect(scan).toHaveBeenCalledWith(undefined);
  });

  // 이어받으면 동료 화면이 닫힌다 — 누르기 전에 그 사실을 알아야 한다.
  it('이어받기의 결과를 미리 알린다', async () => {
    setup(held);
    expect(await screen.findByText(/화면은 바로 닫혀요/)).toBeInTheDocument();
  });

  // 이어받기 자체가 막히면(그 사이 또 뺏김) 그 화면에 머물러 다시 시도할 수 있어야.
  it('이어받기가 또 막히면 이어받기 버튼이 남는다', async () => {
    const user = userEvent.setup();
    const scan = vi.fn(held);
    setup(scan);
    await user.click(await screen.findByRole('button', { name: '이어받기' }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '이어받기' })).toBeInTheDocument();
  });
});
