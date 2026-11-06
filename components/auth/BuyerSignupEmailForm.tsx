"use client";
import { trackFunnel } from "@/lib/analytics/funnel";
import { useFunnelView } from "@/lib/analytics/use-funnel";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/primitives/Button";
import { AgreementCheckboxes } from "@/components/auth/AgreementCheckboxes";
import { PasswordField } from "@/components/auth/PasswordField";
import { SignupEmailGuide } from "@/components/auth/SignupEmailGuide";
import { SignupStepper } from "@/components/auth/SignupStepper";
import { useSignupDraftStore } from "@/lib/stores/signup-draft";
import { readSignupDraft, writeSignupDraft } from "@/lib/auth/signup-storage";
import { getSignupConsentDocuments } from "@/lib/auth/signup-documents";
import { validateSignupConsent } from "@/lib/auth/signup-consent";
import {
  getSignupAccountErrors,
  hasSignupAccountErrors,
  SIGNUP_EMAIL_PATTERN,
} from "@/lib/auth/signup-account-errors";
import { useFocusFirstInvalid } from "@/lib/a11y/use-focus-first-invalid";
import { checkEmailAvailableAction } from "@/lib/server/actions/auth";
import { safeInternalNext } from "@/lib/auth/safe-next";
import { RESUME_PATH } from "@/lib/guest-rfp/draft";
import {
  underlineInputBase,
  underlineInputBorder,
  underlineInputErrorBorder,
} from "@/components/forms/inputs";
import { cn } from "@/lib/utils";

type AgreementState = { terms: boolean; privacy: boolean; marketing: boolean };

