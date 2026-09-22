'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileSignature, LockKeyhole } from 'lucide-react';
import { Chip } from '@/components/primitives/Chip';
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
import { pgContractAction } from '@/lib/signing/pg-contract-action';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import type { AgreementView } from '@/lib/types/agreement';
import type { SigningView } from '@/lib/types/signing';
import { AgreementConditions } from './AgreementConditions';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';
const border = 'border-[var(--md-sys-color-outline-variant)]';
// Agreement dispatch has no PDF-upload fallback. Keep legacy signing copy scoped there.
const agreementContactErrors: Record<string, string> = {
  PG_PHONE_REQUIRED:
    '내 프로필에서 010 휴대폰 번호를 인증해 주세요. 인증을 마치면 합의서를 보낼 수 있어요.',
  BUYER_PHONE_REQUIRED:
    '구매사 담당자에게 010 휴대폰 번호 인증을 요청해 주세요. 인증을 마치면 합의서를 보낼 수 있어요.',
  CONTACT_NOT_FOUND:
    '서명 담당자 정보를 확인할 수 없어요. 잠시 후 다시 확인하고, 계속되면 고객센터로 문의해 주세요.',
};
const errorCopy = (error: string) =>
  agreementContactErrors[error] ??
  (error.startsWith('AGREEMENT_')
    ? agreementErrorMessage(error)
    : signingErrorMessage(error, '합의서를 처리하지 못했어요'));

