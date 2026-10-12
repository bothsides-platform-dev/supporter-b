"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/primitives/Button";
import { createPortal } from "react-dom";
import type { BuyerDemoMode } from "@/lib/demo/buyer-demo-session";
import type { CoachmarkStep } from "@/components/onboarding/coachmarks/types";

type Guide = CoachmarkStep & { fullStage: number };
const guide = (
  target: string,
  fullStage: number,
  title: string,
  body: string,
): Guide => ({
  target,
  fullStage,
  title,
  body,
  kind: "action",
  placement: "top",
});
// Dialog actions come first. Advancement follows rendered product state, never
// a click counter: validation failures and cancelled dialogs retain their guide.
const steps: Guide[] = [
  guide(
    "demo-requote-pg",
    2,
    "수정 요청할 PG사를 선택해요",
    "수정 요청을 보낼 PG사를 한 곳 이상 선택해요.",
  ),
  guide(
    "demo-sign-example",
    4,
    "예시 이름을 넣어요",
    "버튼을 누르면 이름만 채워져요. 이후 합의서 확인란을 선택해요.",
  ),
  guide(
    "demo-send-example",
    1,
    "예시 메시지를 넣어요",
    "예시를 넣은 뒤 보내기를 누르면 PG의 답변과 견적이 도착해요.",
  ),
  guide(
    "demo-requote-example",
    2,
    "수정 요청 예시를 넣어요",
    "예시 내용과 응답 마감일을 채워요. 내용을 직접 바꾼 뒤 수정 요청을 보낼 수도 있어요.",
  ),
  guide(
    "demo-sign-name",
    4,
    "서명자 이름을 입력해요",
    "체험에 사용할 이름을 입력해요. 실제 본인인증이나 계약 발송은 이루어지지 않아요.",
  ),
  guide(
    "demo-sign-consent",
    4,
    "합의서 확인란을 눌러요",
    "합의서 내용을 확인한 뒤 체크해요. 다음으로 서명 완료하기를 누를 수 있어요.",
  ),
  guide(
    "demo-sign-complete",
    4,
    "이름을 입력하고 서명을 마쳐요",
    "합의서를 확인한 뒤 이름을 입력하고 확인란을 체크해요. 서명 완료하기를 누르면 보관함에 문서가 생겨요.",
  ),
  guide(
    "demo-award-confirm",
    3,
    "조건을 확인하고 선정해요",
    "최종 조건을 읽고 선정할게요를 눌러요. 이어서 계약 서명을 체험할 수 있어요.",
  ),
  guide(
    "demo-requote-send",
    2,
    "수정 내용과 응답 마감일을 정해요",
    "예: ‘정산주기를 D+3으로 조정해주세요’를 입력해요. 기존 마감보다 늦은 날을 고르고 수정 요청 보내기를 눌러요.",
  ),
  guide(
    "demo-question-example",
    0,
    "현재 질문의 예시를 넣어요",
    "답변을 지웠다면 이 질문의 예시만 복원해요. 다른 답변은 그대로 유지돼요.",
  ),
  guide(
    "demo-question-next",
    0,
    "답변을 확인하고 다음으로 가요",
    "예시 답변은 자유롭게 바꿀 수 있어요. 답변을 확인하고 다음을 눌러요. 마지막 질문에서는 내용 확인하기를 눌러요.",
  ),
  guide(
    "tutorial-wizard-next-1",
    0,
    "사업자 정보를 확인해요",
    "체험용 회사 정보가 채워져 있어요. 다음을 눌러 견적 조건을 작성해요.",
  ),
  guide(
    "demo-pg-choice",
    0,
    "상담할 PG사를 선택해요",
    "데모페이를 눌러 선택해요. 선택한 PG사에 요청 내용을 보내고 메시지로 상담할 수 있어요.",
  ),
  guide(
    "demo-review-next",
    0,
    "추천 PG사를 확인해요",
    "선택된 데모페이를 확인하고 다음을 눌러 요청 내용을 확인해요.",
  ),
  guide(
    "tutorial-wizard-submit",
    0,
    "PG사에 상담을 요청해요",
    "요청 내용과 마감일을 확인하고 상담 요청하기를 눌러요. 메시지 상담으로 이어져요.",
  ),
  guide(
    "tutorial-award-cta",
    2,
    "수정된 견적을 선정해요",
    "바뀐 조건을 확인하고 이 견적 선정하기를 눌러요. 확인창에서 최종 선정할 수 있어요.",
  ),
  guide(
    "demo-requote",
    2,
    "견적 수정을 요청해보세요",
    "수수료와 정산조건을 확인했나요? 수정 요청을 눌러 원하는 조건을 PG사에 보내보세요.",
  ),
  guide(
    "demo-send",
    1,
    "PG사에 메시지를 보내보세요",
    "메시지 입력란에 ‘정산주기 조정이 가능한가요?’처럼 질문을 적고 보내기를 눌러요. 데모 PG가 답변과 견적을 보내요.",
  ),
  guide(
    "demo-open-quote",
    2,
    "도착한 견적을 확인해요",
    "받은 견적 확인하기를 누르면 수수료·정산조건을 보고 수정을 요청할 수 있어요.",
  ),
  guide(
    "demo-open-chat",
    1,
    "메시지 상담으로 이동해요",
    "메시지 상담하기를 누른 뒤 질문을 보내보세요.",
  ),
  guide(
    "demo-sign",
    4,
    "전자서명을 체험해요",
    "서명 체험하기를 눌러요. 실제 서비스에서는 이메일로 받은 서명 링크에서 진행해요.",
  ),
  guide(
    "demo-document",
    5,
    "보관된 계약서를 열어보세요",
    "완료 문서를 눌러 체험용 PDF를 확인해요. 실제 서비스에서도 계약서와 감사추적인증서를 이곳에서 확인해요.",
  ),
  guide(
    "demo-archive",
    5,
    "계약 보관함을 확인해요",
    "계약 보관함 보기를 눌러 서명이 끝난 계약과 문서를 확인해요.",
  ),
  guide(
    "demo-start",
    0,
    "견적 요청부터 시작해요",
    "강조된 견적 요청하기를 눌러요. 작성부터 메시지 상담, 계약 보관까지 직접 체험할 수 있어요.",
  ),
];

