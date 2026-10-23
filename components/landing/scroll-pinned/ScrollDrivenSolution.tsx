"use client";

import { useEffect, useRef, useState } from "react";
import { SolutionShowcase } from "../SolutionShowcase";
import type { SolutionScene } from "../solution-scenes";
import styles from "../SolutionShowcase.module.css";

// This section owns its fallback; other landing sections retain their pin policy.
export function ScrollDrivenSolution({ scenes }: { scenes: SolutionScene[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // SSR and the first client render both expose the complete document.
  const [pinned, setPinned] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    const frame = frameRef.current;
    if (!track || !frame) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let canPin = false;
    let headerHeight = 0;
    function updateStep() {
      if (!track || !canPin) return;
      const progress =
        (headerHeight - track.getBoundingClientRect().top) /
        (window.innerHeight * 2.8);
      setActiveStep(
        Math.max(
          0,
          Math.min(scenes.length - 1, Math.floor(progress * scenes.length)),
        ),
      );
    }
    function measure() {
      if (!frame) return;
      headerHeight = parseFloat(getComputedStyle(frame).top) || 0;
      const tallest = Math.max(
        0,
        ...Array.from(
          frame.querySelectorAll("article"),
          (scene) => scene.getBoundingClientRect().height,
        ),
      );
      // 80px frame padding + 40px progress. Measure all scenes, including hidden ones.
      canPin =
        window.innerWidth >= 1024 &&
        !media.matches &&
        tallest + 120 <= window.innerHeight - headerHeight;
      setPinned(canPin);
      updateStep();
    }
    const observer = new ResizeObserver(measure);
    frame
      .querySelectorAll("article")
      .forEach((scene) => observer.observe(scene));
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

  return (
    <div
      ref={trackRef}
      className={styles.track}
      data-pinned={pinned}
      style={
        pinned
          ? { height: "calc(100svh - var(--landing-header-height) + 280vh)" }
          : undefined
      }
    >
      <div ref={frameRef} className={styles.frame}>
        <SolutionShowcase
          scenes={scenes}
          activeStep={pinned ? activeStep : null}
        />
      </div>
    </div>
  );
}
