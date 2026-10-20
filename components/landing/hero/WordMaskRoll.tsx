'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { cubicBezier } from 'motion';

const HOLD_MS = 3200;
const CHARACTER_ROLL_MS = 620;
const STAGGER_MS = 30;
// Repeated rolls need a gentle departure as well as a soft landing. The entry
// reveal's ease-out travels two thirds of the way in its first 80ms.
const easeRoll = cubicBezier(0.65, 0, 0.35, 1);

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
        Array.from(phrases[index].replace(/\s/g, '')).length,
        Array.from(phrases[next].replace(/\s/g, '')).length,
      );
      const rollMs =
        CHARACTER_ROLL_MS + Math.max(count - 1, 0) * STAGGER_MS;
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
    let characterIndex = 0;
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
                  return (
                    <Fragment key={segmentWordIndex}>
                      {segmentWordIndex > 0 ? ' ' : null}
                      <span
                        data-roll-word
                        className="inline-block whitespace-nowrap align-top"
                      >
                        {Array.from(word).map((character) => {
                          const i = characterIndex++;
                          const delay = i * STAGGER_MS;
                          const progress = frame.rolling
                            ? easeRoll(
                                Math.min(
                                  Math.max((frame.elapsed - delay) / CHARACTER_ROLL_MS, 0),
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
                            <span
                              key={i}
                              className="inline-block overflow-hidden align-top pb-[0.08em] -mb-[0.08em]"
                            >
                              <span
                                data-roll-character
                                className="inline-block"
                                style={{ transform: `translateY(${y}%)` }}
                              >
                                {character}
                              </span>
                            </span>
                          );
                        })}
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
