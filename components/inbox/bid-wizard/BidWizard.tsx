'use client';

import { DraftReview } from './DraftReview';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HTTPError } from 'ky';
import { uploadAttachment } from '@/lib/attachments/upload-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { toast } from '@/lib/toast';
import {
  useBidDraft,
  readLegacyBidDraft,
  EMPTY_BID_DRAFT,
  isPristineDraft,
  type BidDraft,
} from '../useBidDraft';
import {
  usePersonalBidDraft,
  personalDraftKey,
  readPersonalRecovery,
} from '../usePersonalBidDraft';
import { loadBidDraftAction, submitBidDraftAction } from '@/lib/server/actions/bid-drafts';
import type { SavedBidDraft, BidDraftScope } from '@/lib/quote/draft-schema';
import { draftQuoteTerms } from '@/lib/quote/draft-schema';
import { bidConditions, QuoteTermsSchema, validateSubmissionTerms } from '@/lib/quote/terms';
import { guestFiles } from '@/lib/guest-rfp/files';
import { submitBidAction } from '@/lib/server/actions/bid';
import {
  PAYMENT_METHOD_CATEGORIES,
  isFlatFeeMethod,
  isTieredMethod,
  MERCHANT_TIERS,
  type PaymentMethod,
} from '@/lib/types/bid';
import { buildPaymentFees, pctToDecimal } from '@/lib/quote/template-fees';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
import type { SigningTemplateOption } from '@/lib/server/signing-template-option';

import { BID_WIZARD_STEPS, SERVER_ERROR_STEP } from './bid-wizard-steps';
import { bidSubmitErrorMessage } from './bid-wizard-errors';
import {
  getBidWizardValidity,
  getFirstIncompleteBidStep,
  deriveAnyFeeFilled,
  isCycleValid,
  isSettleLimitValid,
} from './bid-wizard-validation';
import { BidContextStrip } from './BidContextStrip';
import type { WorkspaceDisplay } from '@/lib/types/workspace';
import { type ProposalState } from './BidStepProposal';
import { BidWizardProvider, type BidWizardContextValue } from './bid-wizard-context';
import { BidStepSettlementContainer } from './BidStepSettlementContainer';
import { BidStepFeesContainer } from './BidStepFeesContainer';
import { BidStepProposalContainer } from './BidStepProposalContainer';
import { BidStepReviewContainer } from './BidStepReviewContainer';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap((c) => c.methods);
const TOTAL_STEPS = BID_WIZARD_STEPS.length;

type Props = {
  rfp: PgRfpDetailData['rfp'];
  buyer: WorkspaceDisplay;
  /** PG 워크스페이스에 등록된 재사용 계약서 템플릿 — 검토·발송 단계에서 선택할 수 있다. */
  signingTemplates?: SigningTemplateOption[];
  /** 재요청 시 직전 라운드 견적을 prefill 기준값으로 시드. */
  initialBid?: PgRfpDetailData['myBid'];
  pendingRequoteId?: string;
  pendingRequoteDeadline?: string;
  workspaceId?: string;
  userId?: string;
  submissionEnabled?: boolean;
  serverDraft?: SavedBidDraft | null;
  draftReadOnly?: boolean;
  attachmentInvalid?: boolean;
  /**
   * pg 튜토리얼 전용(opt-in) — 폼 baseline을 통째로 시드해 타이핑 없이 클릭만으로
   * 제출까지 진행하게 한다. initialBid보다 우선(둘 다 오면 이쪽).
   */
  initialDraft?: BidDraft;
  /**
   * 랜딩 데모 전용(opt-in). 주어지면 제출 시 서버 액션 대신 이 콜백을 호출한다
   * — 비로그인 임베디드 데모에서 실제 submitBidAction 을 치지 않도록(가입 유도). 프로덕션 미전달 시 no-op.
   */
  onGuestSubmit?: () => void;
  /**
   * 가상 샘플 온보딩 전용(opt-in). 주어지면 제출 시 서버 액션(submitBidAction) 대신
   * 이 콜백만 호출한다 — 서버 호출도 지연도 없다. onGuestSubmit 과 상호배타.
   */
  onSampleSubmit?: () => void;
};

/**
 * Bid 도메인 객체 → BidDraft 폼 상태로 변환 (재요청 prefill용).
 *
 */
