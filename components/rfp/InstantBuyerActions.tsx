'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { updateInstantAction } from '@/lib/server/actions/instant-quotes';
type State = {
  canVisit: boolean;
  applied: boolean;
  enrolled: boolean;
  tier: boolean;
  checked: boolean;
  selected: boolean;
  approved: boolean;
};
export function InstantBuyerActions({
  id,
  state,
}: {
  id: string;
  state: State;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState(''),
    router = useRouter();
  const act = async (key: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await updateInstantAction(id, key, report);
      if (!res.ok) setError(res.error);
      else if (res.value.url) window.location.assign(res.value.url);
      else router.refresh();
    } catch {
      setError('연결을 확인하고 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {error && <p role="alert">{error}</p>}
      {!state.enrolled && (
        <div className="flex flex-wrap gap-3">
          {state.canVisit && (
            <Button disabled={busy} onClick={() => void act('visit')}>
              PG 가입 페이지 열기
            </Button>
          )}
          {!state.applied && (
            <Button
              disabled={busy}
              variant="outlined"
              onClick={() => void act('applied')}
            >
              외부 신청을 마쳤어요
            </Button>
          )}
          <Button
            disabled={busy}
            variant="outlined"
            onClick={() => void act('enrolled')}
          >
            PG 가입이 완료됐어요
          </Button>
        </div>
      )}
      {state.enrolled &&
        !state.selected &&
        (state.approved ? (
          <Button disabled={busy} onClick={() => void act('agreement')}>
            합의서 작성 시작
          </Button>
        ) : (
          <p>구매사 입점 승인 후 합의서를 작성할 수 있어요.</p>
        ))}
      {state.enrolled && !state.tier && (
        <p>PG의 적용 등급 확인을 기다리고 있어요.</p>
      )}
      {state.enrolled && state.tier && !state.checked && (
        <fieldset className="space-y-3">
          <legend>이 등급의 견적대로 적용됐나요?</legend>
          <Button
            disabled={busy}
            variant="outlined"
            onClick={() => void act('match')}
          >
            견적대로 적용됐어요
          </Button>
          <label className="block">
            조건이 다르면 실제 적용값과 차이를 적어주세요
            <textarea
              className="block w-full rounded border p-2"
              value={report}
              maxLength={1500}
              onChange={(e) => setReport(e.target.value)}
            />
          </label>
          <Button
            disabled={busy || !report.trim()}
            variant="outlined"
            onClick={() => void act('differ')}
          >
            정정 요청
          </Button>
        </fieldset>
      )}
    </div>
  );
}
