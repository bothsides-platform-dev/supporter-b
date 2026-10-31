'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
  const [frame, setFrame] = useState({ index: 0, rolling: false });
  const layersRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (phrases.length < 2) return;
    // Each phase starts only after its layers commit. Boundary updates stop the
    // loop; the next Effect owns the next phase's clock and animation frame.
    const current = Array.from(layersRef.current!.querySelectorAll<HTMLElement>(
      '[data-roll-layer="current"] [data-roll-character]',
    ));
    const incoming = Array.from(layersRef.current!.querySelectorAll<HTMLElement>(
      '[data-roll-layer="next"] [data-roll-character]',
    ));
    const rollMs = CHARACTER_ROLL_MS +
      Math.max(Math.max(current.length, incoming.length) - 1, 0) * STAGGER_MS;
    let rafId = 0;
    let active = true;
    let lastTime = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      if (!active || document.hidden) return;
      elapsed += Math.min(now - lastTime, 100);
      lastTime = now;
      if (elapsed >= (frame.rolling ? rollMs : HOLD_MS)) {
        active = false;
        setFrame({
          index: frame.rolling ? (frame.index + 1) % phrases.length : frame.index,
          rolling: !frame.rolling,
        });
        return;
      }
      if (frame.rolling) {
        const move = (characters: HTMLElement[], incoming: boolean) => {
          characters.forEach((character, i) => {
            const progress = easeRoll(Math.min(Math.max(
              (elapsed - i * STAGGER_MS) / CHARACTER_ROLL_MS, 0,
            ), 1));
            character.style.transform = `translateY(${(incoming ? 1 - progress : -progress) * 112}%)`;
          });
        };
        move(current, false);
        move(incoming, true);
      }
      rafId = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      cancelAnimationFrame(rafId);
      if (active && !document.hidden) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phrases, frame]);

  const layer = (index: number, incoming: boolean, sizing = false) => {
    let characterIndex = 0;
    return (
      <span
        key={sizing ? index : `${index}-${incoming}`}
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
                          // React owns only the initial position. Stable styles
                          // preserve imperative motion on parent renders; layer
                          // keys remount the settled phrase at its initial 0%.
                          const y = !sizing && incoming ? 112 : 0;
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
        ref={layersRef}
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
