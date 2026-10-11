"use client";
import { useState } from "react";
import { Button } from "@/components/primitives/Button";
import { DEMO_VIEWER } from "@/lib/demo/buyer-demo-session";

export function DemoSigningForm({
  onComplete,
  onOpenDocument,
}: {
  onComplete: (name: string) => void;
  onOpenDocument: () => void;
}) {
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  return (
    <>
      <Button variant="outlined" onClick={onOpenDocument}>
        합의서 확인하기
      </Button>
      <label className="space-y-2">
        서명자 이름
        <input
          data-coachmark={!name.trim() ? "demo-sign-name" : undefined}
          className="block w-full rounded-[6px] border p-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          data-coachmark={
            name.trim() && !consent ? "demo-sign-consent" : undefined
          }
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        체험용 합의서 내용을 확인했어요
      </label>
      <Button
        data-coachmark="demo-sign-complete"
        disabled={!consent || !name.trim()}
        onClick={() => onComplete(name.trim())}
      >
        서명 완료하기
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--md-sys-color-outline-variant)] pt-3">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          입력 없이 예시 이름으로 완료할 수도 있어요.
        </p>
        <Button
          variant="outlined"
          size="sm"
          onClick={() => onComplete(DEMO_VIEWER.name)}
        >
          예시로 완료하기
        </Button>
      </div>
    </>
  );
}
