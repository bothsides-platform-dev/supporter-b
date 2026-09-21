'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileSignature, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { underlineInputClass } from '@/components/forms/inputs';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';
import {
  getAgreementAction,
  saveAgreementAction,
  sendAgreementAction,
} from '@/lib/server/actions/signing/agreementActions';
import {
  AGREEMENT_TITLE,
  AgreementPartiesSchema,
  agreementErrorMessage,
  type AgreementParties,
  type AgreementFeeRow,
} from '@/lib/contract-doc/agreement';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import type { AgreementView } from '@/lib/types/agreement';
import type { SigningView } from '@/lib/types/signing';
import { AgreementConditions } from './AgreementConditions';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';
const border = 'border-[var(--md-sys-color-outline-variant)]';
const errorCopy = (error: string) =>
  error.startsWith('AGREEMENT_')
    ? agreementErrorMessage(error)
    : signingErrorMessage(error, '합의서를 처리하지 못했어요');

export function AgreementFees({ rows }: { rows: AgreementFeeRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <caption className={`pb-3 text-left ${dim}`}>
          최종 수수료는 선정한 견적과 같아요 · 부가세 별도
        </caption>
        <thead>
          <tr className={`border-b ${border}`}>
            {['결제수단·등급', '표준 수수료', '할인 폭', '최종 수수료'].map((label) => (
              <th key={label} className="px-2 py-2 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.label}-${i}`} className={`border-b ${border}`}>
              <th className="max-w-44 break-words px-2 py-3 font-normal">{row.label}</th>
              <td className={`md-numeric whitespace-nowrap px-2 ${dim}`}>{row.standard}</td>
              <td className={`md-numeric whitespace-nowrap px-2 ${dim}`}>{row.discount}</td>
              <td className="md-numeric whitespace-nowrap px-2 font-medium">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgreementPanel({
  signing,
  side,
  children,
}: {
  signing: SigningView;
  side: 'buyer' | 'pg';
  children: ReactNode;
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof getAgreementAction>> | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const router = useRouter();
  const contractId = signing.contract.id;
  const status = signing.contract.status;
  useEffect(() => {
    let stopped = false;
    getAgreementAction({ contractId })
      .then((value) => {
        if (!stopped) setResult(value);
      })
      .catch(() => {
        if (!stopped) setResult({ ok: false, error: 'AGREEMENT_LOAD_FAILED' });
      });
    return () => {
      stopped = true;
    };
  }, [contractId, status, side, reload]);
  if (!result)
    return (
      <p role="status" className={`py-6 ${dim}`}>
        합의서를 불러오는 중이에요…
      </p>
    );
  if (!result.ok)
    return (
      <div className="space-y-3 py-4">
        <p role="alert">{errorCopy(result.error)}</p>
        <Button variant="outlined" onClick={() => setReload((v) => v + 1)}>
          다시 불러오기
        </Button>
      </div>
    );
  if (result.mode === 'legacy') return children;
  const awaiting = status === 'awaiting_pg_template';
  const recover = awaiting && side === 'pg' && !result.editable && !!result.stamp;
  return (
    <div className="space-y-5 py-4">
      <div className="flex items-start gap-3">
        <FileSignature size={22} aria-hidden className={dim} />
        <div>
          <h2 className="md-title-medium">
            {awaiting
              ? side === 'pg'
                ? '장기계약 부속합의서를 준비해요'
                : 'PG사가 합의서를 준비하고 있어요'
              : AGREEMENT_TITLE}
          </h2>
          <p className={`mt-1 text-sm ${dim}`}>
            {awaiting
              ? '선정한 견적의 수수료로 양측에 전자서명을 요청해요.'
              : '서명 요청 이메일에서 서명해요. 양측 서명이 끝나면 완료본을 보관해요.'}
          </p>
        </div>
      </div>
      <AgreementConditions />
      {result.error && (
        <p role="alert" className="text-sm text-[var(--md-sys-color-error)]">
          {errorCopy(result.error)}
        </p>
      )}
      {result.fees.length > 0 && <AgreementFees rows={result.fees} />}
      {awaiting && result.editable && (
        <Button onClick={() => setOpen(true)}>합의서 작성하기</Button>
      )}
      {recover && (
        <div className="space-y-2">
          <p className={`text-sm ${dim}`}>
            이전 발송 결과를 확인해야 해요. 확인하는 동안 회사 정보는 보존해요.
          </p>
          {recoveryError && (
            <p role="alert" className="text-sm text-[var(--md-sys-color-error)]">
              {recoveryError}
            </p>
          )}
          <Button
            disabled={recovering}
            onClick={async () => {
              setRecovering(true);
              setRecoveryError('');
              try {
                const sent = await sendAgreementAction({
                  contractId,
                  stamp: result.stamp!,
                });
                if (!sent.ok && sent.error !== 'ALREADY_SENT' && sent.error !== 'AGREEMENT_CHANGED')
                  setRecoveryError(errorCopy(sent.error));
                else {
                  setReload((v) => v + 1);
                  router.refresh();
                }
              } catch {
                setRecoveryError(
                  '발송 결과를 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
                );
              } finally {
                setRecovering(false);
              }
            }}
          >
            {recovering ? '확인 중…' : '발송 결과 확인하기'}
          </Button>
        </div>
      )}
      {!awaiting && result.snapshot && (
        <a
          className="text-sm text-[var(--md-sys-color-primary)] underline"
          href={`/api/signing/agreements/${contractId}/document`}
          target="_blank"
          rel="noreferrer"
        >
          보낸 합의서 전체 보기<span className="sr-only"> ({NEW_TAB_NOTICE})</span>
        </a>
      )}
      {!awaiting && children}
      {open && result.editable && (
        <AgreementEditor
          initial={result}
          onClose={() => {
            setOpen(false);
            setReload((v) => v + 1);
          }}
          onSent={() => {
            setOpen(false);
            setReload((v) => v + 1);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AgreementEditor({
  initial,
  onClose,
  onSent,
}: {
  initial: AgreementView;
  onClose: () => void;
  onSent: () => void;
}) {
  const [view, setView] = useState(initial);
  const [parties, setParties] = useState<AgreementParties>(initial.parties!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ url: string; stamp: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [leave, setLeave] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const urlRef = useRef<string | null>(null);
  const alive = useRef(true);
  const dirty = (['buyer', 'pg'] as const).some((side) =>
    (['company', 'bizNo', 'address', 'representative'] as const).some(
      (field) => parties[side][field] !== view.parties?.[side][field],
    ),
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const close = () => {
    if (busy) return;
    if (dirty) setLeave(true);
    else onClose();
  };

  async function reloadDraft() {
    setConfirmReload(false);
    setBusy(true);
    try {
      const loaded = await getAgreementAction({ contractId: view.contractId });
      if (!alive.current) return;
      if (!loaded.ok) {
        setError(errorCopy(loaded.error));
        return;
      }
      if (loaded.mode !== 'agreement' || !loaded.editable || !loaded.parties) {
        onClose();
        return;
      }
      setView(loaded);
      setParties(loaded.parties);
      setPreview(null);
      setError('');
      setNotice('최신 저장본을 불러왔어요.');
    } catch {
      setError('불러오지 못했어요. 입력한 내용은 유지했어요.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function save(withPreview: boolean) {
    setBusy(true);
    setError('');
    setNotice('');
    setPreview(null);
    try {
      if (withPreview && !AgreementPartiesSchema.safeParse(parties).success) {
        setError(errorCopy('AGREEMENT_INCOMPLETE'));
        return;
      }
      const saved = await saveAgreementAction({
        contractId: view.contractId,
        revision: view.revision,
        parties,
      });
      if (!saved.ok) {
        setError(errorCopy(saved.error));
        return;
      }
      if (!alive.current) return;
      setView((v) => ({ ...v, revision: saved.revision, parties }));
      const loaded = await getAgreementAction({ contractId: view.contractId });
      if (!loaded.ok || loaded.mode !== 'agreement') {
        setError('저장했지만 화면을 갱신하지 못했어요. 다시 불러와 주세요.');
        return;
      }
      setView(loaded);
      setNotice('회사 정보를 저장했어요.');
      if (!withPreview) return;
      if (loaded.error || !loaded.stamp) {
        setError(errorCopy(loaded.error ?? 'AGREEMENT_CHANGED'));
        return;
      }
      const response = await fetch(
        `/api/signing/agreements/${view.contractId}/document?stamp=${loaded.stamp}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        setError(await response.text());
        return;
      }
      const blob = await response.blob();
      if (!alive.current) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setPreview({ url: urlRef.current, stamp: loaded.stamp });
      setMobileTab('preview');
    } catch {
      if (alive.current) setError('연결을 확인하고 다시 시도해 주세요. 입력한 내용은 유지했어요.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function send() {
    if (!preview || dirty) return;
    setConfirmSend(false);
    setBusy(true);
    setError('');
    try {
      const result = await sendAgreementAction({
        contractId: view.contractId,
        stamp: preview.stamp,
      });
      if (result.ok || result.error === 'ALREADY_SENT') {
        onSent();
        return;
      }
      setError(`${errorCopy(result.error)} 창을 닫으면 현재 발송 상태를 다시 확인해요.`);
      setPreview(null);
    } catch {
      setError('발송 결과를 확인하지 못했어요. 창을 닫고 발송 결과 확인하기를 눌러 주세요.');
      setPreview(null);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const fields = [
    ['company', '상호', 100],
    ['bizNo', '사업자등록번호', 12],
    ['address', '주소', 200],
    ['representative', '대표자명', 50],
  ] as const;
  const validation = AgreementPartiesSchema.safeParse(parties);
  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[94dvh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[1400px]"
        >
          <header
            className={`flex shrink-0 items-start justify-between gap-3 border-b ${border} px-5 py-4`}
          >
            <div>
              <DialogTitle>장기계약 부속합의서 작성</DialogTitle>
              <DialogDescription className="mt-2">
                회사 정보를 채우고 합의서 전체를 확인해요. 본문과 수수료는 고정되어 있어요.
              </DialogDescription>
            </div>
            <Button variant="text" disabled={busy} onClick={close}>
              닫기
            </Button>
          </header>
          <div className={`flex shrink-0 gap-2 border-b ${border} px-4 py-2 lg:hidden`}>
            <Button
              variant={mobileTab === 'edit' ? 'tonal' : 'text'}
              aria-pressed={mobileTab === 'edit'}
              onClick={() => setMobileTab('edit')}
            >
              정보 입력
            </Button>
            <Button
              variant={mobileTab === 'preview' ? 'tonal' : 'text'}
              aria-pressed={mobileTab === 'preview'}
              onClick={() => setMobileTab('preview')}
            >
              합의서 미리보기
            </Button>
          </div>
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
            <div
              className={`${mobileTab === 'edit' ? 'block' : 'hidden'} space-y-6 overflow-y-auto p-5 lg:block`}
            >
              <fieldset disabled={busy} className="space-y-6">
                {(['buyer', 'pg'] as const).map((side) => (
                  <section key={side} className="space-y-4">
                    <h3 className="md-title-small">
                      {side === 'buyer' ? '구매사' : 'PG사'} 회사 정보
                    </h3>
                    {fields.map(([key, label, max]) => {
                      const id = `agreement-${side}-${key}`;
                      const issue =
                        !validation.success &&
                        validation.error.issues.find(
                          (i) => i.path[0] === side && i.path[1] === key,
                        );
                      return (
                        <div key={key} className="space-y-1">
                          <label htmlFor={id} className={`block text-sm ${dim}`}>
                            {side === 'buyer' ? '구매사' : 'PG사'} {label}
                          </label>
                          <input
                            id={id}
                            value={parties[side][key]}
                            maxLength={max}
                            className={`${underlineInputClass} ${key === 'bizNo' ? 'md-numeric' : ''}`}
                            aria-describedby={issue ? `${id}-help` : undefined}
                            onChange={(event) => {
                              setParties((p) => ({
                                ...p,
                                [side]: {
                                  ...p[side],
                                  [key]: event.target.value,
                                },
                              }));
                              setPreview(null);
                            }}
                          />
                          {issue && (
                            <p id={`${id}-help`} className={`text-xs ${dim}`}>
                              {key === 'bizNo'
                                ? '사업자등록번호 10자리를 입력해요.'
                                : `${label}을 입력해요.`}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </fieldset>
              <section className={`space-y-3 border-t ${border} pt-4`}>
                <h3 className="md-title-small">서명 담당자</h3>
                {view.signers &&
                  (['buyer', 'pg'] as const).map((side) => (
                    <p key={side} className="break-all text-sm">
                      {side === 'buyer' ? '구매사' : 'PG사'} · {view.signers![side].name}
                      <br />
                      <span className={dim}>{view.signers![side].email}</span>
                    </p>
                  ))}
                <p className={`text-sm ${dim}`}>
                  대표자 정보와 서명 담당자는 별개예요. 서명 담당자의 휴대폰 인증이 필요해요.
                </p>
                <a
                  href="/settings/profile"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[var(--md-sys-color-primary)] underline"
                >
                  내 프로필 확인<span className="sr-only"> ({NEW_TAB_NOTICE})</span>
                </a>
              </section>
              <AgreementConditions />
              <AgreementFees rows={view.fees} />
            </div>
            <section
              className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} min-h-0 flex-col border-l ${border} bg-[var(--md-sys-color-surface-container-low)] p-3 lg:flex`}
              aria-label="합의서 미리보기"
            >
              {preview && !dirty ? (
                <>
                  <iframe
                    title="발송할 합의서 PDF"
                    src={preview.url}
                    className="min-h-0 w-full flex-1 border-0"
                  />
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 text-sm underline"
                  >
                    미리보기 열기<span className="sr-only"> ({NEW_TAB_NOTICE})</span>
                  </a>
                </>
              ) : (
                <div className={`m-auto max-w-sm space-y-3 p-6 text-center ${dim}`}>
                  <LockKeyhole className="mx-auto" size={28} aria-hidden />
                  <p>
                    회사 정보를 입력한 뒤<br />
                    미리보기 확인하기를 눌러 주세요.
                  </p>
                  <p className="text-sm">실제로 발송할 합의서를 보여드려요.</p>
                </div>
              )}
            </section>
          </div>
          <footer className={`shrink-0 space-y-2 border-t ${border} px-4 py-3`}>
            {error && (
              <p role="alert" className="text-sm text-[var(--md-sys-color-error)]">
                {error}
              </p>
            )}
            {notice && !error && (
              <p role="status" className={`text-sm ${dim}`}>
                {notice}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {error && (
                <Button variant="text" disabled={busy} onClick={() => setConfirmReload(true)}>
                  최신 정보 다시 불러오기
                </Button>
              )}
              <Button variant="text" disabled={busy} onClick={() => void save(false)}>
                임시 저장
              </Button>
              <Button variant="outlined" disabled={busy} onClick={() => void save(true)}>
                {busy ? '처리 중…' : '미리보기 확인하기'}
              </Button>
              <Button disabled={busy || !preview || dirty} onClick={() => setConfirmSend(true)}>
                양측에 서명 요청하기
              </Button>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={leave}
        onOpenChange={setLeave}
        title="작성 화면을 닫을까요?"
        description="저장하지 않은 회사 정보는 사라져요."
        cancelLabel="계속 작성하기"
        confirmLabel="닫기"
        onConfirm={onClose}
      />
      <ConfirmDialog
        open={confirmReload}
        onOpenChange={setConfirmReload}
        title="입력한 내용을 최신 저장본으로 바꿀까요?"
        description="지금 입력한 내용 대신 마지막으로 저장된 회사 정보를 불러와요. 수수료 기준도 다시 확인해요."
        confirmLabel="저장본 불러오기"
        onConfirm={() => void reloadDraft()}
      />
      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="양측에 서명을 요청할까요?"
        description={`구매사 ${view.signers?.buyer.email ?? ''}와 PG사 ${view.signers?.pg.email ?? ''}에게 합의서를 보내요. 발송 후 수정하려면 취소하고 다시 보내야 해요.`}
        cancelLabel="계속 확인하기"
        confirmLabel="서명 요청하기"
        onConfirm={() => void send()}
      />
    </>
  );
}
