"use client";

import { useState } from "react";
import { Button } from "@/components/primitives/Button";

export function AgentRecoveryLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(href);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={href}
          rel="noreferrer"
          className="text-[var(--md-sys-color-primary)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]"
        >
          {label}
        </a>
        <Button type="button" variant="outlined" onClick={copyLink}>
          링크 복사해요
        </Button>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        같은 화면이 반복되면 링크를 복사해 Chrome이나 Safari 등 브라우저의
        주소창에 붙여 넣어요.
      </p>
      <p role="status" className="text-sm">
        {copyState === "copied" &&
          "링크를 복사했어요. 브라우저 주소창에 붙여 넣어요."}
        {copyState === "failed" &&
          "자동으로 복사하지 못했어요. 아래 링크를 직접 복사해요."}
      </p>
      {copyState === "failed" && (
        <label className="block space-y-1 text-sm">
          <span>다시 열 링크</span>
          <textarea
            readOnly
            value={href}
            onFocus={(event) => event.currentTarget.select()}
            rows={4}
            className="w-full rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3"
          />
        </label>
      )}
    </div>
  );
}
