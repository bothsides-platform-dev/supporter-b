'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from 'cmdk';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { RfpAttachmentDropzone } from './RfpAttachmentDropzone';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { useLazyPgWorkspaces } from '@/hooks/useLazyPgWorkspaces';
import type { PgWorkspace } from '@/hooks/useLazyPgWorkspaces';
import { useShortcut } from '@/lib/hooks/useShortcut';
import { useIsMac, formatModifierShortcut } from '@/lib/hooks/usePlatform';
import { createRfpAction } from '@/lib/server/actions/rfp';
import type { BizProfile } from '@/lib/types/biz-profile';

function SectionHeader({ num, label }: { num: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {num} — {label}
      </span>
      <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
    </div>
  );
}

type Props = {
  /**
   * Workspace 의 현재 사업자 프로필. 미등록(undefined) 일 수 있다 —
   * 사전 제안 모드(법인 미설립/보완 예정)는 RFP 작성 시점에 "사업자번호 없이"
   * 발송되는 케이스. createRfpAction 의 `bizProfileMode='inherit'` 가 자동으로
   * `'none'` 폴백으로 동작.
   */
  bizProfile?: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'>;
  /** 회사명 (Workspace.name) — 표시용 */
  workspaceName?: string;
  /** 비인증 게스트 모드 — 제출 시 가입 페이지로 이동 */
  guest?: boolean;
};

