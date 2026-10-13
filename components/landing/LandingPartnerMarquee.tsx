'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import styles from './LandingPartnerMarquee.module.css';

// The supplied files stay intact. Toss's transparent padding is cropped only in
// its display viewport; Hecto stays below its source height of 30px.
const PARTNERS = [
  { name: '토스페이먼츠', file: 'toss-payments.png', width: 1000, height: 333,
    displayWidth: 184, displayHeight: 184 * 124 / 738, crop: { x: 131, y: 104, width: 738 },
    symbolClip: 'inset(0 72% 0 0)', wordmarkClip: 'inset(0 0 0 28%)' },
  { name: '키움페이', file: 'kiwoom-pay.png', width: 334, height: 106,
    displayWidth: 130, displayHeight: 130 * 106 / 334,
    // The gray stem extends left below the lettering: x=254 above y=92,
    // x=247 below it, in the original 334×106 image.
    symbolClip: 'polygon(76.047904% 0, 100% 0, 100% 100%, 73.952096% 100%, 73.952096% 86.792453%, 76.047904% 86.792453%)',
    wordmarkClip: 'polygon(0 0, 76.047904% 0, 76.047904% 86.792453%, 73.952096% 86.792453%, 73.952096% 100%, 0 100%)' },
  { name: '헥토파이낸셜', file: 'hecto-financial.png', width: 204, height: 30,
    displayWidth: 184, displayHeight: 184 * 30 / 204,
    symbolClip: 'inset(0)', wordmarkClip: 'inset(0 100% 0 0)' },
] as const;

export function LandingPartnerMarquee() {
  const viewportRef = useRef<HTMLElement>(null);
  const unitRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ repeats: 1, duration: 0 });

  useEffect(() => {
    const viewport = viewportRef.current;
    const unit = unitRef.current;
    if (!viewport || !unit) return;
    let measured = false;
    let inView = typeof IntersectionObserver === 'undefined';
    const updatePlayback = () => {
      // Removing the local override lets the hero's faded-state pause win.
      if (!measured || !inView || document.hidden) {
        viewport.style.setProperty('--partner-local-play-state', 'paused');
      } else {
        viewport.style.removeProperty('--partner-local-play-state');
      }
    };
    const measure = () => {
      const width = viewport.getBoundingClientRect().width;
      const unitWidth = unit.getBoundingClientRect().width;
      measured = width > 0 && unitWidth > 0;
      if (measured) {
        const repeats = Math.max(1, Math.ceil(width / unitWidth));
        const duration = repeats * unitWidth / 28;
        setGeometry((previous) => previous.repeats === repeats && previous.duration === duration
          ? previous : { repeats, duration });
      }
      updatePlayback();
    };
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    resize?.observe(viewport);
    resize?.observe(unit);
    const intersection = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updatePlayback();
    });
    intersection?.observe(viewport);
    document.addEventListener('visibilitychange', updatePlayback);
    measure();
    return () => {
      resize?.disconnect();
      intersection?.disconnect();
      document.removeEventListener('visibilitychange', updatePlayback);
    };
  }, []);

  return (
    <section ref={viewportRef} aria-label="제휴 PG사" className={styles.partners}>
      <div className={styles.mask}>
        <div data-partner-track className={styles.track} style={{ animationDuration: `${geometry.duration}s` }}>
          {[0, 1].map((group) => (
            <div data-partner-group key={group} className={styles.group} aria-hidden={group === 1 ? true : undefined}>
              {Array.from({ length: geometry.repeats }, (_, repeat) => (
                <div data-partner-unit key={repeat} ref={group === 0 && repeat === 0 ? unitRef : undefined}
                  className={styles.unit} aria-hidden={repeat > 0 ? true : undefined}>
                  {PARTNERS.map((partner) => (
                    <span key={partner.file} data-partner-logo role="img" aria-label={partner.name} className={styles.logo} style={{
                      '--logo-width': `${partner.displayWidth}px`,
                      '--logo-image': `url("/images/landing-partners/${partner.file}")`,
                      '--logo-source-ratio': `${partner.width} / ${partner.height}`,
                      '--logo-symbol-clip': partner.symbolClip,
                      '--logo-wordmark-clip': partner.wordmarkClip,
                      ...('crop' in partner ? {
                        '--logo-source-width': `${partner.width / partner.crop.width * 100}%`,
                        '--logo-source-left': `${-partner.crop.x / partner.crop.width * 100}%`,
                        '--logo-source-top': `${-partner.crop.y / 124 * 100}%`,
                      } : {}),
                      aspectRatio: `${partner.displayWidth} / ${partner.displayHeight}`,
                    } as CSSProperties}>
                      <span data-partner-mono aria-hidden className={`${styles.artwork} ${styles.ink} ${styles.mono}`} />
                      <span data-partner-color aria-hidden className={`${styles.artwork} ${styles.color}`}>
                        {/* Clip in source-image coordinates: preserve bright lettering
                            while revealing only Toss/Kiwoom's original symbols. */}
                        <span className={`${styles.ink} ${styles.wordmark}`} />
                        <Image src={`/images/landing-partners/${partner.file}`} alt=""
                          width={partner.width} height={partner.height} unoptimized loading="eager"
                          draggable={false} className={styles.image} />
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
