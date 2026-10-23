"use client";

import { Chip } from "@/components/primitives/Chip";
import type { SolutionScene } from "./solution-scenes";
import styles from "./SolutionShowcase.module.css";

function Conditions({ summary = false }: { summary?: boolean }) {
  return (
    <dl className={styles.conditions}>
      {summary && (
        <div>
          <dt>카드 수수료</dt>
          <dd className="md-numeric">1.85%</dd>
        </div>
      )}
      <div>
        <dt>정산주기</dt>
        <dd className="md-numeric">D+1</dd>
      </div>
      <div>
        <dt>보증보험</dt>
        <dd>심사 후 안내</dd>
      </div>
      <div>
        <dt>가입비</dt>
        <dd className="md-numeric">0원</dd>
      </div>
    </dl>
  );
}

function ProductExample({ kind }: { kind: SolutionScene["example"] }) {
  return (
    <figure className={styles.example} data-example={kind}>
      <div className={styles.panel}>
        {kind === "fee" && (
          <>
            <div className={styles.panelHeading}>
              <span>우리 사업에 도착한 견적</span>
              <Chip color="primary" label="받은 견적" />
            </div>
            <div className={styles.fee}>
              <p>카드 수수료</p>
              <p className={`md-numeric ${styles.feeValue}`}>
                1.85<span>%</span>
              </p>
              <p className={styles.secondary}>사업 조건에 맞춰 제시한 요율</p>
            </div>
            <div className={styles.panelFooter}>
              요청한 사업 조건과 함께 확인해요
            </div>
          </>
        )}
        {kind === "conditions" && (
          <>
            <div className={styles.panelHeading}>도입 조건 확인</div>
            <div className={styles.statuses}>
              <div>
                <span>PG 검토</span>
                <Chip color="tertiary" label="검토 완료" />
              </div>
              <div>
                <span>카드사 승인</span>
                <Chip color="warning" label="심사 중" />
              </div>
            </div>
            <Conditions />
          </>
        )}
        {kind === "negotiation" && (
          <>
            <div className={styles.panelHeading}>견적 조건 협의</div>
            <div className={styles.messages}>
              <div>
                <p className={styles.secondary}>구매사</p>
                <p>거래 규모에 맞춰 수수료를 조정할 수 있을까요?</p>
              </div>
              <div>
                <p className={styles.secondary}>PG 담당자</p>
                <p>말씀하신 조건을 검토해 수정 견적을 보냈어요.</p>
              </div>
            </div>
            <div className={styles.revision}>
              <span>카드 수수료</span>
              <p>
                <del className="md-numeric">1.95%</del>
                <span aria-label="에서"> → </span>
                <strong className="md-numeric">1.85%</strong>
              </p>
            </div>
          </>
        )}
        {kind === "decision" && (
          <>
            <div className={styles.panelHeading}>
              <span>최종 조건 요약</span>
              <Chip color="primary" label="선택 전 확인" />
            </div>
            <Conditions summary />
            <ol className={styles.journey} aria-label="견적 진행 순서">
              <li>견적 확인</li>
              <li>조건 협의</li>
              <li>최종 선택</li>
            </ol>
          </>
        )}
      </div>
      <figcaption>
        이해를 돕기 위한 예시예요. 실제 조건은 PG사와 심사 결과에 따라 달라져요.
      </figcaption>
    </figure>
  );
}

export function SolutionShowcase({
  scenes,
  activeStep = null,
}: {
  scenes: SolutionScene[];
  activeStep?: number | null;
}) {
  const pinned = activeStep !== null;
  return (
    <div className={styles.showcase} data-pinned={pinned}>
      <div className={styles.scenes}>
        {scenes.map((scene, index) => {
          const hidden = pinned && index !== activeStep;
          return (
            <article
              key={scene.example}
              className={styles.scene}
              aria-hidden={hidden ? true : undefined}
              inert={hidden}
              data-active={!hidden}
            >
              <div className={styles.copy}>
                <h2>
                  {scene.title}
                  <br />
                  <span>{scene.emphasis}</span>
                </h2>
                <p>{scene.description}</p>
              </div>
              <ProductExample kind={scene.example} />
            </article>
          );
        })}
      </div>
      {pinned && (
        <div className={styles.progress} aria-hidden="true">
          {scenes.map((scene, index) => (
            <span key={scene.example} data-active={index === activeStep} />
          ))}
        </div>
      )}
    </div>
  );
}
