import { Footer } from '@/components/shell/Footer';
import { PgLandingHeaderNav } from '@/components/landing/PgLandingHeaderNav';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { PgHeroSection } from '@/components/landing/PgHeroSection';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { FadeInView } from '@/components/landing/FadeInView';
import { ScrollDrivenProblem } from '@/components/landing/scroll-pinned/ScrollDrivenProblem';
import { CustomerTypesGrid } from '@/components/landing/CustomerTypesGrid';
import { PgCaseCard } from '@/components/landing/PgCaseCard';
import { LANDING_TYPE } from '@/components/landing/landing-type';
import { PgDemoAppShell } from '@/components/landing/demo-app/PgDemoAppShell';
import { FaqList } from '@/components/landing/FaqList';
import { ConsultButton } from '@/components/landing/ConsultButton';
import { PG_FAQ_ITEMS } from '@/components/landing/pg-faq-data';

import {
  PROBLEM_ITEMS,
  CUSTOMER_TYPES,
  VERIFIED_POINTS,
  PROCESS_STEPS,
  CASES,
  organizationJsonLd,
  faqPageJsonLd,
} from '@/components/landing/pg-landing-data';
import { serializeJsonLd } from '@/lib/seo/jsonld';

const sectionCls =
  'py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)] scroll-mt-[var(--shell-topbar)]';
const containerCls = 'mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]';
const subCls = `max-w-[760px] ${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface-variant)]`;

