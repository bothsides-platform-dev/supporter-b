import type { ReactNode } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./RfpMatchingLoading.module.css";

const STEPS = ["사업자 정보 확인", "업종별 상담 조건 확인", "추천 PG사 준비"];
// Illustrative brand reel, not the recommendation list. Eligibility remains server-owned.
const LOGOS = [
  { file: "kcp.svg", name: "" },
  { file: "inicis.png", name: "KG이니시스" },
  { file: "toss.png", name: "토스페이먼츠" },
  { file: "kcp.svg", name: "NHN KCP" },
  { file: "inicis.png", name: "" },
];

function LoadingDots() {
  return (
    <span className={styles.dots} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function RfpMatchingLoading({
  phase,
  business,
  children,
}: {
  phase: number;
  business?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className="mx-auto max-w-[480px] pt-10 pb-6 sm:pt-14"
      aria-label="맞춤 PG 추천 진행"
    >
      <h2 className={styles.title}>
        {phase === 3 ? (
          <>
            추천 PG사를 <br />
            확인했어요
          </>
        ) : (
          <>
            사업에 맞는 PG사를 <br />
            찾고 있어요
          </>
        )}
      </h2>
      <p className="leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        입력한 사업자 정보와 <br />
        업종별 상담 조건을 확인하고 있어요.
      </p>
      <ol className="mt-8 sm:mt-10" aria-live="polite" aria-atomic="true">
        {STEPS.map((label, index) => {
          const missing = index === 0 && business === false && phase > 0;
          const done = index < phase && !missing;
          const active = index === phase;
          return (
            <li
              key={label}
              aria-label={`${label} ${missing ? "등록된 정보 없음" : done ? "완료" : active ? "확인 중" : "대기"}`}
              className="flex h-[62px] items-center justify-between gap-4"
            >
              <span
                className={cn(
                  active && "font-semibold",
                  !active &&
                    !done &&
                    "text-[var(--md-sys-color-on-surface-variant)]",
                )}
              >
                {label}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[var(--md-sys-color-primary)]">
                {missing ? (
                  <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                    등록된 정보 없음
                  </span>
                ) : done ? (
                  <>
                    <Check size={20} aria-hidden="true" />
                    <span className="text-[12px]">완료</span>
                  </>
                ) : active ? (
                  <LoadingDots />
                ) : (
                  <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
                    대기
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 h-[138px]">
        {phase >= 2 && (
          <div className={styles.review}>
            <div className={styles.window} aria-hidden="true">
              <div className={styles.track}>
                {LOGOS.map((logo, index) => (
                  <div
                    key={`${logo.file}-${index}`}
                    className={styles.logo}
                    style={{ animationDelay: `${(index - 1) * 900}ms` }}
                  >
                    <Image
                      src={`/images/pg-logos/${logo.file}`}
                      alt={logo.name}
                      width={120}
                      height={33}
                      unoptimized
                      className="h-auto max-h-[33px] w-auto max-w-[120px] object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
            <p
              role="status"
              className="mt-3 flex items-center justify-center gap-2 text-[13px] text-[var(--md-sys-color-primary)]"
            >
              {phase < 3 && <LoadingDots />}
              {phase === 3 ? "상담 조건 확인 완료" : "상담 조건 검토 중"}
            </p>
          </div>
        )}
      </div>
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        잠시 후 추천 PG사를 보여드릴게요.
      </p>
      {children}
    </section>
  );
}