const fields = [
  ['company', '상호', 100],
  ['bizNo', '사업자등록번호', 12],
  ['address', '주소', 200],
  ['representative', '대표자명', 50],
] as const;

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
              ? side === 'pg'
                ? '양측 회사 정보를 입력해요. 본문과 수수료는 정해져 있어요.'
                : '선정한 견적의 수수료로 양측에 전자서명을 요청해요.'
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
        <Button onClick={() => setOpen(true)}>{pgContractAction({
          status, revision: result.revision, hasProviderRef: false, hasPrepared: false,
        }).label}</Button>
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
          보낸 합의서 전체 보기
          <span className="sr-only"> ({NEW_TAB_NOTICE})</span>
        </a>
      )}
      {!awaiting && children}
      {open && result.editable && (
        <AgreementEditor
          initial={result}
          onClose={() => {
            setOpen(false);
            setReload((v) => v + 1);
            router.refresh();
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
  const [operation, setOperation] = useState<'save' | 'preview' | 'send' | 'refresh' | null>(null);
  const busy = operation !== null;
  const [recovery, setRecovery] = useState<
    'reload' | 'save' | 'preview' | 'refresh' | 'status' | null
  >(null);
  const [error, setError] = useState(initial.error ? errorCopy(initial.error) : '');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ url: string; stamp: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [leave, setLeave] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const urlRef = useRef<string | null>(null);
  const alive = useRef(true);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const sendReady = view.sendReadiness?.buyer === true && view.sendReadiness?.pg === true;
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

  function showError(code: string, fallback: typeof recovery) {
    setError(errorCopy(code));
    setRecovery(code === 'AGREEMENT_CHANGED' ? 'reload' : fallback);
  }

  async function reloadDraft() {
    setConfirmReload(false);
    setOperation('refresh');
    try {
      const loaded = await getAgreementAction({ contractId: view.contractId });
      if (!alive.current) return;
      if (!loaded.ok) {
        showError(loaded.error, 'reload');
        return;
      }
      if (loaded.mode !== 'agreement' || !loaded.editable || !loaded.parties) {
        onClose();
        return;
      }
      setView(loaded);
      setParties(loaded.parties);
      setPreview(null);
      setError(loaded.error ? errorCopy(loaded.error) : '');
      setRecovery(loaded.error ? 'refresh' : null);
      setNotice('최신 저장본을 불러왔어요.');
    } catch {
      setError('불러오지 못했어요. 입력한 내용은 유지했어요.');
      setRecovery('reload');
    } finally {
      if (alive.current) setOperation(null);
    }
  }

  // Recheck a phone updated in another tab without replacing unsaved company fields.
  async function refreshReadiness() {
    setOperation('refresh');
    setNotice('');
    try {
      const loaded = await getAgreementAction({ contractId: view.contractId });
      if (!alive.current) return;
      if (!loaded.ok) {
        showError(loaded.error, 'refresh');
        return;
      }
      if (loaded.mode !== 'agreement' || !loaded.editable) {
        onClose();
        return;
      }
      if (loaded.revision !== view.revision) {
        setPreview(null);
        showError('AGREEMENT_CHANGED', 'reload');
        return;
      }
      if (loaded.stamp !== preview?.stamp) setPreview(null);
      setView(loaded);
      setError(loaded.error ? errorCopy(loaded.error) : '');
      setRecovery(loaded.error ? 'refresh' : null);
      setNotice('최신 서명 준비 상태를 확인했어요.');
    } catch {
      setError('연결을 확인하고 다시 시도해 주세요. 입력한 내용은 유지했어요.');
      setRecovery('refresh');
    } finally {
      if (alive.current) setOperation(null);
    }
  }

  async function save(withPreview: boolean) {
    if (!withPreview && !dirty && view.revision > 0) return;
    setError('');
    setRecovery(null);
    setNotice('');
    if (withPreview) {
      const validation = AgreementPartiesSchema.safeParse(parties);
      if (!validation.success) {
        const [side, key] = validation.error.issues[0].path;
        const label = fields.find(([field]) => field === key)?.[1];
        setError(`${side === 'buyer' ? '구매사' : 'PG사'} ${label} 항목을 확인해 주세요.`);
        setMobileTab('edit');
        requestAnimationFrame(() => {
          if (!alive.current) return;
          const input = inputs.current[`agreement-${String(side)}-${String(key)}`];
          input?.focus();
          input?.scrollIntoView?.({ block: 'nearest' });
        });
        return;
      }
    }
    setOperation(withPreview ? 'preview' : 'save');
    setPreview(null);
    let failureRecovery: 'preview' | 'save' | 'refresh' = withPreview ? 'preview' : 'save';
    try {
      let revision = view.revision;
      if (dirty || revision === 0) {
        const saved = await saveAgreementAction({
          contractId: view.contractId,
          revision,
          parties,
        });
        if (!alive.current) return;
        if (!saved.ok) {
          showError(saved.error, withPreview ? 'preview' : 'save');
          return;
        }
        revision = saved.revision;
        setView((v) => ({ ...v, revision, parties }));
      }
      if (!withPreview) failureRecovery = 'refresh';
      const loaded = await getAgreementAction({ contractId: view.contractId });
      if (!alive.current) return;
      if (!loaded.ok) {
        showError(loaded.error, withPreview ? 'preview' : 'refresh');
        return;
      }
      if (loaded.mode !== 'agreement' || !loaded.editable) {
        onClose();
        return;
      }
      if (loaded.revision !== revision) {
        showError('AGREEMENT_CHANGED', 'reload');
        return;
      }
      setView(loaded);
      if (!withPreview) {
        setNotice('회사 정보를 저장했어요.');
        return;
      }
      if (loaded.error || !loaded.stamp) {
        showError(loaded.error ?? 'AGREEMENT_CHANGED', 'refresh');
        return;
      }
      setMobileTab('preview');
      const response = await fetch(
        `/api/signing/agreements/${view.contractId}/document?stamp=${loaded.stamp}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        const message = await response.text();
        if (!alive.current) return;
        setError(message);
        setRecovery(response.status === 409 ? 'reload' : 'preview');
        return;
      }
      const blob = await response.blob();
      if (!alive.current) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setPreview({ url: urlRef.current, stamp: loaded.stamp });
    } catch {
      if (alive.current) {
        setError('연결을 확인하고 다시 시도해 주세요. 입력한 내용은 유지했어요.');
        setRecovery(failureRecovery);
      }
    } finally {
      if (alive.current) setOperation(null);
    }
  }

  async function send() {
    if (!preview || dirty || !sendReady) return;
    setConfirmSend(false);
    setOperation('send');
    setError('');
    setRecovery(null);
    setNotice('');
    try {
      const result = await sendAgreementAction({
        contractId: view.contractId,
        stamp: preview.stamp,
      });
      if (!alive.current) return;
      if (result.ok || result.error === 'ALREADY_SENT') {
        onSent();
        return;
      }
      showError(
        result.error,
        result.error === 'PG_PHONE_REQUIRED' || result.error === 'BUYER_PHONE_REQUIRED'
          ? 'refresh'
          : 'status',
      );
      setPreview(null);
    } catch {
      if (!alive.current) return;
      setError('발송 결과를 확인하지 못했어요. 작성창을 닫고 현재 발송 상태를 확인해 주세요.');
      setRecovery('status');
      setPreview(null);
    } finally {
      if (alive.current) setOperation(null);
    }
  }

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
                            ref={(node) => {
                              inputs.current[id] = node;
                            }}
                            aria-invalid={!!issue}
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
                    <div key={side} className="space-y-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>
                          {side === 'buyer' ? '구매사' : 'PG사'} · {view.signers![side].name}
                        </span>
                        <Chip
                          color={view.sendReadiness?.[side] ? 'tertiary' : 'warning'}
                          label={view.sendReadiness?.[side] ? '서명 요청 가능' : '휴대폰 인증 필요'}
                        />
                      </div>
                      <p className={`break-all ${dim}`}>{view.signers![side].email}</p>
                      {!view.sendReadiness?.[side] && (
                        <p className={dim}>
                          {errorCopy(
                            side === 'buyer' ? 'BUYER_PHONE_REQUIRED' : 'PG_PHONE_REQUIRED',
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                <p className={`text-sm ${dim}`}>
                  대표자 정보와 서명 담당자는 별개예요. 서명할 때 양측 담당자가 본인인증을 진행해요.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="/settings/profile"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[var(--md-sys-color-primary)] underline"
                  >
                    내 프로필 확인
                    <span className="sr-only"> ({NEW_TAB_NOTICE})</span>
                  </a>
                  <Button variant="text" disabled={busy} onClick={() => void refreshReadiness()}>
                    {operation === 'refresh' ? '확인 중…' : '서명 준비 상태 확인'}
                  </Button>
                </div>
              </section>
              <AgreementConditions />
              <AgreementFees rows={view.fees} />
            </div>
            <section
              className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} min-h-0 flex-col border-l ${border} bg-[var(--md-sys-color-surface-container-low)] p-3 lg:flex`}
              aria-label="합의서 미리보기"
            >
              {operation === 'preview' ? (
                <p role="status" className={`m-auto p-6 text-center text-sm ${dim}`}>
                  합의서 PDF를 만들고 있어요…
                </p>
              ) : preview && !dirty ? (
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
                    미리보기 열기
                    <span className="sr-only"> ({NEW_TAB_NOTICE})</span>
                  </a>
                </>
              ) : (
                <div className={`m-auto max-w-sm space-y-3 p-6 text-center ${dim}`}>
                  <LockKeyhole className="mx-auto" size={28} aria-hidden />
                  <p>
                    회사 정보를 입력한 뒤<br />
                    저장하고 미리보기를 눌러 주세요.
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
              {recovery === 'reload' && (
                <Button variant="text" disabled={busy} onClick={() => setConfirmReload(true)}>
                  최신 정보 다시 불러오기
                </Button>
              )}
              {(recovery === 'save' || recovery === 'preview') && (
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => void save(recovery === 'preview')}
                >
                  {recovery === 'save' ? '저장 다시 시도하기' : '미리보기 다시 시도하기'}
                </Button>
              )}
              {recovery === 'refresh' && (
                <Button variant="outlined" disabled={busy} onClick={() => void refreshReadiness()}>
                  최신 상태 확인하기
                </Button>
              )}
              {recovery === 'status' && (
                <Button variant="outlined" disabled={busy} onClick={close}>
                  닫고 발송 상태 확인하기
                </Button>
              )}
              <Button
                variant="text"
                disabled={busy || (!dirty && view.revision > 0)}
                onClick={() => void save(false)}
              >
                {operation === 'save' ? '저장 중…' : '임시 저장'}
              </Button>
              <Button
                variant={preview ? 'outlined' : 'filled'}
                disabled={busy}
                onClick={() => void save(true)}
              >
                {operation === 'preview'
                  ? '미리보기 만드는 중…'
                  : preview
                    ? '미리보기 다시 만들기'
                    : '저장하고 미리보기'}
              </Button>
              <Button
                variant={preview ? 'filled' : 'outlined'}
                disabled={busy || !preview || dirty || !sendReady}
                onClick={() => setConfirmSend(true)}
              >
                {operation === 'send' ? '서명 요청 중…' : '양측에 서명 요청하기'}
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