export function PgLanding() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--md-sys-color-surface)] flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqPageJsonLd) }}
      />

      {/* ── Nav — 히어로 다크 씬 위에서는 투명+라이트 톤(over-dark), 리빌 후 surface 복귀 ── */}
      <LandingHeader>
        <PgLandingHeaderNav />
      </LandingHeader>

      <main className="flex-1 pt-[var(--shell-topbar)]">
        {/* ── 화면1: Hero ── */}
        <PgHeroSection />

        {/* ── 화면2: PG 영업 문제 제기 (pin: 누적 등장) ── */}
        <section id="problem" className={sectionCls}>
          <ScrollDrivenProblem
            heading={
              <SectionHeading>
                PG 영업에서 가장 어려운 건<br />
                리드 수가 아니라, 확실한 니즈입니다
              </SectionHeading>
            }
            intro={
              <FadeInView>
                <p className={subCls}>
                  고객사를 아무리 많이 만나도, 실제로 PG를 바꾸거나 새로 도입하려는 곳은 많지
                  않습니다. 의사가 불분명한 리드에 제안서와 미팅이 쌓일수록, 정작 수주로 이어지는
                  기회는 줄어듭니다.
                </p>
              </FadeInView>
            }
            items={PROBLEM_ITEMS}
            stagger={0.06}
          />
        </section>

        {/* ── 화면3: 신규 성장 고객사 인바운드 (정적 2x2 그리드) ── */}
        <section id="inbound" className={sectionCls}>
          <CustomerTypesGrid
            heading={<SectionHeading>새로운 성장 고객사가 PG사를 찾아오게 만듭니다</SectionHeading>}
            intro={
              <FadeInView>
                <p className={subCls}>
                  수수료율·정산주기·보증금·운영 조건을 비교하려는 고객사가 서포트비에 견적을
                  올립니다. 파트너 PG사는 먼저 연락하지 않아도, 조건에 맞는 요청을 인바운드로 받아
                  새로운 영업 기회를 확보합니다.
                </p>
              </FadeInView>
            }
            items={CUSTOMER_TYPES}
          />
          <div className={`${containerCls} mt-[var(--s-9)]`}>
            <FadeInView>
              <p className={`${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface)]`}>
                서포트비는 “PG 조건을 비교하고 싶다”는 분명한 신호가 있는 고객사만 골라
                연결합니다.
              </p>
            </FadeInView>
          </div>
        </section>

        {/* ── 화면4: 검증된 리드 / 동일한 기회 ── */}
        <section id="advantage" className={sectionCls}>
          <div className={containerCls}>
            <div className="flex flex-col gap-[var(--s-5)]">
              <SectionHeading>검증된 고객사의 영업기회를 동일한 기준으로 제공합니다</SectionHeading>
              <FadeInView>
                <p className={subCls}>
                  모든 리드의 가치가 같지는 않습니다. 업종·거래 규모·현재 조건·희망 조건을 미리
                  정리해 전달하고, 조건이 맞는 파트너 PG사에게 같은 기준으로 제안 기회를 드립니다.
                </p>
              </FadeInView>
            </div>
            <div className="grid grid-cols-1 gap-[var(--s-4)] md:grid-cols-3">
              {VERIFIED_POINTS.map((p, i) => (
                <FadeInView key={p.index} delay={i * 0.06}>
                  <div className="flex h-full flex-col gap-[var(--s-3)] rounded-lg border border-[var(--md-sys-color-outline-variant)] p-[var(--s-6)]">
                    <span className="font-mono tabular-nums text-[var(--text-md)] tracking-[-0.02em] text-[var(--md-sys-color-primary)]">
                      {p.index}
                    </span>
                    <h3 className={`${LANDING_TYPE.heading3} text-[var(--md-sys-color-on-surface)]`}>
                      {p.title}
                    </h3>
                    <p className={`${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface-variant)]`}>
                      {p.desc}
                    </p>
                  </div>
                </FadeInView>
              ))}
            </div>
          </div>
        </section>

        {/* ── 화면5: 참여 프로세스 ── */}
        <section id="process" className={sectionCls}>
          <div className={`${containerCls} gap-[var(--s-8)]`}>
            <SectionHeading>파트너 참여 방식은 간단합니다</SectionHeading>
            <PgDemoAppShell steps={PROCESS_STEPS} />
            <FadeInView>
              <div>
                <ConsultButton href="/signup/pg">파트너로 시작하기 →</ConsultButton>
              </div>
            </FadeInView>
          </div>
        </section>

        {/* ── 화면6: 파트너사 영업 성과 사례 ── */}
        <section id="cases" className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>영업팀은 더 좋은 기회에 집중할 수 있습니다</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-4)]">
              {CASES.map((c, i) => (
                <FadeInView key={c.role} delay={i * 0.06}>
                  <PgCaseCard
                    metric={c.metric}
                    metricCaption={c.metricCaption}
                    quote={c.quote}
                    role={c.role}
                  />
                </FadeInView>
              ))}
            </div>
          </div>
        </section>

        {/* ── 화면7: FAQ ── */}
        {/* 다른 섹션과 동일한 1080 컬럼에 좌측 정렬해 세로 레이아웃을 맞춘다.
            (heading 은 좌측 끝, FAQ 목록은 가독성 위해 760으로 제한하되 좌측 정렬) */}
        <section id="faq" className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>자주 묻는 질문</SectionHeading>
            <div className="w-full max-w-[760px]">
              <FaqList items={PG_FAQ_ITEMS} />
            </div>
          </div>
        </section>

        {/* ── 화면8: 최종 CTA ── */}
        <section className="py-[var(--s-11)] px-8 bg-[var(--md-sys-color-on-surface)] scroll-mt-[var(--shell-topbar)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">
            <FadeInView>
              <div className="flex flex-col gap-[var(--s-3)]">
                <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                  — 파트너 제휴
                </span>
                <h2 className="text-[clamp(24px,4vw,52px)] leading-[1.12] tracking-[-0.024em] font-medium text-[var(--md-sys-color-surface)] text-balance break-keep">
                  확실한 니즈가 있는 고객사를 먼저 만나세요
                </h2>
                <p className={`max-w-[680px] ${LANDING_TYPE.lead} text-[color-mix(in_srgb,var(--md-sys-color-surface)_72%,transparent)]`}>
                  서포트비는 성장 고객사의 PG 비교 요청을 검증된 RFP로 정리해 파트너 PG사에게
                  제공합니다. 새로운 가맹점 영업 기회를 더 빠르게 만나보세요.
                </p>
              </div>
            </FadeInView>
            <FadeInView delay={0.15}>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--s-3)]">
                <ConsultButton href="/signup/pg" variant="on-dark">
                  파트너로 시작하기 →
                </ConsultButton>
                <ConsultButton href="/login" variant="ghost">
                  로그인
                </ConsultButton>
              </div>
            </FadeInView>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