// Product actions share a business stage; question progress stays in the wizard.
const stages = {
  quick: ["견적 확인", "선정", "서명", "계약 보관"],
  full: ["요청 작성", "메시지 상담", "견적 확인", "선정", "서명", "보관"],
};
function stageFor(fullStage: number, mode: BuyerDemoMode) {
  return mode === "full" ? fullStage : Math.max(0, fullStage - 2);
}

export function BuyerDemoGuide({
  revised,
  mode = "full",
  stage,
  onReturn,
  complete = false,
}: {
  revised: boolean;
  mode?: BuyerDemoMode;
  stage?: number;
  onReturn?: () => void;
  complete?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasModal, setHasModal] = useState(false);
  const [active, setActive] = useState<{
    step: Guide;
    anchor: HTMLElement;
    slot: HTMLElement | null;
  } | null>(null);
  useEffect(() => {
    const update = () => {
      const visible = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          getComputedStyle(el).visibility !== "hidden"
        );
      };
      const modal = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"], [role="alertdialog"]',
        ),
      ]
        .filter(visible)
        .at(-1);
      setHasModal(!!modal);
      const scope = modal ?? document;
      let next: typeof active = null;
      for (const step of steps) {
        const currentFullStage =
          stage === undefined
            ? mode === "quick"
              ? 2
              : 0
            : mode === "quick"
              ? stage + 2
              : stage;
        if (step.fullStage < currentFullStage) continue;
        if (revised && step.target === "demo-requote") continue;
        const anchor = [
          ...scope.querySelectorAll<HTMLElement>(
            `[data-coachmark="${step.target}"]`,
          ),
        ].find(
          (candidate) =>
            visible(candidate) &&
            !(candidate instanceof HTMLButtonElement && candidate.disabled),
        );
        if (anchor) {
          const slot =
            modal?.querySelector<HTMLElement>("[data-demo-guide-slot]") ?? null;
          // An unrelated modal owns the screen; never guide through its backdrop.
          if (!modal || slot) next = { step, anchor, slot };
          break;
        }
      }
      setActive((previous) =>
        previous?.step === next?.step &&
        previous?.anchor === next?.anchor &&
        previous?.slot === next?.slot
          ? previous
          : next,
      );
    };
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [revised, mode, stage]);

  useEffect(() => {
    if (!active || complete) return;
    active.anchor.setAttribute("data-demo-next-action", "");
    return () => active.anchor.removeAttribute("data-demo-next-action");
  }, [active, complete]);

  if (complete || (hasModal && !active)) return null;
  if (!active)
    return onReturn && stage !== undefined ? (
      <section
        aria-label="현재 체험 단계"
        className="flex w-full flex-wrap items-center gap-2"
      >
        <span>{stages[mode][stage]}</span>
        <span className="md-numeric">
          {stage + 1}/{stages[mode].length}
        </span>
        <Button variant="text" onClick={onReturn}>
          현재 단계로 돌아가기
        </Button>
      </section>
    ) : null;
  const { anchor, slot } = active;
  const step =
    active.step.target === "tutorial-award-cta" && !revised
      ? {
          ...active.step,
          title: "견적 조건을 확인하고 선정해요",
          body: "수수료와 정산조건을 확인하고 이 견적 선정하기를 눌러요. 메시지 상담과 수정 요청도 자유롭게 할 수 있어요.",
        }
      : active.step;
  const currentStage = stageFor(step.fullStage, mode);
  const panel = (
    <section
      aria-label={step.title}
      className="w-full min-w-0 md:flex-1 [&_button]:min-h-11 md:[&_button]:min-h-8 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 text-[14px]"
    >
      <style>{`[data-demo-next-action] { outline: 2px solid var(--md-sys-color-primary); outline-offset: 3px; }`}</style>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:flex-nowrap">
        <span className="mr-auto text-[12px] text-[var(--md-sys-color-primary)]">
          {stages[mode][currentStage]}{" "}
          <span className="md-numeric">
            {currentStage + 1}/{stages[mode].length}
          </span>
        </span>
        <div className="order-first w-full min-w-0 md:order-none md:flex-1">
          <p aria-live="polite" className="font-medium">
            {step.title}
          </p>
          <p
            className={`${expanded ? "mt-1" : "hidden md:block md:mt-1"} text-[13px] text-[var(--md-sys-color-on-surface-variant)]`}
          >
            {step.body}
          </p>
        </div>
        <Button
          className="min-h-11 sm:min-h-7"
          size="sm"
          variant="text"
          onClick={() => {
            anchor.scrollIntoView?.({ block: "center", behavior: "auto" });
            const control = anchor.matches(
              "button, a, input, textarea, select, [tabindex]",
            )
              ? anchor
              : anchor.querySelector<HTMLElement>(
                  "input, button, a, textarea, select, [tabindex]",
                );
            control?.focus({ preventScroll: true });
          }}
        >
          위치 보기
        </Button>
        <Button
          className="min-h-11 md:hidden"
          size="sm"
          variant="text"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "설명 접기" : "설명 보기"}
        </Button>
      </div>
    </section>
  );
  // The panel occupies normal layout space, including inside the modal's focus
  // trap. Only an outline marks the target, so no overlay can cover a control.
  return slot ? createPortal(panel, slot) : panel;
}
