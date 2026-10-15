"use client";
import Link from "next/link";
import styles from "./guest-quote.module.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createStore, type StoreApi } from 'zustand';
import type { RfpDraftStore } from '@/lib/stores/rfp-draft';
import { draftData } from '@/lib/guest-rfp/draft';
import { CONTRACT_TYPE_LABELS } from '@/lib/types/rfp';
import { industryDisplay } from '@/lib/rfp/industry-display';
import { Button } from "@/components/primitives/Button";
import { RfpDraftProvider } from "@/lib/stores/rfp-draft-context";
import type { PublicIndustry } from "@/lib/types/pg-recommendation";
import {
  RESUME_KEY,
  RESUME_PATH,
} from "@/lib/guest-rfp/draft";
import { guestFiles } from "@/lib/guest-rfp/files";
import { sendGuestEvent } from "@/lib/guest-rfp/events";
import { RfpQuestionFlow } from "./RfpQuestionFlow";
import { contentQuestions } from "./content-questions";
import { useGuestDraft } from "./useGuestDraft";
import { GuestSavingsCalculator, type SavingsMemory } from "./GuestSavingsCalculator";
import { GuestAttachments } from "./GuestAttachments";
export function GuestQuoteStart({
  industryGroups,
}: {
  industryGroups: PublicIndustry[];
}) {
  const router = useRouter();
  const { session, error, setError } = useGuestDraft(true);
  const [busy, setBusy] = useState(false);
  const completing = useRef(false);
  const [savingsValues, setSavingsValues] = useState({ volume: '1000000000', reduction: '1' });
  const savingsMemory = useRef<SavingsMemory>({ introduced: false, committed: 10000000, lastBurst: -Infinity });
  const [done, setDone] = useState(false);
  const [editStore, setEditStore] = useState<StoreApi<RfpDraftStore> | null>(null);
  const [editError, setEditError] = useState('');
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (done && !editStore) summaryHeading.current?.focus(); }, [done, editStore]);
  const [attachmentError, setAttachmentError] = useState('');
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [fileStatus, setFileStatus] = useState<'empty' | 'checking' | 'saved' | 'error'>('empty');
  useEffect(() => {
    if (!session || busy || done) return;
    let active = true;
    const verify = async () => {
      if (!session.draft.files.length) {
        if (active) setFileStatus('empty');
        return;
      }
      setFileStatus('checking');
      try {
        const files = await Promise.all(session.draft.files.map(file => guestFiles.get(file.id)));
        if (!active) return;
        const saved = files.every(Boolean) && session.pendingFiles.size === 0;
        setMissingFiles(session.draft.files.filter((_, index) => !files[index]).map(file => file.id));
        setFileStatus(saved ? 'saved' : 'error');
        if (!saved) setAttachmentError('첨부 파일의 저장을 확인해요. 첨부 질문에서 다시 저장하거나 파일을 제거하고 다시 선택해요.');
      } catch {
        if (active) {
          setFileStatus('error');
          setMissingFiles(session.draft.files.map(file => file.id));
          setAttachmentError('첨부 파일을 읽지 못했어요. 첨부 질문에서 다시 확인해요.');
        }
      }
    };
    void verify();
    return () => { active = false; };
  }, [session, busy, done]);
  useEffect(() => {
    if (!session || session.draft.owner) return;
    let started = false;
    return session.store.subscribe((state, previous) => {
      if (started || session.draft.completed || state.websiteUrl === previous.websiteUrl || !state.websiteUrl.trim()) return;
      started = true;
      void sendGuestEvent(session.draft, "started", industryGroups);
    });
  }, [session, industryGroups]);
  const questionChange = useCallback(() => {}, []);
  const edit = (question: string) => {
    if (!session) return;
    const data = draftData(session.store.getState());
    setEditError('');
    setEditStore(createStore<RfpDraftStore>((set) => ({
      ...data, contentQuestion: question,
      setField: (key, value) => set({ [key]: value }),
      reset: () => set(data),
    })));
  };
  const saveEdit = () => {
    if (!session || !editStore || busy) return;
    const missing = contentQuestions(editStore.getState(), industryGroups).find(q => !q.valid);
    if (missing) { editStore.getState().setField('contentQuestion', missing.id); return; }
    try {
      session.commitEdit(draftData(editStore.getState()));
      setEditStore(null);
      setEditError('');
    } catch {
      setEditError('수정 내용을 저장하지 못했어요. 입력한 내용은 유지했으니 다시 저장해요.');
    }
  };
  const complete = async () => {
    if (!session || busy || completing.current) return;
    completing.current = true;
    setBusy(true);
    try {
      const missing = contentQuestions(
        session.store.getState(),
        industryGroups,
      ).find((q) => !q.valid);
      if (missing) {
        session.store.getState().setField("contentQuestion", missing.id);
        return;
      }
      session.save();
      for (const file of session.draft.files)
        if (!(await guestFiles.get(file.id))) {
          setAttachmentError(`${file.name} 저장을 완료해요. 다시 저장하거나 파일을 제거할 수 있어요.`);
          setFileStatus('error');
          return;
        }
      setAttachmentError('');
      setFileStatus(session.draft.files.length ? 'saved' : 'empty');
      session.complete();
      localStorage.setItem(RESUME_KEY, "1");
      sendGuestEvent(session.draft, "completed", industryGroups);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "초안을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해요.",
      );
    } finally {
      completing.current = false;
      setBusy(false);
    }
  };
  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>
        <div className={styles.introduction}>
          <h1>우리 사업에 맞는 PG 견적을 받아요</h1>
          <p>사업 정보를 입력하면 업종에 맞는 PG사를 추천해요.</p>
        </div>
      </div>
      <section className={`${styles.workspace} space-y-6`} aria-label="견적 작성">
        {!session ? (
          <p>초안을 불러오는 중이에요…</p>
        ) : session.draft.owner ? (
          <div>
            <p>
              로그인한 계정에 연결된 초안이에요. 해당 계정에서 이어 쓸 수 있어요.
            </p>
            <Link
              className="inline-flex min-h-11 lg:min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]"
              href={`/login?next=${encodeURIComponent(RESUME_PATH)}`}
            >
              로그인하고 이어 쓸게요
            </Link>
          </div>
        ) : editStore ? (
          <RfpDraftProvider value={editStore}>
            <RfpQuestionFlow presentation="public" mode="edit" industryGroups={industryGroups}
              onBack={() => { setEditStore(null); setEditError(''); }} onNext={saveEdit} onQuestionChange={questionChange} />
            {editError && <div role="alert" className="mt-4 text-[var(--md-sys-color-error)]">{editError}
              <Button className="min-h-11" variant="text" onClick={saveEdit}>다시 저장해요</Button>
            </div>}
          </RfpDraftProvider>
        ) : done ? (
          <div className="space-y-4">
            <GuestSavingsCalculator values={savingsValues} onChange={setSavingsValues} memoryRef={savingsMemory} headingRef={summaryHeading} />
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]"
                href={`/login?next=${encodeURIComponent(RESUME_PATH)}`}
              >
                로그인하고 이어 쓸게요
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]"
                href={`/signup/buyer?next=${encodeURIComponent(RESUME_PATH)}`}
              >
                가입하고 이어 쓸게요
              </Link>
              <Button className="min-h-11" variant="text" onClick={() => setDone(false)}>
                내용을 수정해요
              </Button>
            </div>
            <h3
              className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]"
            >
              작성 내용을 보관했어요
            </h3>
            <p>로그인한 뒤 사업자 정보를 확인하고 PG사에 요청해요.</p>
            <dl className={styles.summary}>
              {[
                { id: 'website', label: '홈페이지', value: session.store.getState().websiteUrl },
                { id: 'industry', label: '업종', value: session.store.getState().industryMode === 'custom'
                  ? session.store.getState().customIndustryName
                  : (() => { const group = industryGroups.find(g => g.id === session.store.getState().industryGroupId); return group ? industryDisplay(group).displayName : '업종을 다시 선택해요'; })() },
                { id: 'contract', label: '계약 유형', value: CONTRACT_TYPE_LABELS[session.store.getState().contractType ?? 'new'] },
              ].map(item => <div key={item.id} className={styles.summaryRow}>
                <dt>{item.label}</dt><dd>{item.value}</dd>
                <dd className={styles.summaryAction}>
                <Button className="min-h-11" variant="text" aria-label={`${item.label} 수정`} onClick={() => edit(item.id)}>수정</Button>
                </dd>
              </div>)}
            </dl>
          </div>
        ) : (
          <RfpDraftProvider value={session.store}>
            <fieldset disabled={busy} className="min-w-0">
              <RfpQuestionFlow
                presentation="public"
                saving={busy}
                industryGroups={industryGroups}
                onBack={() => {
                  router.push("/");
                }}
                onNext={() => void complete()}
                onQuestionChange={questionChange}
                onAnswered={(id) => {
                  if (id === "website") {
                    try {
                      session.save();
                    } catch {
                      setError("초안을 저장하지 못했어요. 다시 저장해요.");
                    }
                  }
                }}
                attachments={
                  <GuestAttachments
                    session={session}
                    missingFileIds={missingFiles}
                    busy={busy}
                    setBusy={setBusy}
                    onError={setAttachmentError}
                  />
                }
              />
            </fieldset>
          </RfpDraftProvider>
        )}
        {(error || attachmentError || fileStatus === 'error') && <div className="space-y-3 border-t border-[var(--md-sys-color-outline-variant)] pt-4 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {error && (
            <div role="alert" className="text-[var(--md-sys-color-error)]">
              {error}
              <Button
                variant="text"
                className="min-h-11 lg:min-h-8"
                disabled={busy}
                onClick={() => {
                  try {
                    session?.save();
                  } catch {
                    setError("저장 공간을 확인하고 다시 시도해요.");
                  }
                }}
              >
                다시 저장해요
              </Button>
            </div>
          )}
          {attachmentError && <p role="alert" className="text-[var(--md-sys-color-error)]">{attachmentError}</p>}
          {fileStatus === 'error' && <p role="status">첨부 원본을 아직 보관하지 못했어요</p>}
          {fileStatus === 'checking' && <p role="status">첨부 원본의 저장 상태를 확인하고 있어요…</p>}
          {fileStatus === 'error' && session && <Button className="min-h-11 lg:min-h-8" variant="text" disabled={busy} onClick={() => {
            setDone(false);
            session.store.getState().setField('contentQuestion', 'attachments');
          }}>첨부 확인하기</Button>}
        </div>}
      </section>
    </div>
  );
}
