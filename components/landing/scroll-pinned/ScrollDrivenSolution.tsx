"use client";

import { useEffect, useRef, useState } from "react";
import { SolutionShowcase } from "../SolutionShowcase";
import type { SolutionScene } from "../solution-scenes";
import styles from "../SolutionShowcase.module.css";

const SCROLL_SCREENS = 1.6;

// This section owns its fallback; other landing sections retain their pin policy.
export function ScrollDrivenSolution({ scenes }: { scenes: SolutionScene[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // SSR and the first client render both expose the complete document.
  const [pinned, setPinned] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!track || !frame || !content) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let canPin = false;
    let headerHeight = 0;
    function updateStep() {
      if (!track || !canPin) return;
      const progress =
        (headerHeight - track.getBoundingClientRect().top) /
        (window.innerHeight * SCROLL_SCREENS);
      setActiveStep(
        Math.max(
          0,
          Math.min(scenes.length - 1, Math.floor(progress * scenes.length)),
        ),
      );
    }
    function measure() {
      if (!frame || !content) return;
      const style = getComputedStyle(frame);
      headerHeight = parseFloat(style.top) || 0;
      const padding =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0);
      canPin =
        window.innerWidth >= 1024 &&
        !media.matches &&
        content.getBoundingClientRect().height + padding <=
          window.innerHeight - headerHeight;
      setPinned(canPin);
      updateStep();
    }
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(frame);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", updateStep, { passive: true });
    media.addEventListener("change", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", updateStep);
      media.removeEventListener("change", measure);
    };
  }, [scenes]);

  function selectStep(step: number) {
    setActiveStep(step);
    if (!pinned || !trackRef.current || !frameRef.current) return;
    const headerHeight =
      parseFloat(getComputedStyle(frameRef.current).top) || 0;
    window.scrollTo({
      top:
        window.scrollY +
        trackRef.current.getBoundingClientRect().top -
        headerHeight +
        window.innerHeight * SCROLL_SCREENS * ((step + 0.5) / scenes.length),
      behavior: "instant",
    });
  }

  return (
    <div
      ref={trackRef}
      className={styles.track}
      data-pinned={pinned}
      style={
        pinned
          ? {
              height: `calc(100vh - var(--landing-header-height) + ${SCROLL_SCREENS * 100}vh)`,
            }
          : undefined
      }
    >
      <div ref={frameRef} className={styles.frame}>
        <div ref={contentRef} className={styles.content}>
          <SolutionShowcase
            scenes={scenes}
            activeStep={activeStep}
            onSelect={selectStep}
          />
        </div>
      </div>
    </div>
  );
}
