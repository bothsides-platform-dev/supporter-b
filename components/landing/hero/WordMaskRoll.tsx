'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { cubicBezier } from 'motion';
import { EASE_OUT } from '@/lib/landing/ease';

const HOLD_MS = 3200;
const WORD_ROLL_MS = 500;
const STAGGER_MS = 45;
const MAX_STAGGER_MS = 135;
const easeOut = cubicBezier(...EASE_OUT);

// Strings wrap at word boundaries; arrays supply editorial phrase boundaries.
export type RollingPhrase = string | string[];

interface WordMaskRollProps {
  phrases: RollingPhrase[];
  className?: string;
}

// A content key resets both the clock and visible layers when the phrases change,
// without restarting the cycle for an equivalent array from a parent render.
export function WordMaskRoll({ phrases, className }: WordMaskRollProps) {
  const serialized = JSON.stringify(phrases);
  return (
    <RollingPhrases
      key={serialized}
      serialized={serialized}
      className={className}
    />
  );
}

function RollingPhrases({
  serialized,
  className,
}: {
  serialized: string;
  className?: string;
}) {
  const segments = useMemo(
    () =>
      (JSON.parse(serialized) as RollingPhrase[]).map((phrase) =>
        typeof phrase === 'string'
          ? phrase.split(/\s+/).filter(Boolean)
          : phrase,
      ),
    [serialized],
  );
  const phrases = useMemo(
    () => segments.map((phrase) => phrase.join(' ')),
    [segments],
  );
  const [frame, setFrame] = useState({ index: 0, elapsed: 0, rolling: false });

  useEffect(() => {
    if (phrases.length < 2) return;
    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let index = 0;
    let rolling = false;
    const tick = (now: number) => {
      elapsed += Math.min(now - lastTime, 100);
      lastTime = now;
      const next = (index + 1) % phrases.length;
      const count = Math.max(
        phrases[index].split(/\s+/).filter(Boolean).length,
        phrases[next].split(/\s+/).filter(Boolean).length,
      );
      const rollMs =
        WORD_ROLL_MS +
        Math.min(Math.max(count - 1, 0) * STAGGER_MS, MAX_STAGGER_MS);
      if (!rolling && elapsed >= HOLD_MS) {
        rolling = true;
        elapsed = 0;
      } else if (rolling && elapsed >= rollMs) {
        index = next;
        rolling = false;
        elapsed = 0;
        setFrame({ index, elapsed, rolling });
      }
      if (rolling) setFrame({ index, elapsed, rolling });
      rafId = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      cancelAnimationFrame(rafId);
      if (!document.hidden) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phrases]);

  const layer = (index: number, incoming: boolean, sizing = false) => {
    let wordIndex = 0;
    return (
      <span
        key={sizing ? index : undefined}
        data-roll-layer={sizing ? undefined : incoming ? 'next' : 'current'}
        className={sizing ? undefined : 'absolute inset-0'}
        style={sizing ? { gridArea: '1 / 1' } : undefined}
      >
        {(segments[index] ?? []).map((segment, segmentIndex) => (
          <Fragment key={segmentIndex}>
            {segmentIndex > 0 ? ' ' : null}
            <span
              data-roll-segment
              className="inline-block whitespace-nowrap align-top"
            >
              {segment
                .split(/\s+/)
                .filter(Boolean)
                .map((word, segmentWordIndex) => {
                  const i = wordIndex++;
                  const delay = Math.min(i * STAGGER_MS, MAX_STAGGER_MS);
                  const progress = frame.rolling
                    ? easeOut(
                        Math.min(
                          Math.max((frame.elapsed - delay) / WORD_ROLL_MS, 0),
                          1,
                        ),
                      )
                    : 0;
                  const y = sizing
                    ? 0
                    : incoming
                      ? (1 - progress) * 112
                      : -progress * 112;
                  return (
                    <Fragment key={i}>
                      {segmentWordIndex > 0 ? ' ' : null}
                      <span className="inline-block overflow-hidden align-top pb-[0.08em] -mb-[0.08em]">
                        <span
                          data-roll-word
                          className="inline-block"
                          style={{ transform: `translateY(${y}%)` }}
                        >
                          {word}
                        </span>
                      </span>
                    </Fragment>
                  );
                })}
            </span>
          </Fragment>
        ))}
      </span>
    );
  };

  return (
    <span
      className={`relative inline-grid max-w-full align-top whitespace-normal ${className ?? ''}`}
    >
      <span className="sr-only">{phrases[frame.index] ?? ''}</span>
      {/* All candidates share a grid cell: the widest/tallest reserves space even
          on narrow screens, where whole words may wrap. No measuring or font race. */}
      <span
        aria-hidden="true"
        data-roll-sizing
        className="invisible grid"
        style={{ gridArea: '1 / 1' }}
      >
        {phrases.map((_, i) => layer(i, false, true))}
      </span>
      <span
        aria-hidden="true"
        className="relative"
        style={{ gridArea: '1 / 1' }}
      >
        {layer(frame.index, false)}
        {frame.rolling ? layer((frame.index + 1) % phrases.length, true) : null}
      </span>
    </span>
  );
}