export function BuyerSignupEmailForm({
  onContinue,
  embedded = false,
}: { onContinue?: () => void; embedded?: boolean } = {}) {
  useFunnelView("signup", "email");
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = embedded
    ? RESUME_PATH
    : safeInternalNext(searchParams.get("next"));
  const loginHref = embedded
    ? "/login?next=%2Fquote-start"
    : nextParam
      ? `/login?next=${encodeURIComponent(nextParam)}`
      : "/login";
  const trackLoginChoice = () => {
    if (nextParam === RESUME_PATH) {
      trackFunnel("funnel_cta_click", {
        funnel_id: "acquisition",
        step_id: "choose_login",
        entry_path: "guest",
      });
    }
  };
  const reviewConsent = searchParams.get("consent") === "review";
  const { setEmail, setWorkspaceType } = useSignupDraftStore();

  const documents = getSignupConsentDocuments();
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreements, setAgreements] = useState<AgreementState>({
    terms: false,
    privacy: false,
    marketing: false,
  });
  // 서버와 첫 렌더를 맞춘 뒤, 현재 문서 판본에 명시적으로 동의한 초안만 복원한다.
  useEffect(() => {
    const d = readSignupDraft();
    if (d.workspaceType !== "buyer") return;
    /* eslint-disable react-hooks/set-state-in-effect -- 마운트 뒤 sessionStorage에서 1회 복원 */
    if (d.email) setEmailInput(d.email);
    const restored = validateSignupConsent(d.consent);
    if (restored.ok && !reviewConsent) {
      const { terms, privacy, marketing } = restored.consent;
      setAgreements({ terms, privacy, marketing });
    } else {
      setAgreements({ terms: false, privacy: false, marketing: false });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [reviewConsent]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const [masterEmail, setMasterEmail] = useState(false);
  const [emailCheckError, setEmailCheckError] = useState("");

  const { containerRef: formRef, requestFocus } =
    useFocusFirstInvalid<HTMLFormElement>();

  const errors = getSignupAccountErrors({
    email: emailInput,
    password,
    passwordConfirm,
    agreements,
  });
  // 입력 도중에는 확인 칸 불일치만 바로 알린다. 나머지 사유는 [다음]을 눌러 막혔을
  // 때 한꺼번에 보여주고, 고치는 즉시 사라진다(값에서 다시 계산한다).
  const shown = attemptedSubmit
    ? errors
    : {
        email: null,
        password: null,
        passwordConfirm: passwordConfirm ? errors.passwordConfirm : null,
        agreements: null,
      };
  const emailInvalid = !!shown.email || emailTaken || masterEmail;

  const canSubmit =
    documents !== null &&
    !emailTaken &&
    !masterEmail &&
    !hasSignupAccountErrors(errors);

  const handleEmailBlur = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !SIGNUP_EMAIL_PATTERN.test(email)) return;
    setEmailCheckError("");
    try {
      const check = await checkEmailAvailableAction({ email });
      if (!check.ok && check.error === "EMAIL_TAKEN") {
        setEmailTaken(true);
      } else if (!check.ok && check.error === "MASTER_EMAIL") {
        setMasterEmail(true);
      }
    } catch {
      setEmailCheckError("이메일을 확인하지 못했어요. 잠시 후 다시 시도해요.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !documents) return;
    setAttemptedSubmit(true);
    if (!canSubmit) {
      requestFocus();
      return;
    }
    setEmailTaken(false);
    setMasterEmail(false);
    setEmailCheckError("");

    setSubmitting(true);
    const email = emailInput.trim().toLowerCase();

    try {
      const check = await checkEmailAvailableAction({ email });
      if (!check.ok && check.error === "EMAIL_TAKEN") {
        setEmailTaken(true);
        return;
      }
      if (!check.ok && check.error === "MASTER_EMAIL") {
        // 운영자/마스터 이메일은 가입 불가(Google OAuth 전용).
        setMasterEmail(true);
        return;
      }

      setEmail(email);
      setWorkspaceType("buyer");

      const draft = readSignupDraft();
      writeSignupDraft({
        ...draft,
        email,
        password,
        consent: {
          ...agreements,
          termsVersion: documents.terms.version,
          privacyVersion: documents.privacy.version,
          marketingVersion: documents.marketing.version,
        },
        workspaceType: "buyer",
        // step-1이 next의 단일 출처: 현재 진입 URL 기준으로 덮어쓴다(이전 세션 잔여값 제거).
        next: nextParam ?? undefined,
      });

      trackFunnel("funnel_step_complete", {
        funnel_id: "signup",
        step_id: "email",
        journey_answer: email,
      });
      if (onContinue) onContinue();
      else router.push("/signup/buyer/workspace");
    } catch {
      setEmailCheckError("이메일을 확인하지 못했어요. 잠시 후 다시 시도해요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={1} total={3} />

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          구매사 계정을 만듭니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          이메일과 비밀번호를 입력해요.
        </p>
      </div>

      {/* noValidate: 브라우저 기본 말풍선 대신 필드 아래 인라인 오류로 통일한다. */}
      <form
        ref={formRef}
        className="space-y-6"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="md-label-small text-[var(--md-sys-color-on-surface-variant)]"
          >
            이메일
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setEmailTaken(false);
              setMasterEmail(false);
              setEmailCheckError("");
            }}
            onBlur={handleEmailBlur}
            autoComplete="email"
            placeholder="your@company.com"
            aria-invalid={emailInvalid ? "true" : undefined}
            aria-describedby={shown.email ? "signup-email-error" : undefined}
            className={cn(
              underlineInputBase,
              emailInvalid ? underlineInputErrorBorder : underlineInputBorder,
            )}
          />
          {shown.email && !emailTaken && !masterEmail && (
            <p
              id="signup-email-error"
              className="text-xs text-[var(--md-sys-color-error)] mt-1"
            >
              {shown.email}
            </p>
          )}
          {emailTaken && (
            <p
              role="alert"
              className="text-xs text-[var(--md-sys-color-error)] mt-1"
            >
              이미 가입된 이메일입니다.{" "}
              <Link
                href={`${loginHref}${nextParam ? "&" : "?"}email=${encodeURIComponent(emailInput.trim().toLowerCase())}`}
                onClick={trackLoginChoice}
                className="underline"
              >
                로그인
              </Link>
              하시겠어요?
            </p>
          )}
          {masterEmail && (
            <p
              role="alert"
              className="text-xs text-[var(--md-sys-color-error)] mt-1"
            >
              이 이메일로는 가입할 수 없어요. 다른 이메일을 사용해 주세요.
            </p>
          )}
          {emailCheckError && (
            <p
              role="alert"
              className="text-[13px] text-[var(--md-sys-color-error)] mt-1"
            >
              {emailCheckError}
            </p>
          )}
          <SignupEmailGuide
            email={emailInput}
            hidden={
              emailTaken || masterEmail || !!emailCheckError || !!shown.email
            }
          />
        </div>

        <PasswordField
          label="비밀번호"
          value={password}
          onChange={setPassword}
          showStrength
          showRuleErrors
          error={shown.password ?? undefined}
        />
        <PasswordField
          label="비밀번호 확인"
          name="passwordConfirm"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          autoComplete="new-password"
          error={shown.passwordConfirm ?? undefined}
        />

        {reviewConsent && documents && (
          <p
            role="alert"
            className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]"
          >
            가입 동의 내용을 다시 확인해 주세요. 아래 문서를 확인하고 동의하면
            계속할 수 있어요.
          </p>
        )}
        <AgreementCheckboxes
          value={agreements}
          onChange={setAgreements}
          documents={documents}
          disabled={submitting}
          error={shown.agreements}
        />

        <Button
          type="submit"
          fullWidth
          size="lg"
          disabled={submitting || !documents}
          dimmed={!canSubmit}
        >
          {submitting ? "처리 중…" : "다음"}
        </Button>
      </form>

      <div className="text-center space-y-2">
        <Link
          href={loginHref}
          onClick={trackLoginChoice}
          className="block md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          이미 계정이 있어요? 로그인 →
        </Link>
      </div>
    </div>
  );
}
