'use client';

/**
 * SigningTemplateManager — PG 서명 템플릿 설정(1회/PG). 상태 머신:
 *   list  → 링크된 템플릿 목록(빈 상태 포함). '만들기'로 임베드 시작.
 *   embed → 스노우싸인 template_draft 임베드(iframe)로 자사 계약서·서명칸·역할을 등록.
 *           완료는 (a) 임베드 postMessage 자동 수신, (b) '등록을 마쳤어요' 수동 폴백.
 *   mapping → getTemplateDetail 로 역할명·변수명을 불러와 서포트비 데이터에 연결한 뒤
 *             linkSigningTemplate 로 저장. 저장 즉시 이 PG 낙찰 awaiting 계약이 발송된다.
 *
 * 앱은 좌표/PDF 를 저장하지 않는다(위치지정은 스노우싸인 위임). org 스코핑상 목록은
 * 서버가 이 워크스페이스 링크분만 내려준다.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSignature, Plus, Info, Lock } from 'lucide-react';

import { Button } from '@/components/primitives/Button';
import { Chip } from '@/components/primitives/Chip';
import { Select } from '@/components/primitives/Select';
import { toast } from '@/lib/toast';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import { issueSigningTemplateEmbedSessionAction } from '@/lib/server/actions/signing/issueSigningTemplateEmbedSessionAction';
import { getSigningTemplateDetailAction } from '@/lib/server/actions/signing/getSigningTemplateDetailAction';
import { linkSigningTemplateAction } from '@/lib/server/actions/signing/linkSigningTemplateAction';
import type { PgSigningTemplate, SigningParticipantRole } from '@/lib/types/signing';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

// 변수 매핑 우변(선정 시 낙찰 bid/RFP 에서 치환되는 소스). 서비스 buildVariableSources
// 와 정합해야 한다(신규 소스 추가 시 여기도 추가) — resolve 불가한 키는 조용히 버려진다.
const VARIABLE_SOURCES: { value: string; label: string }[] = [
  { value: '', label: '연결 안 함' },
  { value: 'rfp.title', label: '견적 요청 · 제목' },
  { value: 'rfp.code', label: '견적 요청 · 번호' },
  { value: 'bid.settleCycle', label: '선정 견적 · 정산주기' },
  { value: 'bid.settleLimit', label: '선정 견적 · 정산한도' },
  { value: 'bid.signupFee', label: '선정 견적 · 가입비' },
  { value: 'bid.guaranteeInsurance', label: '선정 견적 · 보증보험' },
];

const ROLE_OPTIONS: { value: '' | SigningParticipantRole; label: string }[] = [
  { value: '', label: '선택해 주세요' },
  { value: 'buyer', label: '구매사 담당(선정자)' },
  { value: 'pg', label: '우리 담당(견적 제출자)' },
];

type Detail = {
  name: string;
  roleNames: string[];
  variables: { name: string; label?: string; required: boolean }[];
};
type View = 'list' | 'embed' | 'mapping';

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={
        'rounded-[10px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] ' +
        className
      }
    >
      {children}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className={'mt-3 flex items-start gap-2 text-[12.5px] ' + dim}>
      <Info className="mt-px size-[15px] shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function SigningTemplateManager({
  initialTemplates,
}: {
  initialTemplates: PgSigningTemplate[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>('list');
  const [busy, setBusy] = useState(false);

  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState('');

  const [snowsignTemplateId, setSnowsignTemplateId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState('');
  const [roleMap, setRoleMap] = useState<Record<string, '' | SigningParticipantRole>>({});
  const [varMap, setVarMap] = useState<Record<string, string>>({});
  const [isDefault, setIsDefault] = useState(true);

  // 임베드 자동 완료 — 스노우싸인 iframe 의 postMessage 를 받는다. 이벤트 형태는
  // Phase 11 샌드박스에서 확정하며, 미수신 시 '등록을 마쳤어요' 수동 폴백이 항상 있다.
  useEffect(() => {
    if (view !== 'embed' || !iframeUrl) return;
    let origin = '';
    try {
      origin = new URL(iframeUrl).origin;
    } catch {
      origin = '';
    }
    function onMessage(e: MessageEvent) {
      if (origin && e.origin !== origin) return;
      const d = e.data as { type?: string; templateId?: string; template_id?: string } | null;
      if (!d || typeof d !== 'object') return;
      const tid = d.templateId ?? d.template_id;
      const done =
        d.type === 'template_draft.completed' ||
        d.type === 'template_draft.created' ||
        d.type === 'template.created';
      if (done && tid) void goToMapping(tid);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // effect 는 view/url 로만 재구독한다. goToMapping 은 setState 만 참조해 매 렌더 새
    // 참조여도 안전(구독 시점의 closure 로 충분).
  }, [view, iframeUrl]);

  async function startEmbed() {
    setBusy(true);
    const r = await issueSigningTemplateEmbedSessionAction();
    setBusy(false);
    if (!r.ok) {
      toast(signingErrorMessage(r.error, '계약서 등록 화면을 열지 못했어요'), { type: 'error' });
      return;
    }
    setIframeUrl(r.iframeUrl);
    setManualOpen(false);
    setManualId('');
    setView('embed');
  }

  async function goToMapping(tid: string) {
    setBusy(true);
    const r = await getSigningTemplateDetailAction({ snowsignTemplateId: tid });
    setBusy(false);
    if (!r.ok) {
      toast(signingErrorMessage(r.error, '템플릿 정보를 불러오지 못했어요'), { type: 'error' });
      return;
    }
    setSnowsignTemplateId(tid);
    setDetail({ name: r.name, roleNames: r.roleNames, variables: r.variables });
    setName(r.name);
    setRoleMap(Object.fromEntries(r.roleNames.map((rn) => [rn, '' as const])));
    setVarMap(Object.fromEntries(r.variables.map((v) => [v.name, ''])));
    setIsDefault(true);
    setView('mapping');
  }

  async function save() {
    if (!detail) return;
    const values = Object.values(roleMap);
    const sides = new Set(values);
    if (values.some((v) => v === '') || !sides.has('buyer') || !sides.has('pg')) {
      toast('구매사·PG 서명자를 모두 지정해 주세요.', { type: 'error' });
      return;
    }
    const roleMapping = roleMap as Record<string, SigningParticipantRole>;
    const variableMapping: Record<string, string> = {};
    for (const [k, v] of Object.entries(varMap)) if (v) variableMapping[k] = v;

    setBusy(true);
    const r = await linkSigningTemplateAction({
      snowsignTemplateId,
      name: name.trim() || detail.name,
      roleMapping,
      variableMapping,
      isDefault,
    });
    setBusy(false);
    if (!r.ok) {
      toast(signingErrorMessage(r.error, '저장하지 못했어요'), { type: 'error' });
      return;
    }
    toast('서명 템플릿을 저장했어요', { type: 'success' });
    setView('list');
    router.refresh();
  }

  // ── list ─────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="mx-auto max-w-[720px]">
        <header className="mb-5 flex items-center gap-2">
          <h1 className="text-[17px] font-semibold">서명 템플릿</h1>
          <span className="flex-1" />
          {initialTemplates.length > 0 && (
            <Button variant="outlined" size="sm" icon={<Plus />} disabled={busy} onClick={startEmbed}>
              새 템플릿
            </Button>
          )}
        </header>

        {initialTemplates.length === 0 ? (
          <Panel>
            <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
              <FileSignature className={'size-8 ' + dim} strokeWidth={1.4} />
              <h4 className="text-[14px] font-semibold">서명 템플릿을 만들어 주세요</h4>
              <p className={'max-w-[380px] text-[13px] ' + dim}>
                자사 계약서를 한 번 등록하면, 구매사가 견적을 선정할 때 자동으로 그 계약서로 전자서명이
                시작돼요.
              </p>
              <div className="mt-2">
                <Button variant="filled" size="md" icon={<Plus />} disabled={busy} onClick={startEmbed}>
                  서명 템플릿 만들기
                </Button>
              </div>
            </div>
          </Panel>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {initialTemplates.map((t) => (
                <Panel key={t.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--md-sys-color-surface-container-high)]">
                      <FileSignature className="size-[17px]" strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
                        {t.name}
                        {t.isDefault && <Chip color="tertiary" label="기본" />}
                      </div>
                      <div className={'md-numeric mt-0.5 truncate text-[12px] ' + dim}>
                        {t.snowsignTemplateId} · 역할 {Object.keys(t.roleMapping).length} · 변수{' '}
                        {Object.keys(t.variableMapping).length}
                      </div>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
            <Note>
              다른 PG의 템플릿은 보이지 않아요(org 스코프). 기본 템플릿이 선정 시 자동으로 사용돼요.
            </Note>
          </>
        )}
      </div>
    );
  }

  // ── embed ────────────────────────────────────────────────────────────────
  if (view === 'embed') {
    return (
      <div className="mx-auto max-w-[720px]">
        <header className="mb-5 flex items-center gap-2">
          <h1 className="text-[17px] font-semibold">서명 템플릿</h1>
          <span className={'text-[13px] ' + dim}>› 새 템플릿</span>
          <span className="flex-1" />
          <Button variant="text" size="sm" disabled={busy} onClick={() => setView('list')}>
            취소
          </Button>
        </header>

        <Panel>
          <header className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
            <h3 className="text-[13.5px] font-semibold">계약서 업로드 · 서명칸 배치</h3>
            <span className="flex-1" />
            <Chip color="surface" label="스노우싸인" />
          </header>
          <div className="p-4">
            {iframeUrl && (
              <iframe
                title="스노우싸인 계약서 등록"
                src={iframeUrl}
                className="h-[460px] w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
              />
            )}
            <Note>
              PDF 업로드·서명칸 배치·역할 정의는 스노우싸인 화면 안에서 이뤄져요. 앱은 좌표를 저장하지
              않아요. 등록을 마치면 아래에서 매핑 단계로 넘어가요.
            </Note>

            <div className="mt-3.5 border-t border-[var(--md-sys-color-outline-variant)] pt-3.5">
              {!manualOpen ? (
                <Button variant="outlined" size="sm" disabled={busy} onClick={() => setManualOpen(true)}>
                  등록을 마쳤어요
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-[12.5px] font-medium" htmlFor="snowsign-template-id">
                    스노우싸인 템플릿 ID
                  </label>
                  <input
                    id="snowsign-template-id"
                    aria-label="스노우싸인 템플릿 ID"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="tmpl_..."
                    className="md-numeric h-8 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-2.5 text-[13px] focus:border-[var(--md-sys-color-primary)] focus:outline-none"
                  />
                  <p className={'text-[12px] ' + dim}>
                    스노우싸인 등록 화면에서 만든 템플릿의 ID 를 넣어 주세요. 자동으로 넘어가지 않을 때만
                    쓰면 돼요.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="filled"
                      size="sm"
                      disabled={busy || !manualId.trim()}
                      onClick={() => goToMapping(manualId.trim())}
                    >
                      다음
                    </Button>
                    <Button variant="text" size="sm" disabled={busy} onClick={() => setManualOpen(false)}>
                      닫기
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  // ── mapping ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[720px]">
      <header className="mb-5 flex items-center gap-2">
        <h1 className="text-[17px] font-semibold">서명 템플릿</h1>
        <span className={'text-[13px] ' + dim}>› 매핑</span>
        <span className="flex-1" />
        <Button variant="text" size="sm" disabled={busy} onClick={() => setView('list')}>
          취소
        </Button>
      </header>

      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium" htmlFor="template-name">
            템플릿 이름
          </label>
          <input
            id="template-name"
            aria-label="템플릿 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-full rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-2.5 text-[13px] focus:border-[var(--md-sys-color-primary)] focus:outline-none"
          />
        </div>

        <Panel>
          <header className="border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5">
            <h3 className="text-[13px] font-semibold">역할 매핑</h3>
          </header>
          <div className="px-4 py-2">
            <div className={'grid grid-cols-[1fr_auto_1.4fr] items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] pb-2 text-[11.5px] ' + dim}>
              <span>템플릿 역할</span>
              <span />
              <span>서포트비 서명자</span>
            </div>
            {detail?.roleNames.map((rn) => (
              <div key={rn} className="grid grid-cols-[1fr_auto_1.4fr] items-center gap-2 py-2">
                <span className="truncate rounded-md bg-[var(--md-sys-color-surface-container-high)] px-2 py-1 text-[12.5px] font-medium">
                  {rn}
                </span>
                <span className={dim}>→</span>
                <Select
                  ariaLabel={`역할 매핑: ${rn}`}
                  options={ROLE_OPTIONS as { value: string; label: string }[]}
                  value={roleMap[rn] ?? ''}
                  onChange={(v) => setRoleMap((m) => ({ ...m, [rn]: v as '' | SigningParticipantRole }))}
                />
              </div>
            ))}
          </div>
        </Panel>

        {detail && detail.variables.length > 0 && (
          <Panel>
            <header className="flex items-center gap-1.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5">
              <h3 className="text-[13px] font-semibold">변수 매핑</h3>
              <span className={'text-[12px] font-normal ' + dim}>· 선택</span>
            </header>
            <div className="px-4 py-2">
              {detail.variables.map((v) => (
                <div key={v.name} className="grid grid-cols-[1fr_auto_1.4fr] items-center gap-2 py-2">
                  <span className="truncate rounded-md bg-[var(--md-sys-color-surface-container-high)] px-2 py-1 text-[12.5px] font-medium">
                    {`{${v.name}}`}
                  </span>
                  <span className={dim}>→</span>
                  <Select
                    ariaLabel={`변수 매핑: ${v.name}`}
                    options={VARIABLE_SOURCES}
                    value={varMap[v.name] ?? ''}
                    onChange={(val) => setVarMap((m) => ({ ...m, [v.name]: val }))}
                  />
                </div>
              ))}
              <Note>매핑한 변수는 선정 시 낙찰 견적 값으로 자동 치환돼요.</Note>
            </div>
          </Panel>
        )}

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="size-4 accent-[var(--md-sys-color-primary)]"
          />
          기본 템플릿으로 사용 (선정 시 자동 사용)
        </label>

        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={'flex items-center gap-1.5 text-[12px] ' + dim}>
            <Lock className="size-[13px]" /> 다른 PG는 이 템플릿을 볼 수 없어요.
          </span>
          <div className="flex gap-2">
            <Button variant="text" size="sm" disabled={busy} onClick={() => setView('list')}>
              취소
            </Button>
            <Button variant="filled" size="sm" disabled={busy} onClick={save}>
              템플릿 저장
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
