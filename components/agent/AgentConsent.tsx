import { Button } from "@/components/primitives/Button";

export function AgentConsent({
  clientName,
  callbackOrigin,
  workspaceName,
  canWrite,
  action,
}: {
  clientName: string;
  callbackOrigin: string;
  workspaceName: string;
  canWrite: boolean;
  action: (form: FormData) => void | Promise<void>;
}) {
  return (
    <section className="mx-auto w-full max-w-xl space-y-6 p-6 text-[var(--md-sys-color-on-surface)]">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">개발 에이전트를 연결해요</h1>
        <p className="break-words">
          {clientName}에서 <strong>{workspaceName}</strong>의 PG 상담을 준비할
          수 있어요.
        </p>
      </div>
      <div className="space-y-3 rounded-md border border-[var(--md-sys-color-outline-variant)] p-4">
        <h2 className="font-semibold">허용할 기능</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>이 연결에서 준비한 초안과 상담 진행 상황 조회</li>
          <li>현재 업종별 PG 상담 후보 확인</li>
          {canWrite && <li>상담 초안 작성과 수정</li>}
        </ul>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          상담은 웹에서 내용을 확인한 뒤 직접 보내요. 견적 선정과 계약 서명은
          별도로 진행해요.
        </p>
      </div>
      <p className="break-all text-sm text-[var(--md-sys-color-on-surface-variant)]">
        연결할 앱이 입력한 이름이에요. 돌아갈 주소: {callbackOrigin}
      </p>
      <p className="text-sm">
        연결은 최대 30일 동안 유지해요. 설정의 에이전트 연결에서 언제든 해제할
        수 있어요. 연결·초안·상담 요청 기록을 서비스 개선을 위해 남겨요.
      </p>
      <form action={action} className="flex justify-end gap-2">
        <Button type="submit" name="decision" value="deny" variant="outlined">
          닫기
        </Button>
        <Button type="submit" name="decision" value="approve">
          연결해요
        </Button>
      </form>
    </section>
  );
}
