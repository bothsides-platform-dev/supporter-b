"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/primitives/Button";
import { createPortal } from "react-dom";
import type { CoachmarkStep } from "@/components/onboarding/coachmarks/types";

type Guide = CoachmarkStep & { position: number };
const guide = (
  target: string,
  position: number,
  title: string,
  body: string,
): Guide => ({
  target,
  position,
  title,
  body,
  kind: "action",
  placement: "top",
});
// Dialog actions come first. Advancement follows rendered product state, never
// a click counter: validation failures and cancelled dialogs retain their guide.
const steps: Guide[] = [
  guide(
    "demo-sign-name",
    12,
    "서명자 이름을 입력해요",
    "체험에 사용할 이름을 입력해요. 실제 본인인증이나 계약 발송은 이루어지지 않아요.",
  ),
  guide(
    "demo-sign-consent",
    12,
    "합의서 확인란을 눌러요",
    "합의서 내용을 확인한 뒤 체크해요. 다음으로 서명 완료하기를 누를 수 있어요.",
  ),
  guide(
    "demo-sign-complete",
    12,
    "이름을 입력하고 서명을 마쳐요",
    "합의서를 확인한 뒤 이름을 입력하고 확인란을 체크해요. 서명 완료하기를 누르면 보관함에 문서가 생겨요.",
  ),
  guide(
    "demo-award-confirm",
    10,
    "조건을 확인하고 선정해요",
    "최종 조건을 읽고 선정할게요를 눌러요. 이어서 계약 서명을 체험할 수 있어요.",
  ),
  guide(
    "demo-requote-send",
    8,
    "수정 내용과 응답 마감일을 정해요",
    "예: ‘정산주기를 D+3으로 조정해주세요’를 입력해요. 기존 마감보다 늦은 날을 고르고 수정 요청 보내기를 눌러요.",
  ),
  guide(
    "demo-question-next",
    2,
    "답변을 확인하고 다음으로 가요",
    "예시 답변은 자유롭게 바꿀 수 있어요. 답변을 확인하고 다음을 눌러요. 마지막 질문에서는 내용 확인하기를 눌러요.",
  ),
  guide(
    "tutorial-wizard-next-1",
    1,
    "사업자 정보를 확인해요",
    "체험용 회사 정보가 채워져 있어요. 다음을 눌러 견적 조건을 작성해요.",
  ),
  guide(
    "demo-pg-choice",
    3,
    "상담할 PG사를 선택해요",
    "데모페이를 눌러 선택해요. 선택한 PG사에 요청 내용을 보내고 메시지로 상담할 수 있어요.",
  ),
  guide(
    "demo-review-next",
    3,
    "추천 PG사를 확인해요",
    "선택된 데모페이를 확인하고 다음을 눌러 요청 내용을 확인해요.",
  ),
  guide(
    "tutorial-wizard-submit",
    4,
    "PG사에 상담을 요청해요",
    "요청 내용과 마감일을 확인하고 상담 요청하기를 눌러요. 메시지 상담으로 이어져요.",
  ),
  guide(
    "demo-requote",
    7,
    "견적 수정을 요청해보세요",
    "수수료와 정산조건을 확인했나요? 수정 요청을 눌러 원하는 조건을 PG사에 보내보세요.",
  ),
  guide(
    "tutorial-award-cta",
    9,
    "수정된 견적을 선정해요",
    "바뀐 조건을 확인하고 이 견적 선정하기를 눌러요. 확인창에서 최종 선정할 수 있어요.",
  ),
  guide(
    "demo-send",
    5,
    "PG사에 메시지를 보내보세요",
    "메시지 입력란에 ‘정산주기 조정이 가능한가요?’처럼 질문을 적고 보내기를 눌러요. 데모 PG가 답변과 견적을 보내요.",
  ),
  guide(
    "demo-open-quote",
    6,
    "도착한 견적을 확인해요",
    "받은 견적 확인하기를 누르면 수수료·정산조건을 보고 수정을 요청할 수 있어요.",
  ),
  guide(
    "demo-open-chat",
    5,
    "메시지 상담으로 이동해요",
    "메시지 상담하기를 누른 뒤 질문을 보내보세요.",
  ),
  guide(
    "demo-sign",
    11,
    "전자서명을 체험해요",
    "서명 체험하기를 눌러요. 실제 서비스에서는 이메일로 받은 서명 링크에서 진행해요.",
  ),
  guide(
    "demo-document",
    14,
    "보관된 계약서를 열어보세요",
    "완료 문서를 눌러 체험용 PDF를 확인해요. 실제 서비스에서도 계약서와 감사추적인증서를 이곳에서 확인해요.",
  ),
  guide(
    "demo-archive",
    13,
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

// Optional navigation (mobile review / chat shortcut) shares its destination
// position. The denominator is derived from the ordered journey checkpoints.
const stepCount = Math.max(...steps.map((step) => step.position)) + 1;

export function BuyerDemoGuide({ revised }: { revised: boolean }) {
  const [expanded, setExpanded] = useState(true);
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
        ...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'),
      ]
        .filter(visible)
        .at(-1);
      const scope = modal ?? document;
      let next: typeof active = null;
      for (const step of steps) {
        if (revised && step.target === "demo-requote") continue;
        const anchor = [
          ...scope.querySelectorAll<HTMLElement>(
            `[data-coachmark="${step.target}"]`,
          ),
        ].find(visible);
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
  }, [revised]);

  useEffect(() => {
    if (!active) return;
    active.anchor.setAttribute("data-demo-next-action", "");
    return () => active.anchor.removeAttribute("data-demo-next-action");
  }, [active]);

  if (!active) return null;
  const { step, anchor, slot } = active;
  const panel = (
    <section
      aria-label={step.title}
      className="w-full min-w-0 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 text-[14px]"
    >
      <style>{`[data-demo-next-action] { outline: 2px solid var(--md-sys-color-primary); outline-offset: 3px; }`}</style>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="mr-auto text-[12px] text-[var(--md-sys-color-primary)]">
          다음 행동{" "}
          <span className="md-numeric">
            {step.position + 1}/{stepCount}
          </span>
        </span>
        <p aria-live="polite" className="order-first w-full font-medium">
          {step.title}
        </p>
        <Button
          size="sm"
          variant="text"
          onClick={() => {
            anchor.scrollIntoView?.({ block: "center", behavior: "auto" });
            anchor.focus({ preventScroll: true });
          }}
        >
          위치 보기
        </Button>
        <Button
          size="sm"
          variant="text"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "설명 접기" : "설명 보기"}
        </Button>
      </div>
      {expanded && (
        <p className="mt-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {step.body}
        </p>
      )}
    </section>
  );
  // The panel occupies normal layout space, including inside the modal's focus
  // trap. Only an outline marks the target, so no overlay can cover a control.
  return slot ? createPortal(panel, slot) : panel;
}