export function bidToDraft(b: NonNullable<PgRfpDetailData['myBid']>): BidDraft {
  const m = /^([A-Z]+)\+?(\d+)?$/.exec(b.settleCycle);
  const fees: Record<string, string> = {};
  // 기존 JSON 요율의 유효 숫자를 유지하면서 배정밀도 곱셈 잔차를 제거한다.
  const fmtPct = (rate: number): string => String(Number((rate * 100).toPrecision(15)));
  for (const [k, v] of Object.entries(b.paymentFees ?? {})) {
    if (typeof v === 'number') {
      // 정액(건당) 수단은 '원' 정수 그대로, 정률 수단은 decimal → percent 문자열.
      if (isTieredMethod(k as PaymentMethod)) {
        for (const tier of MERCHANT_TIERS) fees[`${k}:${tier}`] = fmtPct(v);
      } else {
        fees[k] = isFlatFeeMethod(k as PaymentMethod) ? String(v) : fmtPct(v);
      }
    } else {
      for (const [tier, rate] of Object.entries(v)) {
        if (rate !== undefined) fees[`${k}:${tier}`] = fmtPct(rate);
      }
    }
  }
  for (const [k, v] of Object.entries(b.customFees ?? {})) {
    fees[k] = fmtPct(v);
  }
  const rawNum = parseInt(m?.[2] ?? '1');
  return {
    __v: b.quoteTerms?._v === 2 ? 4 : 3,
    cycleUnit: (m?.[1] ?? 'D') as BidDraft['cycleUnit'],
    cycleNum: String(Math.min(rawNum, 99)),
    settleLimit: String(b.settleLimit ?? 0),
    guaranteeInsurance: b.guaranteeInsurance == null ? '' : String(b.guaranteeInsurance),
    signupFee: b.signupFee == null ? '' : String(b.signupFee),
    conditionStates: Object.fromEntries(
      Object.entries({
        signupFee: bidConditions(b).signupFee,
        guaranteeInsurance: bidConditions(b).guaranteeInsurance,
        ...bidConditions(b).fees,
      }).map(([k, v]) => [k, v.state]),
    ),
    fees,
    memo: b.memo ?? '',
    proposalChoice: b.proposalPdfs.length > 0 ? 'keep' : 'remove',
  };
}

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

// localStorage drafts are only read after hydration, including ?tab=write reloads.
export function BidWizard(props: Props) {
  const ready = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  if (!ready) return <Skeleton aria-label="견적 초안 불러오는 중" className="h-80 rounded-[6px]" />;
  return props.userId && props.workspaceId && !props.onGuestSubmit && !props.onSampleSubmit ? (
    <PersonalBidWizardLoader {...props} />
  ) : (
    <BidWizardForm {...props} />
  );
}

