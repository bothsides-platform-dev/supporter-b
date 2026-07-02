'use client';

import { Fragment, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/lib/landing/ease';

const TYPING_VALUES = [
  '협상의 주도권을',
  '연간 수천만 원의 절감을',
  '정보 비대칭 없는 계약을',
  'PG사 간 공정한 경쟁을',
  '5분짜리 경쟁 입찰을',
];

const LINE1_WORDS = ['Supporter', 'B를', '통해'];

function useTypewriter(
  values: string[],
  typingMs = 60,
  deletingMs = 30,
  holdMs = 1800,
): string {
  const [displayText, setDisplayText] = useState(values[0]);
  const [index, setIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = values[index];

    if (!isDeleting && displayText === current) {
      const hold = setTimeout(() => setIsDeleting(true), holdMs);
      return () => clearTimeout(hold);
    }

    if (isDeleting && displayText === '') {
      const advance = setTimeout(() => {
        setIsDeleting(false);
        setIndex((i) => (i + 1) % values.length);
      }, 0);
      return () => clearTimeout(advance);
    }

    const speed = isDeleting ? deletingMs : typingMs;
    const next = isDeleting
      ? displayText.slice(0, -1)
      : current.slice(0, displayText.length + 1);

    const timer = setTimeout(() => setDisplayText(next), speed);
    return () => clearTimeout(timer);
  }, [displayText, index, isDeleting, values, typingMs, deletingMs, holdMs]);

  return displayText;
}

const headlineCls =
  'text-[clamp(30px,5.5vw,72px)] leading-[1.06] tracking-[-0.028em] font-medium break-keep';

// 단어별 마스크 리빌 — overflow-hidden 마스크 안에서 글자가 아래에서 솟아오른다(키네틱 타이포).
// 마스크에 살짝 세로 여유(pb/-mb)를 줘 정착 후 글리프가 잘리지 않게 한다.
function MaskedWord({ word, delay }: { word: string; delay: number }) {
  return (
    <span className="inline-block overflow-hidden align-top pb-[0.08em] -mb-[0.08em]">
      <motion.span
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        className="inline-block will-change-transform"
      >
        {word}
      </motion.span>
    </span>
  );
}

// 다크 오프닝 씬 위의 헤드라인 — 색은 inverse-* 토큰(라이트 테마에서 near-black 위 라이트 텍스트,
// 다크 테마에서는 반전)으로 해석돼 파이널 CTA 인버티드 섹션과 같은 규칙을 따른다.
export function HeroKineticHeadline() {
  const displayText = useTypewriter(TYPING_VALUES);

  return (
    <div className="flex flex-col gap-0">
      <h1 className={`${headlineCls} text-[var(--md-sys-color-inverse-on-surface)]`}>
        {LINE1_WORDS.map((word, i) => (
          <Fragment key={word}>
            <MaskedWord word={word} delay={0.08 + i * 0.07} />
            {i < LINE1_WORDS.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </h1>
      <div className={`${headlineCls} overflow-hidden pb-[0.08em] -mb-[0.08em]`}>
        <motion.div
          initial={{ y: '112%' }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, delay: 0.32, ease: EASE_OUT }}
          className="flex items-baseline flex-wrap will-change-transform"
        >
          <span
            suppressHydrationWarning
            className="text-[var(--md-sys-color-inverse-primary)]"
          >
            {displayText}
          </span>
          <span className="blink-cursor text-[var(--md-sys-color-inverse-primary)]">|</span>
          <span className="text-[var(--md-sys-color-inverse-on-surface)]">&nbsp;만듭니다.</span>
        </motion.div>
      </div>
    </div>
  );
}
