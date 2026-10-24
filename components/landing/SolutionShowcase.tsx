"use client";

import { Check } from "lucide-react";
import { OfferComparisonTable } from "./OfferComparisonTable";
import type { SolutionScene } from "./solution-scenes";
import styles from "./SolutionShowcase.module.css";

export function SolutionShowcase({
  scenes,
  activeStep = null,
  onSelect,
}: {
  scenes: SolutionScene[];
  activeStep?: number | null;
  onSelect?: (step: number) => void;
}) {
  return (
    <div className={styles.showcase}>
      <div className={styles.intro}>
        <h2 className={styles.heading}>
          PG 도입의 고민,
          <br />
          서포트비에서 해결해요
        </h2>
        <ul className={styles.solutions}>
          {scenes.map((scene, index) => (
            <li
              key={scene.example}
              className={styles.solution}
              data-active={index === activeStep}
            >
              <h3>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(index)}
                    aria-pressed={index === activeStep}
                  >
                    <Check size={20} strokeWidth={1.5} aria-hidden="true" />
                    <span>{scene.title}</span>
                  </button>
                ) : (
                  <span className={styles.label}>
                    <Check size={20} strokeWidth={1.5} aria-hidden="true" />
                    <span>{scene.title}</span>
                  </span>
                )}
              </h3>
              <p>{scene.description}</p>
            </li>
          ))}
        </ul>
      </div>
      <OfferComparisonTable presentation="solution" activeStep={activeStep} />
    </div>
  );
}