function PersonalBidWizardLoader(props: Props) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadBidDraftAction>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [offlineRecovery, setOfflineRecovery] = useState(false);
  const scope = useMemo<BidDraftScope>(
    () => ({
      userId: props.userId!,
      workspaceId: props.workspaceId!,
      rfpId: props.rfp.id,
      roundKey: props.pendingRequoteId ?? 'initial',
    }),
    [props.userId, props.workspaceId, props.rfp.id, props.pendingRequoteId],
  );
  const load = useCallback(() => {
    setFailed(false);
    void loadBidDraftAction(scope)
      .then(setLoaded)
      .catch(() => setFailed(true));
  }, [scope]);
  useEffect(() => {
    let active = true;
    void loadBidDraftAction(scope)
      .then((result) => {
        if (active) setLoaded(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [scope]);
  if (offlineRecovery) return <BidWizardForm {...props} />;
  if (failed || (loaded && !loaded.ok))
    return (
      <div role="alert" className="p-4">
        초안을 불러오지 못했어요. 계정과 연결 상태를 확인해요.{' '}
        <button type="button" onClick={load} className="underline">
          다시 불러오기
        </button>
        {failed && readPersonalRecovery(personalDraftKey(scope)) && (
          <button type="button" className="ml-3 underline" onClick={() => setOfflineRecovery(true)}>
            이 브라우저 복구본으로 계속 작성
          </button>
        )}
      </div>
    );
  if (!loaded || !loaded.ok)
    return <Skeleton aria-label="계정 초안 불러오는 중" className="h-80" />;
  if (loaded.draft?.submittedBidId)
    return (
      <div className="p-4">
        구매사에게 견적을 보냈어요.{' '}
        <button type="button" onClick={() => location.reload()} className="underline">
          보낸 견적 확인하기
        </button>
      </div>
    );
  return (
    <BidWizardForm
      {...props}
      serverDraft={loaded.draft}
      draftReadOnly={loaded.readOnly}
      attachmentInvalid={loaded.attachmentInvalid}
      submissionEnabled={loaded.quoteV2WriteEnabled}
    />
  );
}

function BidWizardForm({
  submissionEnabled = true,
  rfp,
  buyer,
  signingTemplates,
  initialBid,
  pendingRequoteId,
  pendingRequoteDeadline,
  workspaceId,
  userId,
  serverDraft,
  draftReadOnly,
  attachmentInvalid,
  initialDraft,
  onGuestSubmit,
  onSampleSubmit,
}: Props) {
  const router = useRouter();
  const rfpId = rfp.id;
  const requiredPaymentMethods = rfp.requiredPaymentMethods;
  const customPaymentMethods = rfp.customPaymentMethods;

  const [pending, startTransition] = useTransition();
  const contentRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [validationAttempt, setValidationAttempt] = useState<{
    step: number;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (validationAttempt) summaryRef.current?.focus();
  }, [validationAttempt]);
  const focusInput = (field: string) =>
    (
      contentRef.current?.querySelector<HTMLElement>(
        `[data-bid-input="${field}"] input:not([type=hidden]):not([type=file])`,
      ) ??
      contentRef.current?.querySelector<HTMLElement>(
        `button[data-bid-input="${field}"], [data-bid-input="${field}"] select`,
      )
    )?.focus();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // 제출 시 미충족이 확인된 단계 — 가로 진행 표시에 확인 필요를 표시한다.
  const [failedSteps, setFailedSteps] = useState<Set<number>>(new Set());
  const markFailed = useCallback(
    (n: number) =>
      setFailedSteps((prev) => {
        const next = new Set(prev);
        next.add(n);
        return next;
      }),
    [],
  );

  // baseline = 위저드가 처음 열렸을 때의 폼(일반=빈 폼, 재요청=직전 라운드 prefill).
  const baseline = useMemo<BidDraft>(
    () =>
      initialDraft ??
      (initialBid
        ? {
            ...bidToDraft(initialBid),
            baseBidId: initialBid.id,
            expectedRequoteDeadline: pendingRequoteDeadline,
          }
        : EMPTY_BID_DRAFT),
    [initialDraft, initialBid, pendingRequoteDeadline],
  );
  // 초안 자동저장/복원
  const scope = useMemo<BidDraftScope | undefined>(
    () =>
      userId && workspaceId && !onGuestSubmit && !onSampleSubmit
        ? {
            userId,
            workspaceId,
            rfpId,
            roundKey: pendingRequoteId ?? 'initial',
          }
        : undefined,
    [userId, workspaceId, rfpId, pendingRequoteId, onGuestSubmit, onSampleSubmit],
  );
  const localDraft = useBidDraft(
    rfpId,
    workspaceId ? { workspaceId, revisionId: pendingRequoteId } : undefined,
    !scope,
  );
  const personal = usePersonalBidDraft(scope, serverDraft, draftReadOnly);
  const draft = scope ? personal.draft : localDraft.draft;
  const saveDraft = scope ? personal.saveDraft : localDraft.saveDraft;
  const clearDraft = scope ? personal.clearDraft : localDraft.clearDraft;
  const savedAt = localDraft.savedAt;
  const saveError = scope ? personal.error : localDraft.saveError;
  const retrySave = scope ? personal.flush : localDraft.retrySave;
  const [legacy, setLegacy] = useState(() =>
    scope && workspaceId ? readLegacyBidDraft(rfpId, workspaceId, pendingRequoteId) : null,
  );
  const [unknownSubmit, setUnknownSubmit] = useState(false);
  const [recoverableFile, setRecoverableFile] = useState<File | null>(null);
  const fileKey = scope ? `${personalDraftKey(scope)}:pdf` : '';
  useEffect(() => {
    if (fileKey)
      void guestFiles
        .get(fileKey)
        .then((file) => setRecoverableFile(file ?? null))
        .catch(() => {});
  }, [fileKey]);
  const [currentStep, setCurrentStep] = useState(draft?.currentStep ?? 1);
  // 의미 있는 초안이면 묻지 않고 초기값으로 복원.
  const restoredFromDraft = draft !== null && !isPristineDraft(draft, baseline);
  const [draftNotice, setDraftNotice] = useState(
    restoredFromDraft ? '작성하던 초안을 불러왔어요' : '',
  );
  // 복원된 템플릿 선택이 그 사이 삭제됐으면 초기화 시점에 걷어낸다 — 사용자는
  // "그대로 불러왔어요"를 믿고 검토 단계에서 선택을 다시 확인하지 않는다(M23).
  // 상태 정리는 initializer 에서, 안내 토스트만 아래 마운트 effect 에서.
  // '삭제됨' 판정은 **목록을 받았을 때만** 내린다. 피커가 없는 표면(게스트·샘플·
  // kill switch 로 숨김)에서는 `signingTemplates` 가 undefined 라 목록이 없는 것이지
  // 템플릿이 없어진 게 아니다 — 여기서 걷어내면 초안이 실제로 파괴된다:
  // 마운트 effect 가 곧바로 saveDraft(fields) 를 부르고 useBidDraft 는 언마운트에서도
  // 동기 flush 하므로, 위저드를 1초 열었다 닫기만 해도 localStorage 의 선택이 영영 사라진다.
  const restoredTemplateGone =
    restoredFromDraft &&
    !!signingTemplates &&
    !!draft?.signingTemplateId &&
    !signingTemplates.some((t) => t.id === draft.signingTemplateId);
  const [fields, setFields] = useState<BidDraft>(() => {
    const base = restoredFromDraft ? draft! : baseline;
    return restoredTemplateGone ? { ...base, signingTemplateId: undefined } : base;
  });
  const setField = useCallback(
    <K extends keyof BidDraft>(key: K, value: BidDraft[K]) =>
      setFields((f) => ({
        ...f,
        [key]: value,
        ...(key === 'signupFee' || key === 'guaranteeInsurance'
          ? {
              conditionStates: {
                ...f.conditionStates,
                [key]: value === '' ? 'unset' : 'confirmed',
              },
            }
          : {}),
      })),
    [],
  );
  const setFee = useCallback(
    (key: string, value: string) =>
      setFields((f) => ({
        ...f,
        fees: { ...f.fees, [key]: value },
        conditionStates: {
          ...f.conditionStates,
          [key]: value === '' ? 'unset' : 'confirmed',
        },
      })),
    [],
  );
  const setConditionState = useCallback(
    (key: string, state: import('@/lib/quote/terms').ConditionState) =>
      setFields((f) => ({
        ...f,
        conditionStates: { ...f.conditionStates, [key]: state },
      })),
    [],
  );
  const { cycleUnit, cycleNum, settleLimit, guaranteeInsurance, signupFee, fees, memo } = fields;

  useEffect(() => {
    if (scope && !draft && currentStep === 1 && isPristineDraft(fields, baseline)) return;
    saveDraft({ ...fields, currentStep });
  }, [fields, currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // 삭제된 템플릿의 별도 안내. 일반 복원 상태는 작성기 안에서 보여준다.
  useEffect(() => {
    if (restoredTemplateGone) {
      toast('골라 두었던 계약서 템플릿이 삭제되어 선택이 해제됐어요', {
        type: 'info',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 계약서 템플릿 선택(검토·발송 단계) — 초안(BidDraft)의 일부라 저장·복원을 함께 탄다.
  // 별도 useState 로 두면 초안 복원이 이 선택만 무음으로 떨어뜨린다(M23 의 원인).
  const signingTemplateId = fields.signingTemplateId;
  const setSigningTemplateId = useCallback(
    (v: string | undefined) => setField('signingTemplateId', v),
    [setField],
  );

  // 견적서 업로드
  const [proposal, setProposal] = useState<ProposalState>(() => fields.uploadedProposal ?? null);
  const proposalChoice = fields.proposalChoice ?? 'remove';
  const uploadProposal = useCallback(
    async (file: File): Promise<void> => {
      if (file.type !== 'application/pdf') {
        setProposal({
          name: file.name,
          status: 'error',
          error: 'PDF만 업로드 가능합니다.',
        });
        return;
      }
      if (onSampleSubmit || onGuestSubmit) {
        // 튜토리얼 샌드박스 — 실 업로드(presign→R2)를 만들지 않는다.
        toast('체험에서는 실제 파일을 업로드하지 않아요');
        return;
      }
      if (fileKey) {
        try {
          await guestFiles.put(fileKey, file);
          setRecoverableFile(file);
        } catch {
          toast('파일 원본을 보관하지 못했어요. 이 화면을 닫으면 PDF를 다시 선택해야 해요.', {
            type: 'error',
          });
        }
      }
      setProposal({ name: file.name, status: 'uploading' });
      try {
        const body = await uploadAttachment(file, {
          ownerKind: 'bid_proposal',
          ownerId: rfpId,
          ...(scope ? { expectedActor: { userId: scope.userId, workspaceId: scope.workspaceId } } : {}),
        });
        setProposal(body);
        setField('uploadedProposal', body);
        setField('proposalChoice', 'replace');
        setRecoverableFile(null);
        if (fileKey) void guestFiles.remove(fileKey).catch(() => {});
      } catch (err) {
        let error = err instanceof Error ? err.message : '네트워크 오류';
        if (err instanceof HTTPError) {
          const { status } = err.response;
          error =
            status === 413
              ? '파일이 너무 큽니다 (최대 20MB)'
              : status === 415
                ? '지원되지 않는 파일 형식입니다'
                : `업로드 실패 (${status})`;
        }
        setProposal({ name: file.name, status: 'error', error });
      }
    },
    [rfpId, onSampleSubmit, onGuestSubmit, setField, fileKey, scope],
  );
  const clearProposal = useCallback(() => {
    setProposal(null);
    setField('uploadedProposal', undefined);
    setRecoverableFile(null);
    if (fileKey) void guestFiles.remove(fileKey).catch(() => {});
  }, [setField, fileKey]);
  // 처음부터 다시: 초안 삭제 + baseline 으로 폼 리셋 + 견적서 선택 해제 + 1단계로.
  const handleReset = async () => {
    const cleared = scope ? await personal.clearDraft() : (localDraft.clearDraft(), true);
    if (cleared === false) return;
    setDraftNotice('');
    setRecoverableFile(null);
    if (fileKey) void guestFiles.remove(fileKey).catch(() => {});
    setFields(baseline);
    setProposal(null);
    setCurrentStep(1);
    setResetConfirmOpen(false);
    setValidationAttempt(null);
  };
  const proposalReady = proposal && 'id' in proposal;
  const proposalUploading = proposal && 'status' in proposal && proposal.status === 'uploading';

  // 파생값
  const feeInputMethods =
    requiredPaymentMethods.length > 0 ? requiredPaymentMethods : ALL_PAYMENT_METHODS;
  const settleCycle = `${cycleUnit}+${cycleNum || '1'}`;
  const anyFeeFilled = deriveAnyFeeFilled(
    Object.fromEntries(
      Object.entries(fees).filter(
        ([key]) => !fields.conditionStates?.[key] || fields.conditionStates[key] === 'confirmed',
      ),
    ),
    feeInputMethods,
    customPaymentMethods,
  );

  const costsComplete = ['signupFee', 'guaranteeInsurance'].every((key) => {
    const value = key === 'signupFee' ? fields.signupFee : fields.guaranteeInsurance;
    const state = fields.conditionStates?.[key] ?? (value ? 'confirmed' : 'unset');
    return (
      state === 'negotiable' ||
      state === 'not_applicable' ||
      (state === 'confirmed' &&
        value.trim() !== '' &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0)
    );
  });

  // 단계 이동 — 자유 점프(구매사 위저드 미러)
  const completed = getBidWizardValidity({
    cycleNum,
    settleLimit,
    anyFeeFilled,
    costsComplete,
  }).map((s) => s.complete);
  const failedAt = BID_WIZARD_STEPS.map((s) => failedSteps.has(s.num));
  const advance = useCallback(() => {
    setValidationAttempt(null);
    setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }, []);
  const back = useCallback(() => {
    setValidationAttempt(null);
    setCurrentStep((s) => Math.max(1, s - 1));
  }, []);
  const goToStep = useCallback((step: number) => {
    setValidationAttempt(null);
    setCurrentStep(Math.min(TOTAL_STEPS, Math.max(1, step)));
  }, []);

  const handleSubmit = useCallback(() => {
    setSubmitError(null);
    // 미충족 단계로 이동하고 해당 입력의 오류를 표시한다. 하단 행동을 토스트로 덮지 않는다.
    // 샘플(튜토리얼) 모드는 가드를 건너뛴다 — 코치마크 투어가 제출 클릭에서 종료되므로
    // 여기서 막히면 안내 없이 좌초된다(버이어 위저드의 onSampleSubmit 선행 라우팅과 대칭).
    if (!onSampleSubmit) {
      const terms = QuoteTermsSchema.safeParse(
        draftQuoteTerms(
          fields,
          feeInputMethods,
          customPaymentMethods.map((c) => c.id),
        ),
      );
      if (
        !terms.success ||
        !validateSubmissionTerms(
          terms.data,
          feeInputMethods,
          customPaymentMethods.map((c) => c.id),
        )
      ) {
        const step =
          terms.success &&
          terms.data.signupFee.state !== 'unset' &&
          terms.data.guaranteeInsurance.state !== 'unset'
            ? 2
            : 1;
        markFailed(step);
        setCurrentStep(step);
        setValidationAttempt({
          step,
          error: '가입비·보증보험의 조건과 1칸 이상의 확정 수수료를 확인해요.',
        });
        return;
      }
      if (fields.__v === 3 && !fields.legacyZeroReviewed) {
        setCurrentStep(4);
        setValidationAttempt({
          step: 4,
          error: '이전 초안의 0원과 조건을 확인한 뒤 확인란을 선택해요.',
        });
        return;
      }
      if (initialBid?.proposalPdfs.length && proposalChoice === 'replace' && !proposalReady) {
        setCurrentStep(3);
        markFailed(3);
        setValidationAttempt({ step: 3, error: '새 견적서 PDF를 올려주세요' });
        return;
      }
      const incomplete = getFirstIncompleteBidStep({
        cycleNum,
        settleLimit,
        anyFeeFilled,
      });
      if (incomplete) {
        markFailed(incomplete.num);
        setCurrentStep(incomplete.num);
        setValidationAttempt({ step: incomplete.num });
        return;
      }
    }
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  }, [
    onSampleSubmit,
    cycleNum,
    settleLimit,
    anyFeeFilled,
    markFailed,
    initialBid,
    proposalChoice,
    proposalReady,
    fields,
    feeInputMethods,
    customPaymentMethods,
  ]);

  // 4단계가 공유하는 컨텍스트 값 — prop-drilling 제거. 안정 참조(useCallback)
  // 액션 + 폼 상태를 묶어 useMemo 로 캐싱해, 무관한 단계의 리렌더를 줄인다.
  const wizardContext: BidWizardContextValue = useMemo(
    () => ({
      conditionStates: fields.conditionStates,
      setConditionState,
      buyerName: buyer.name,
      rfpCode: rfp.code,
      round: (initialBid?.round ?? 0) + 1,
      goToStep,
      cycleUnit,
      cycleNum,
      settleLimit,
      guaranteeInsurance,
      signupFee,
      fees,
      memo,
      settleCycle,
      feeInputMethods,
      customPaymentMethods,
      proposal,
      previousProposal: initialBid?.proposalPdfs[0],
      proposalChoice,
      pending,
      submitError: validationAttempt ? null : submitError,
      settlementAttempted: failedSteps.has(1),
      feesAttempted: failedSteps.has(2),
      setField,
      setFee,
      uploadProposal: (f) => void uploadProposal(f),
      clearProposal,
      setProposalChoice: (choice) => setField('proposalChoice', choice),
      advance,
      back,
      handleSubmit,
    }),
    [
      fields.conditionStates,
      setConditionState,
      buyer.name,
      rfp.code,
      goToStep,
      cycleUnit,
      cycleNum,
      settleLimit,
      guaranteeInsurance,
      signupFee,
      fees,
      memo,
      settleCycle,
      feeInputMethods,
      customPaymentMethods,
      proposal,
      initialBid,
      proposalChoice,
      pending,
      submitError,
      validationAttempt,
      failedSteps,
      setField,
      setFee,
      uploadProposal,
      clearProposal,
      advance,
      back,
      handleSubmit,
    ],
  );

  const doSubmit = () => {
    setSubmitConfirmOpen(false);
    // 랜딩 데모(게스트): 실제 제출 대신 가입 유도 콜백만 호출하고 종료.
    if (onGuestSubmit) {
      onGuestSubmit();
      return;
    }
    // 가상 샘플 온보딩: 서버 제출 없이 콜백만 호출한다 — fixture 에는 실제
    // rfpId/pgWsId 가 없어 실제 submitBidAction 을 태우면 깨진다.
    if (onSampleSubmit) {
      clearDraft(); // 자동저장된 bid-draft:<fixture-id> 잔존 방지.
      onSampleSubmit();
      return;
    }
    const paymentFees = buildPaymentFees(fees, feeInputMethods);
    const customFees: Record<string, number> = {};
    for (const c of customPaymentMethods) {
      const v = fees[c.id] ?? '';
      if (v !== '') customFees[c.id] = pctToDecimal(v);
    }
    startTransition(async () => {
      try {
        const snapshot = scope ? await personal.flush() : null;
        if (scope && !snapshot) {
          setSubmitError('DRAFT_SAVE_FAILED');
          return;
        }
        const r =
          scope && snapshot
            ? await submitBidDraftAction(scope, snapshot.revision)
            : await submitBidAction({
                rfpId,
                ...(pendingRequoteId && initialBid
                  ? {
                      expectedRequoteId: pendingRequoteId,
                      expectedRequoteDeadline: pendingRequoteDeadline,
                      baseBidId: initialBid.id,
                    }
                  : {}),
                settleCycle,
                settleLimit: parseInt(settleLimit) || 0,
                guaranteeInsurance: parseInt(guaranteeInsurance) || 0,
                signupFee: parseInt(signupFee) || 0,
                paymentFees,
                customFees,
                proposalAttachmentId:
                  proposalChoice === 'replace' && proposalReady ? proposal.id : undefined,
                reuseProposal: !!initialBid?.proposalPdfs.length && proposalChoice === 'keep',
                memo: memo.trim() || undefined,
                ...(signingTemplateId ? { signingTemplateId } : {}),
              });
        if (r.ok) {
          if (scope) personal.markSubmitted();
          else clearDraft();
          // 별도 /submitted 페이지로 이탈하지 않고 같은 창에서 갱신 — submitBidAction 이
          // revalidatePath('/inbox/<code>') 했으므로 refresh 면 로더 재실행 → myBid 존재 →
          // PgDealRoomBody 가 제출 완료 상태를 인플레이스 렌더. (push+refresh 동시 금지:
          // Next 16 useTransition 행, vercel/next.js#86055.)
          router.refresh();
        } else {
          setSubmitError(r.error);
          const step = SERVER_ERROR_STEP[r.error] ?? 4;
          if (step !== 4) markFailed(step);
          setCurrentStep(step);
          setValidationAttempt({ step, error: bidSubmitErrorMessage(r.error) });
        }
      } catch {
        setUnknownSubmit(true);
        setSubmitError('NETWORK_ERROR');
        setCurrentStep(4);
        setValidationAttempt({
          step: 4,
          error: bidSubmitErrorMessage('NETWORK_ERROR'),
        });
      }
    });
  };

  return (
    <>
      <ConfirmDialog
        open={!!personal.leave}
        onOpenChange={(o) => {
          if (!o) personal.cancelLeave();
        }}
        title="저장 상태를 확인하고 이동할까요?"
        description="계정 저장을 완료하지 못한 입력이 있어요. 브라우저 복구본을 보관하지만 저장 공간이 부족하면 복구하지 못할 수 있어요."
        cancelLabel="계속 작성하기"
        confirmLabel="이동하기"
        onConfirm={personal.confirmLeave}
      />
      <ConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={(o) => !o && setSubmitConfirmOpen(false)}
        title="견적을 보낼까요?"
        description="보낸 견적은 직접 고칠 수 없어요. 구매사가 수정 요청을 보내면 새 견적을 제출할 수 있어요."
        confirmLabel="견적 보내기"
        variant="default"
        onConfirm={doSubmit}
        loading={pending}
        // 튜토리얼 pgWriteTour의 마지막 action 앵커 — 실 인박스에선 투어가 없어 inert.
        // (다른 앵커들처럼 무조건 달아 화면 상태와 무관하게 존재를 보장한다.)
        confirmDataCoachmark="tutorial-bid-confirm"
      />
      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={(o) => !o && setResetConfirmOpen(false)}
        title="작성 중인 내용을 지울까요?"
        description="지금까지 입력한 정산조건, 수수료, 견적서가 모두 사라져요."
        confirmLabel="처음부터 다시"
        variant="danger"
        onConfirm={handleReset}
      />

      {unknownSubmit && (
        <div role="alert" className="mb-3 border p-4 text-[14px]">
          전송 결과를 확인하지 못했어요. 결과를 먼저 확인한 뒤 다시 보낼 수 있어요.
          <button
            type="button"
            className="ml-3 underline"
            onClick={async () => {
              if (!scope) {
                router.refresh();
                return;
              }
              try {
                const result = await loadBidDraftAction(scope);
                if (!result.ok) return;
                if (result.draft?.submittedBidId) {
                  personal.markSubmitted();
                  router.refresh();
                } else {
                  setUnknownSubmit(false);
                  setSubmitError(null);
                }
              } catch {
                /* Stay locked until a definitive server response. */
              }
            }}
          >
            제출 결과 확인하기
          </button>
        </div>
      )}
      {(onGuestSubmit || onSampleSubmit) && (
        <p className="mb-3 text-[14px]">
          체험용 화면이에요. 실제 계정 저장과 견적 발송은 하지 않아요.
        </p>
      )}
      {!submissionEnabled && (
        <p role="status" className="mb-3 text-[14px]">
          새 견적 발송을 준비하고 있어요. 작성한 내용은 임시 저장할 수 있어요.
        </p>
      )}
      <BidWizardProvider value={wizardContext}>
        <fieldset
          disabled={pending || !!draftReadOnly || unknownSubmit}
          className="border border-[var(--md-sys-color-outline-variant)] rounded-[6px] overflow-hidden h-full min-h-0 flex-1 flex flex-col max-sm:[&_input:not([type=radio])]:min-h-11 max-sm:[&_select]:min-h-11"
        >
          <BidContextStrip
            buyer={buyer}
            rfp={rfp}
            currentStep={currentStep}
            feeInputMethods={feeInputMethods}
          />

          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <nav
                aria-label="견적 작성 단계"
                className="grid shrink-0 grid-cols-4 gap-1 border-b border-[var(--md-sys-color-outline-variant)] p-2"
              >
                {BID_WIZARD_STEPS.map((step, i) => (
                  <button
                    key={step.num}
                    type="button"
                    aria-label={`${step.num}단계: ${step.label}`}
                    aria-current={currentStep === step.num ? 'step' : undefined}
                    onClick={() => goToStep(step.num)}
                    className={`min-h-11 rounded-[6px] px-1 py-2 text-[13px] transition-colors ${currentStep === step.num ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]'}`}
                  >
                    <span className="md-numeric">{step.num}</span> {step.label}
                    {failedAt[i] && !completed[i] ? ' · 확인 필요' : completed[i] ? ' ✓' : ''}
                  </button>
                ))}
              </nav>
              <div
                ref={contentRef}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
                data-coachmark="tutorial-bid-form"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span role="status" className="text-[var(--md-sys-color-on-surface-variant)]">
                    {scope
                      ? personal.status
                      : saveError
                        ? ''
                        : draftNotice || (savedAt ? '초안을 저장했어요' : '')}
                  </span>
                  {scope && (
                    <button
                      type="button"
                      onClick={() => void personal.flush()}
                      className="min-h-9 underline"
                    >
                      임시 저장
                    </button>
                  )}
                  {!isPristineDraft(fields, baseline) && (
                    <button
                      type="button"
                      onClick={() => setResetConfirmOpen(true)}
                      className="min-h-11 underline underline-offset-2 sm:min-h-8"
                    >
                      초기화
                    </button>
                  )}
                </div>
                {draftReadOnly && (
                  <p role="status" className="mb-4">
                    접수를 마쳐 초안을 읽기 전용으로 복구했어요.
                  </p>
                )}
                {attachmentInvalid && (
                  <p role="alert" className="mb-4 text-[var(--md-sys-color-error)]">
                    저장한 PDF를 확인하지 못했어요. 파일을 다시 선택해요.
                  </p>
                )}
                {recoverableFile && (
                  <div className="mb-4 text-[14px]">
                    업로드하지 못한 {recoverableFile.name}을 이 브라우저에 보관했어요.{' '}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void uploadProposal(recoverableFile)}
                    >
                      다시 업로드
                    </button>
                  </div>
                )}
                {legacy && (
                  <div className="mb-4 rounded-[6px] border p-3 text-[14px]">
                    이전 브라우저 초안이 있어요. 불러온 뒤 0원 조건을 다시 확인해요. 원본은 계정
                    저장 전까지 유지해요.
                    <button
                      type="button"
                      className="ml-3 underline"
                      onClick={() => {
                        setFields({
                          ...legacy,
                          baseBidId: initialBid?.id,
                          expectedRequoteDeadline: pendingRequoteDeadline,
                          legacyZeroReviewed: false,
                        });
                        setCurrentStep(legacy.currentStep ?? 1);
                        setProposal(legacy.uploadedProposal ?? null);
                        setLegacy(null);
                      }}
                    >
                      이전 초안 가져오기
                    </button>
                    <button
                      type="button"
                      className="ml-3 underline"
                      onClick={() => setLegacy(null)}
                    >
                      지금 내용 유지
                    </button>
                  </div>
                )}
                {personal.conflict !== undefined && (
                  <div
                    role="alert"
                    className="mb-4 rounded-[6px] border border-[var(--md-sys-color-warning)] p-3 text-[14px]"
                  >
                    <p>다른 곳에서 초안을 변경했어요. 현재 입력을 유지하고 자동 저장을 멈췄어요.</p>
                    <details>
                      <summary className="min-h-11 py-2 underline">계정에 저장한 내용 확인</summary>
                      {personal.conflict ? (
                        <DraftReview
                          content={personal.conflict.content}
                          rfp={rfp}
                          buyerName={buyer.name}
                          baseBid={initialBid}
                        />
                      ) : (
                        <p>
                          계정에 저장된 초안이 없거나 불러오지 못했어요. 다시 연결한 뒤 선택해요.
                        </p>
                      )}
                    </details>
                    <details>
                      <summary className="min-h-11 py-2 underline">현재 작성한 내용 확인</summary>
                      <DraftReview
                        content={fields}
                        rfp={rfp}
                        buyerName={buyer.name}
                        baseBid={initialBid}
                      />
                    </details>
                    <button
                      type="button"
                      className="min-h-11 underline"
                      onClick={async () => {
                        const content = await personal.resolveConflict(true);
                        if (content) {
                          setFields(content);
                          setCurrentStep(content.currentStep ?? 1);
                          setProposal(content.uploadedProposal ?? null);
                        }
                      }}
                    >
                      계정 내용 불러오기
                    </button>
                    <button
                      type="button"
                      className="ml-4 min-h-11 underline"
                      onClick={() => void personal.resolveConflict(false)}
                    >
                      현재 내용으로 저장
                    </button>
                  </div>
                )}
                {saveError && (
                  <div role="alert" className="mb-4 text-[14px] text-[var(--md-sys-color-error)]">
                    {scope ? bidSubmitErrorMessage(saveError) : saveError}{' '}
                    <button
                      type="button"
                      onClick={() => retrySave()}
                      className="min-h-11 underline sm:min-h-8"
                    >
                      다시 저장
                    </button>
                  </div>
                )}
                {validationAttempt && validationAttempt.step === currentStep && (
                  <div
                    ref={summaryRef}
                    role="alert"
                    aria-label="입력 확인"
                    tabIndex={-1}
                    className="mb-5 rounded-[6px] border border-[var(--md-sys-color-error)] p-3 text-[14px] text-[var(--md-sys-color-error)] focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <p className="font-semibold">
                      {validationAttempt.error ?? '필수 입력을 확인해요'}
                    </p>
                    <div className="flex flex-wrap gap-x-4">
                      {currentStep === 1 && (
                        <>
                          <button
                            type="button"
                            className="min-h-11 underline"
                            onClick={() => focusInput('signupFee')}
                          >
                            가입비 조건 확인하기
                          </button>
                          <button
                            type="button"
                            className="min-h-11 underline"
                            onClick={() => focusInput('guaranteeInsurance')}
                          >
                            보증보험 조건 확인하기
                          </button>
                        </>
                      )}
                      {currentStep === 1 && !isCycleValid(cycleNum) && (
                        <button
                          type="button"
                          className="min-h-11 underline sm:min-h-8"
                          onClick={() => focusInput('cycle')}
                        >
                          정산 주기 입력하기
                        </button>
                      )}
                      {currentStep === 1 && !isSettleLimitValid(settleLimit) && (
                        <button
                          type="button"
                          className="min-h-11 underline sm:min-h-8"
                          onClick={() => focusInput('limit')}
                        >
                          정산한도 입력하기
                        </button>
                      )}
                      {currentStep === 2 && (!anyFeeFilled || validationAttempt.error) && (
                        <button
                          type="button"
                          className="min-h-11 underline sm:min-h-8"
                          onClick={() => focusInput('fees')}
                        >
                          수수료 입력하기
                        </button>
                      )}
                      {currentStep === 3 && (
                        <button
                          type="button"
                          className="min-h-11 underline sm:min-h-8"
                          onClick={() => focusInput('proposal')}
                        >
                          견적서 확인하기
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {currentStep === 1 && <BidStepSettlementContainer />}

                {currentStep === 2 && (
                  <div data-bid-input="fees">
                    <BidStepFeesContainer buyerTier={rfp.bizProfile?.grade} />
                  </div>
                )}

                {currentStep === 3 && <BidStepProposalContainer />}

                {currentStep === 4 && (
                  <div className="space-y-8">
                    {/* undefined = 표면 자체가 해당 없음(게스트·샘플). [] = 템플릿 0개인
                      PG — 블록을 통째로 숨기면 기능의 존재를 알 길이 없어, step1 견적
                      템플릿 피커와 같은 문법으로 안내 + 관리 링크를 보여준다. */}
                    {signingTemplates && (
                      <div className="space-y-1">
                        {/* htmlFor 로 실제 select 와 묶는다 — 라벨 클릭이 포커스를 옮기고,
                          접근성 이름도 aria-label 중복 없이 이 라벨 하나에서 나온다. */}
                        <Label as="label" htmlFor="signing-template" size="md" muted={false}>
                          계약서 템플릿
                        </Label>
                        {signingTemplates.length > 0 ? (
                          <>
                            <Select
                              id="signing-template"
                              options={[
                                { value: '', label: '선택 안 함' },
                                ...signingTemplates.map((t) => ({
                                  value: t.id,
                                  label: t.name,
                                })),
                              ]}
                              value={signingTemplateId ?? ''}
                              onChange={(v) => setSigningTemplateId(v || undefined)}
                            />
                            <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                              선정되면 딜룸에서 이 계약서로 바로 발송할 수 있어요.
                            </p>
                          </>
                        ) : (
                          <div className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-3 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                            저장된 계약서 템플릿이 없어요. 계약서 PDF와 서명칸을 미리 저장해 두면,
                            선정된 뒤 딜룸에서 바로 발송할 수 있어요.{' '}
                            <Link
                              href="/contract-templates"
                              className="text-[var(--md-sys-color-primary)] underline underline-offset-2"
                            >
                              템플릿 관리
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                    {fields.__v === 3 && (
                      <label className="flex gap-2 text-[14px]">
                        <input
                          type="checkbox"
                          checked={!!fields.legacyZeroReviewed}
                          onChange={(e) => setField('legacyZeroReviewed', e.target.checked)}
                        />
                        이전 견적·초안의 0원과 모든 조건을 다시 확인했어요
                      </label>
                    )}
                    <BidStepReviewContainer />
                  </div>
                )}
              </div>

              <div
                data-testid="wizard-nav-footer"
                className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-wrap items-center justify-between gap-2 [&_button]:min-h-11"
              >
                <div>
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      variant="text"
                      onClick={back}
                      icon={<span aria-hidden>←</span>}
                    >
                      {BID_WIZARD_STEPS[currentStep - 2].label}
                    </Button>
                  )}
                </div>
                <div>
                  {currentStep < TOTAL_STEPS ? (
                    <Button
                      type="button"
                      data-coachmark={`tutorial-bid-next-${currentStep}`}
                      onClick={advance}
                      trailingIcon={<span aria-hidden>→</span>}
                    >
                      {BID_WIZARD_STEPS[currentStep].label}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="lg"
                      data-coachmark="tutorial-bid-submit"
                      onClick={handleSubmit}
                      disabled={pending || !!proposalUploading || !submissionEnabled}
                    >
                      {pending ? '보내는 중…' : '견적 보내기'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </fieldset>
      </BidWizardProvider>
    </>
  );
}
