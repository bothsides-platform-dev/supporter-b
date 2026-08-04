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

  // 문구는 0건 여부로 갈린다(아래 M10 블록이 그 계약을 못박는다) — 이 케이스는
  // candidates 0 + truncated 라 "못 봤다" 쪽이다. 여기서는 재실행 동작을 지킨다.
  it('잘렸으면 안내와 다시 확인을 띄우고, 다시 확인이 스캔을 재실행한다', async () => {
    const user = userEvent.setup();
    const scan = vi.fn(async () => ({ ok: true as const, candidates: [], truncated: true }));
    setup(scan);
    expect(await screen.findByText(/확인하지 못한 계약이 있어요/)).toBeInTheDocument();
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

  // 파괴적 조작(동료 화면을 닫고 그 사람이 올리던 PDF·서명칸을 없애는 이어받기)의
  // 진입점은 임베드 하나로 모은다. 읽기 동작인 '보낸 계약서 찾기' 에서도 뺏을 수 있으면,
  // 사용자는 목록만 보려다 남의 작업을 날린다.
  it('이 화면에서는 이어받기를 제안하지 않는다', async () => {
    setup(held);
    await screen.findByText('다른 담당자가 계약서를 작성하고 있어요');
    expect(screen.queryByRole('button', { name: '이어받기' })).not.toBeInTheDocument();
  });

  // 막혔다는 사실만 알리고 끝내면 사용자가 할 수 있는 게 없다 — 어디로 가야 하는지 준다.
  it('막혔을 때 어디서 이어받는지 알려준다', async () => {
    setup(held);
    expect(await screen.findByText(/계약서 올리기/)).toBeInTheDocument();
  });

  // 동료가 끝냈을 수 있다 — 다시 확인은 남긴다(뺏지 않는 재시도).
  it('다시 확인해요 로 재시도할 수 있다', async () => {
    const user = userEvent.setup();
    const scan = vi.fn(held);
    setup(scan);
    await user.click(await screen.findByRole('button', { name: '다시 확인해요' }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
  });

  it('스캔은 어떤 경우에도 뺏기를 요청하지 않는다', async () => {
    const scan = vi.fn(held);
    setup(scan);
    await screen.findByText('다른 담당자가 계약서를 작성하고 있어요');
    expect(scan).toHaveBeenCalledWith();
  });
});

// H7 — 서버 액션은 reject 할 수 있다(네트워크·digest·데드라인 밖 예외). catch 가
// 없으면 phase 가 'scanning' 에 영구 고정되고, 마지막 수단인 이 화면이 조용히 죽으면
// PG 는 '계약서 올리기'로 돌아가 두 번째 계약을 발송한다.
describe('SigningRecoveryDialog — 액션 reject 내성 (H7)', () => {
  it('마운트 스캔이 reject 하면 failed 로 전이하고 재시도 버튼을 보인다', async () => {
    setup(async () => {
      throw new Error('network down');
    });
    expect(await screen.findByText('보낸 계약서를 확인하지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 확인해요' })).toBeInTheDocument();
  });

  it('연결(confirm)이 reject 해도 무음이 아니다 — 에러가 보이고 화면이 살아 있다', async () => {
    const user = userEvent.setup();
    setup(
      async () => ({ ok: true, candidates: [cand()], truncated: false }),
      async () => {
        throw new Error('boom');
      },
    );
    await user.click(await screen.findByRole('button', { name: '이 계약서로 연결해요' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // 굳지 않는다 — 다시 시도할 수 있다.
    expect(screen.getByRole('button', { name: '이 계약서로 연결해요' })).toBeEnabled();
  });
});

// 추적 P2 — 부모(SigningTab)가 scan 을 JSX 인라인 화살표로 넘겨 매 렌더 새 함수다.
// 다이얼로그가 부모 memo 에 기대면 리렌더마다 스캔이 다시 나가(64 HTTP + 자기 리스에
// 자기가 막힘) 자기 자신에게 이어받기를 권하게 된다.
describe('SigningRecoveryDialog — 리렌더 재스캔 가드', () => {
  it('scan prop 의 identity 가 바뀌어도 마운트 스캔은 한 번만 나간다', async () => {
    const calls: number[] = [];
    const make = () =>
      vi.fn(async () => {
        calls.push(1);
        return { ok: true as const, candidates: [cand()], truncated: false };
      });
    const { rerender } = render(
      <SigningRecoveryDialog open onOpenChange={vi.fn()} scan={make()} confirm={async () => ({ ok: true })} />,
    );
    await screen.findByText('이 계약서를 연결할까요?');
    rerender(
      <SigningRecoveryDialog open onOpenChange={vi.fn()} scan={make()} confirm={async () => ({ ok: true })} />,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.length).toBe(1);
  });
});

// M10 — 12초짜리 스캔에 진행 표시가 없으면 사용자는 5초쯤에 멈춘 줄 알고 닫는다.
// 0건 결과에도 재시도 동선이 있어야 하고, 실패로 인한 잘림은 문구가 갈라져야 한다.
describe('SigningRecoveryDialog — 진행·0건 동선 (M10)', () => {
  it('스캔 중에는 진행 표시(role=status)가 보인다', () => {
    setup(() => new Promise(() => {}));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('0건이어도 다시 확인해요 버튼이 보인다', async () => {
    setup(async () => ({ ok: true, candidates: [], truncated: false }));
    await screen.findByText('보낸 계약서를 찾지 못했어요');
    expect(screen.getByRole('button', { name: '다시 확인해요' })).toBeInTheDocument();
  });

  it('잘린(truncated) 0건은 "확인하지 못한 계약이 있어요"로 갈린다', async () => {
    setup(async () => ({ ok: true, candidates: [], truncated: true }));
    expect(await screen.findByText(/확인하지 못한 계약이 있어요/)).toBeInTheDocument();
  });
});

// ①C — 이미 서명까지 끝난 고아는 되살릴 값어치가 크지만(안 그러면 딜이 영구히
// 갇힌다) 잘못 붙이면 **서명 완료된 남의 문서 다운로드가 이 딜룸에 열린다.**
// 그래서 세 가지를 지킨다: 따로 떼어 보여주고, 자동 선택하지 않고, 연결 전에 한 번 더 묻는다.
describe('SigningRecoveryDialog — 완료된 고아 (①C 가드)', () => {
  const done = (over = {}) =>
    cand({ providerContractId: 'ct_done', title: '완료 계약서', alreadyCompleted: true, ...over });

  it('완료 후보는 별도 구획에 서명 완료 표시와 함께 보인다', async () => {
    setup(async () => ({ ok: true, candidates: [done()], truncated: false }));
    expect(await screen.findByText(/이미 서명이 끝난 계약서/)).toBeInTheDocument();
  });

  // 하나뿐이어도 미리 고르지 않는다 — 미리 골라 두면 확인창이 형식이 된다.
  it('완료 후보는 하나뿐이어도 자동 선택하지 않는다', async () => {
    setup(async () => ({ ok: true, candidates: [done()], truncated: false }));
    await screen.findByText(/이미 서명이 끝난 계약서/);
    expect(screen.getByRole('radio', { name: '완료 계약서' })).not.toBeChecked();
  });

  it('완료 후보를 고르고 연결을 누르면 확인창이 먼저 뜨고, 확인해야 붙는다', async () => {
    const user = userEvent.setup();
    const confirmFn = vi.fn(async () => ({ ok: true as const }));
    setup(async () => ({ ok: true, candidates: [done()], truncated: false }), confirmFn);
    await user.click(await screen.findByRole('radio', { name: '완료 계약서' }));
    await user.click(screen.getByRole('button', { name: '이 계약서로 연결해요' }));

    // 아직 붙지 않았다.
    expect(confirmFn).not.toHaveBeenCalled();
    expect(await screen.findByText(/이미 서명이 끝난 계약서예요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '연결할게요' }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalledWith('ct_done'));
  });

  // 완료가 아닌 평범한 후보는 기존대로 — 확인창 없이 바로 붙는다.
  it('완료가 아닌 후보는 확인창 없이 바로 연결된다', async () => {
    const user = userEvent.setup();
    const confirmFn = vi.fn(async () => ({ ok: true as const }));
    setup(async () => ({ ok: true, candidates: [cand()], truncated: false }), confirmFn);
    await user.click(await screen.findByRole('button', { name: '이 계약서로 연결해요' }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalledWith('ct_one'));
  });
});

// 리뷰가 잡은 것 — 리렌더 트리거는 막았지만 **클릭 트리거**는 안 막았다. `truncated`
// 가 사실상 항상 서므로 '다시 확인해요' 는 늘 떠 있고, 연타하면 스캔이 겹친다.
// 두 번째 스캔은 자기가 방금 잡은 리스에 막혀(claimForSend 는 소유자 예외가 없다)
// 화면이 **자기 자신에게** 이어받기를 권한다 — 이 브랜치가 고쳤다고 적은 그 증상이다.
describe('SigningRecoveryDialog — 다시 확인 연타 가드', () => {
  it('스캔이 도는 동안에는 다시 확인이 막힌다 (겹치지 않는다)', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const scan = vi.fn(() => {
      calls += 1;
      return new Promise<never>(() => {});
    });
    // 첫 스캔은 끝나고(잘림), 두 번째부터는 매달린다.
    const seq = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, candidates: [], truncated: true })
      .mockImplementation(scan);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup(seq as any);

    const again = await screen.findByRole('button', { name: '다시 확인해요' });
    await user.click(again);
    expect(again).toBeDisabled();
    await user.click(again);
    expect(calls).toBe(1);
  });
});

// 리뷰 지적 — 잘린 문구가 0건/비0건으로 갈리는데, 재조준 과정에서 **비0건 분기의
// 단언이 통째로 사라졌다**(grep '최근 것부터' 가 0건). 예산 배정 수정 전까지 사용자가
// 실제로 보게 될 쪽이 이 분기였다.
describe('SigningRecoveryDialog — 잘린 안내가 0건 여부로 갈린다', () => {
  it('후보가 있는데 잘렸으면 "최근 것부터 확인했어요" 로 안내한다', async () => {
    setup(async () => ({ ok: true, candidates: [cand()], truncated: true }));
    expect(await screen.findByText(/최근 것부터 확인했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/확인하지 못한 계약이 있어요/)).not.toBeInTheDocument();
  });
});