export function RfpCreateForm({ bizProfile, workspaceName = '', guest = false }: Props) {
  const router = useRouter();
  const draft = useRfpDraftStore();
  const isMac = useIsMac();

  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>('');
  const [minDate] = useState(
    () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  );

  const { pgList, loading: pgLoading, error: pgError, load: loadPg } = useLazyPgWorkspaces();
  const [pgOpen, setPgOpen] = useState(false);
  const [wsInputError, setWsInputError] = useState('');

  const handleWsSelect = (ws: PgWorkspace) => {
    setWsInputError('');
    if (draft.allowedPgWorkspaceIds.some((w) => w.id === ws.id)) {
      setWsInputError('이미 추가된 워크스페이스입니다.');
      return;
    }
    draft.setField('allowedPgWorkspaceIds', [...draft.allowedPgWorkspaceIds, ws]);
  };

  const handleWsRemove = (id: string) => {
    draft.setField(
      'allowedPgWorkspaceIds',
      draft.allowedPgWorkspaceIds.filter((w) => w.id !== id),
    );
  };

  const handleDraftSave = useCallback(() => {
    setSavedAt(
      new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }, []);

  useShortcut(
    's',
    (e) => {
      e.preventDefault();
      handleDraftSave();
    },
    { meta: true, preventInInput: false },
  );

  const pgCount = draft.allowedPgWorkspaceIds.length;

  const canSend =
    draft.title.trim() !== '' &&
    draft.deadline !== '' &&
    pgCount > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend || submitting) return;

    if (guest) {
      // Save the intent so /signup/buyer/workspace can redirect back here
      localStorage.setItem('supporter-b-rfp-next', '/rfp-new');
      router.push('/signup/buyer');
      return;
    }

    setSubmitting(true);
    setServerError('');
    const r = await createRfpAction({
      title: draft.title.trim(),
      memo: draft.memo.trim() || undefined,
      deadline: draft.deadline,
      allowedPgWorkspaceIds: draft.allowedPgWorkspaceIds.map((w) => w.id),
      // Attachments uploaded to /api/files/upload land with ownerId='__draft__';
      // the action patches them to the new rfpId after RFP insert (Step 11 wiring).
      rfpAttachmentIds: draft.rfpFiles.map((f) => f.id),
      send: true,
    });
    setSubmitting(false);
    if (!r.ok) {
      setServerError(r.error);
      return;
    }
    draft.reset();
    router.push(`/rfp/${r.rfpId}`);
  };

  return (
    <form className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-12 lg:h-full" onSubmit={handleSubmit}>
      {/* Left column: sections 01, 02, 03 — independent scroll on lg+ */}
      <div className="space-y-12 lg:border-r lg:border-[var(--md-sys-color-outline-variant)] lg:pr-10 lg:overflow-y-auto lg:min-h-0">
        {/* 01 사업자 정보 — read-only (workspace 시점), 미입력 안내, 또는 게스트 안내 */}
        <section>
          <SectionHeader num="01" label="사업자 정보" />
          {guest ? (
            <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-4 space-y-2">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                [ 가입 후 연동 ]
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)]">
                가입 후 사업자 정보가 자동으로 연동됩니다.
              </p>
              <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                제안 내용을 먼저 작성한 뒤 발송 시 가입 페이지로 이동합니다.
              </p>
            </div>
          ) : bizProfile ? (
            <>
              <div className="border border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                    WORKSPACE — 등록된 사업자
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--md-sys-color-tertiary)]">
                    ✓ 확인됨
                  </span>
                </div>
                {[
                  ['상호명', workspaceName],
                  ['사업자번호', bizProfile.bizNo ?? '미입력'],
                  [
                    '과세 유형',
                    bizProfile.taxType === 'general'
                      ? '일반과세'
                      : bizProfile.taxType === 'simple'
                        ? '간이과세'
                        : bizProfile.taxType === 'exempt'
                          ? '면세'
                          : '—',
                  ],
                  [
                    '사업자 상태',
                    bizProfile.status === 'active'
                      ? '정상'
                      : bizProfile.status === 'suspended'
                        ? '휴업'
                        : bizProfile.status === 'closed'
                          ? '폐업'
                          : '—',
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="px-4 py-2.5 flex items-baseline justify-between">
                    <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                      {label}
                    </span>
                    <span className="text-[13px] text-[var(--md-sys-color-on-surface)] font-mono tabular-nums">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                사업자 정보 갱신은 설정 → 프로필에서 가능합니다.
              </p>
            </>
          ) : (
            <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-4 space-y-2">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                [ 사업자번호 미입력 ]
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)]">
                사업자번호 없이 작성 중입니다.
              </p>
              <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                법인 설립 후에는 설정 → 프로필에서 사업자번호를 등록할 수 있습니다.
              </p>
            </div>
          )}
        </section>

        {/* 02 제안 내용 */}
        <section>
          <SectionHeader num="02" label="제안 내용" />
          <div className="space-y-5">
            <div className="space-y-1">
              <Label size="md" muted={false}>제목 *</Label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => draft.setField('title', e.target.value)}
                placeholder="2026 결제 인프라 제안"
                className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
              />
            </div>
            <div className="space-y-1">
              <Label size="md" muted={false}>자유 메모 (RFP)</Label>
              <textarea
                value={draft.memo}
                onChange={(e) => draft.setField('memo', e.target.value)}
                rows={4}
                placeholder="카드결제·간편결제 통합 솔루션 검토 중입니다. 정산주기 D+1 이내 희망."
                className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors resize-none"
              />
            </div>
            <RfpAttachmentDropzone
              value={draft.rfpFiles}
              onChange={(files) => draft.setField('rfpFiles', files)}
            />
          </div>
        </section>

        {/* 03 PG 워크스페이스 */}
        <section>
          <SectionHeader num="03" label="초대할 PG 워크스페이스" />
          <div className="space-y-4">
            {/* 선택된 워크스페이스 목록 */}
            {draft.allowedPgWorkspaceIds.length > 0 && (
              <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
                {draft.allowedPgWorkspaceIds.map((ws, i) => (
                  <div key={ws.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">
                        {ws.displayName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleWsRemove(ws.id)}
                      className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] transition-colors flex-shrink-0"
                    >
                      제거
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* PG 검색 combobox */}
            <Popover.Root
              open={pgOpen}
              onOpenChange={(v) => {
                setPgOpen(v);
                if (v) loadPg();
              }}
            >
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-left text-[14px] text-[var(--md-sys-color-outline)] hover:border-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
                >
                  PG사 검색…
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="start"
                  sideOffset={4}
                  className="z-50 w-[var(--radix-popover-trigger-width)] bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-md shadow-sm overflow-hidden"
                >
                  <Command>
                    <CommandInput
                      placeholder="PG사 이름 검색"
                      className="w-full bg-transparent px-3 py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none border-b border-[var(--md-sys-color-outline-variant)]"
                    />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                      <CommandEmpty className="py-2 px-3 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                        {pgLoading ? 'LOADING…' : pgError ?? '결과 없음'}
                      </CommandEmpty>
                      {pgList.map((pg) => {
                        const alreadyAdded = draft.allowedPgWorkspaceIds.some((w) => w.id === pg.id);
                        return (
                          <CommandItem
                            key={pg.id}
                            value={pg.displayName}
                            disabled={alreadyAdded}
                            onSelect={() => {
                              handleWsSelect(pg);
                              setPgOpen(false);
                            }}
                            className="px-3 py-2 text-[13px] text-[var(--md-sys-color-on-surface)] data-[selected=true]:bg-[var(--md-sys-color-surface-container-high)] aria-disabled:opacity-40 cursor-pointer"
                          >
                            {pg.displayName}
                          </CommandItem>
                        );
                      })}
                    </CommandList>
                  </Command>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            {wsInputError && (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
                {wsInputError}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Right column: section 04 — fixed in place on lg+ (defensive overflow-y-auto for tall content) */}
      <div className="mt-12 lg:mt-0 lg:overflow-y-auto lg:min-h-0">
        <section>
          <SectionHeader num="04" label="발송 조건" />
          <div className="space-y-6">
            <div className="space-y-1">
              <Label size="md" muted={false}>마감일 *</Label>
              <input
                type="date"
                value={draft.deadline ? draft.deadline.slice(0, 10) : ''}
                min={minDate}
                onChange={(e) =>
                  draft.setField(
                    'deadline',
                    e.target.value ? `${e.target.value}T23:59:59Z` : '',
                  )
                }
                className="block bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] font-mono tabular-nums text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
              />
            </div>

            {!canSend && (
              <ul className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] space-y-1">
                {!draft.title.trim() && <li>· 제안 제목 입력 필요</li>}
                {pgCount === 0 && (
                  <li>· PG 워크스페이스 1개 이상 추가 필요</li>
                )}
                {!draft.deadline && <li>· 마감일 선택 필요</li>}
              </ul>
            )}

            {serverError && (
              <p
                role="alert"
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
              >
                {`발송 실패 — ${serverError}`}
              </p>
            )}

            <Button type="submit" fullWidth size="lg" disabled={!canSend || submitting}>
              {submitting
                ? '발송 중…'
                : pgCount > 0
                  ? `${pgCount}개 PG사에 발송`
                  : '발송'}
            </Button>

            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-outline)]">
              <span>
                <kbd className="text-[var(--md-sys-color-on-surface-variant)]">{formatModifierShortcut('S', isMac)}</kbd> 임시 저장
              </span>
              {savedAt && (
                <span className="text-[var(--md-sys-color-tertiary)]">✓ 저장됨 {savedAt}</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}
