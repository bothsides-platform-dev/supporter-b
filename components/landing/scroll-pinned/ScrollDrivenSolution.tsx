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
    let centers: number[] = [];
    let windowHeight = 0;
    const list = content.querySelector<HTMLElement>(`.${styles.solutions}`);
    const heading = content.querySelector<HTMLElement>("h2");
    const comparison = content.querySelector<HTMLElement>(
      `.${styles.comparison}`,
    );
    const showcase = content.querySelector<HTMLElement>(`.${styles.showcase}`);
    if (!list || !heading || !comparison || !showcase) return;
    function updateStep() {
      if (!track || !canPin) return;
      const progress =
        (headerHeight - track.getBoundingClientRect().top) /
        (window.innerHeight * SCROLL_SCREENS);
      const position = Math.max(
        0,
        Math.min(scenes.length - 1, progress * scenes.length - 0.5),
      );
      const from = Math.floor(position);
      const to = Math.min(centers.length - 1, from + 1);
      const center =
        centers[from] + (centers[to] - centers[from]) * (position - from);
      list!.style.setProperty(
        "--solution-offset",
        `${windowHeight / 2 - center}px`,
      );
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
      // Measure the same desktop columns in either mode. Restore before paint;
      // the full document height must never feed back into the pin decision.
      track!.setAttribute("data-measuring", "true");
      const items = Array.from(list!.children) as HTMLElement[];
      const heights = items.map((item) => item.getBoundingClientRect().height);
      windowHeight = Math.max(...heights, 0) + 16;
      const gap = parseFloat(getComputedStyle(list!).rowGap) || 0;
      let offset = 0;
      centers = heights.map((height) => {
        const center = offset + height / 2;
        offset += height + gap;
        return center;
      });
      const requiredHeight =
        Math.max(heading!.getBoundingClientRect().height, windowHeight) +
        comparison!.getBoundingClientRect().height +
        (parseFloat(getComputedStyle(showcase!).rowGap) || 0);
      track!.removeAttribute("data-measuring");
      track!.style.setProperty("--solution-window-height", `${windowHeight}px`);
      canPin =
        window.innerWidth >= 1024 &&
        !media.matches &&
        requiredHeight + padding <= window.innerHeight - headerHeight;
      setPinned(canPin);
      updateStep();
    }
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(heading);
    observer.observe(comparison);
    Array.from(list.children).forEach((item) => observer.observe(item));
    observer.observe(frame);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", updateStep, { passive: true });
    media.addEventListener("change", measure);
    document.fonts?.addEventListener("loadingdone", measure);
    measure();
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
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
        <div
          ref={contentRef}
          className={styles.content}
          onFocusCapture={(event) => {
            if (!pinned) return;
            const buttons = Array.from(
              contentRef.current?.querySelectorAll("li button") ?? [],
            );
            const step = buttons.indexOf(event.target);
            if (step >= 0) selectStep(step);
          }}
        >
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
