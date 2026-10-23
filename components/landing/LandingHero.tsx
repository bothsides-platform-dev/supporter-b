import { QuoteStartLink } from '@/components/landing/QuoteStartLink';
import { ConsultButton } from '@/components/landing/ConsultButton';
import type { ReactNode } from 'react';
import { MessageCircle } from 'lucide-react';
import { Footer } from '@/components/shell/Footer';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { SavingsCalculator } from '@/components/landing/SavingsCalculator';
import { FaqList } from '@/components/landing/FaqList';
import { ScrollDrivenProblem } from '@/components/landing/scroll-pinned/ScrollDrivenProblem';
import { ScrollDrivenSolution } from '@/components/landing/scroll-pinned/ScrollDrivenSolution';
import { DemoAppShell } from '@/components/landing/demo-app/DemoAppShell';
import { MetricCard } from '@/components/landing/MetricCard';
import { LandingHeroSection } from '@/components/landing/LandingHeroSection';
import { LandingPartnerMarquee } from '@/components/landing/LandingPartnerMarquee';
import { FadeInView } from '@/components/landing/FadeInView';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { SOLUTION_SCENES } from './solution-scenes';
import { HERO_METRICS } from '@/components/landing/hero-metrics';

const PROBLEM_ITEMS = [
  {
    num: '01',
    title: '우리 매출이면, 수수료는 얼마일까요?',
    desc: '우리 매출에 맞는 수수료가 얼마인지, 계약 직전까지 확신하기 어려워요.',
  },
  {
    num: '02',
    title: '받은 견적이 좋은 조건인지 어떻게 알죠?',
    desc: '받은 조건이 우리 회사에 맞는지, 더 협의할 여지는 없는지 판단하기 어려워요.',
  },
  {
    num: '03',
    title: '준비를 마쳤는데, 가입이 안 되면요?',
    desc: 'PG사와 카드사 심사가 끝나기 전에는 실제로 도입할 수 있을지 알기 어려워요.',
  },
  {
    num: '04',
    title: '정산주기와 보증보험도 협의할 수 있나요?',
    desc: '정산주기부터 보증보험, 가입비까지. 중요한 조건을 충분히 협의하지 못한 채 계약하기도 해요.',
  },
];

const sectionCls =
  'py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)] scroll-mt-[var(--landing-header-height)]';
const containerCls = 'mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]';

export function LandingHero({ nav }: { nav?: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--md-sys-color-surface)] flex flex-col [--landing-header-height:68px] [--landing-header-top:0px]">

      {/* ── Nav — 히어로 다크 씬 위에서는 솔리드 다크+라이트 톤(over-dark), 리빌 후 surface 복귀 ── */}
      <LandingHeader>{nav}</LandingHeader>

      <main className="flex-1 pt-[var(--landing-header-height)]">

        {/* ── Hero (client: 타이핑·애니메이션·landing-scroll 이펙트) ── */}
        <LandingHeroSection partners={<LandingPartnerMarquee />} />

        {/* ── Problem: 세로 질문을 읽으며 현재 위치 강조 ── */}
        <section className={sectionCls}>
          <ScrollDrivenProblem
            heading={
              <SectionHeading>
                PG 계약,<br />이런 고민 있었나요?
              </SectionHeading>
            }
            items={PROBLEM_ITEMS}
            presentation="focus"
          />
        </section>

        {/* ── Solution (pin: 스크롤 구동 강조, 타이머 없음) ── */}
        <section id="service" aria-label="서비스 소개" className="px-5 lg:px-8 border-b border-[var(--md-sys-color-outline-variant)] scroll-mt-[var(--landing-header-height)]">
          <ScrollDrivenSolution scenes={SOLUTION_SCENES} />
        </section>

        {/* ── Process: 실제 대시보드를 그대로 체험하는 임베디드 데모 ── */}
        <section id="process" className={sectionCls}>
          <div className={containerCls}>
            <div className="flex flex-col gap-[var(--s-4)]">
              <SectionHeading>실제 화면을 미리 둘러보세요</SectionHeading>
              <p className="text-sm leading-[1.68] text-[var(--md-sys-color-on-surface-variant)]">
                회원가입 없이 서포트비 실제 화면을 그대로 체험할 수 있어요. 아래 단계를 눌러 직접 둘러보세요.
              </p>
            </div>
            <DemoAppShell />
          </div>
        </section>

        {/* ── Metrics ── */}
        <section className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>
              서포트비를 통해 협상 비용을 절감하고<br />사업의 본질에 집중하세요.
            </SectionHeading>
            <div className="flex flex-col gap-[var(--s-4)]">
              <div className="grid grid-cols-1 md:grid-cols-3 border-y border-[var(--md-sys-color-outline-variant)] divide-y md:divide-y-0 md:divide-x divide-[var(--md-sys-color-outline-variant)]">
                {HERO_METRICS.map((m) => (
                  <MetricCard
                    key={m.caption}
                    label={m.label}
                    to={m.to}
                    decimals={m.decimals}
                    unit={m.unit}
                    qualifier={m.qualifier}
                    caption={m.caption}
                  />
                ))}
              </div>
              <p className="text-[13px] leading-[1.5] text-[var(--md-sys-color-on-surface-variant)]">
                업종과 거래 규모에 따라 결과는 달라질 수 있어요.
              </p>
            </div>
          </div>
        </section>

        {/* 제휴 PG사는 히어로 하단에 표시한다. 고객 레퍼런스는 자료 확보 전까지 미노출. */}

        {/* ── Pricing ── */}
        <section id="pricing" className={sectionCls}>
          <div className={`${containerCls} gap-[var(--s-6)]`}>
            <SectionHeading>이용 요금</SectionHeading>
            <FadeInView>
              <div className="flex flex-col gap-[var(--s-4)]">
                <p className="text-[clamp(18px,2.2vw,24px)] leading-[1.5] tracking-[-0.012em] text-[var(--md-sys-color-on-surface)]">
                  서포트비는 현재(2026년) 무료로 이용 가능합니다.
                </p>
                <p className="text-sm leading-[1.68] text-[var(--md-sys-color-on-surface-variant)]">
                  현재 유료화 계획이 없으며, 유료화 전환시 한분기 전에 공유드릴 예정입니다.
                </p>
              </div>
            </FadeInView>
          </div>
        </section>

        {/* ── Calculator ── */}
        <section id="calculator" className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>PG 수수료, 얼마나 아낄 수 있을까요?</SectionHeading>
            <SavingsCalculator />
          </div>
        </section>

        {/* ── FAQ ── */}
        {/* 다른 섹션과 동일한 1080 컬럼에 좌측 정렬해 세로 레이아웃을 맞춘다.
            (heading 은 좌측 끝, FAQ 목록은 가독성 위해 760으로 제한하되 좌측 정렬) */}
        <section id="faq" className={sectionCls}>
          <div className={containerCls}>
            <SectionHeading>자주 묻는 질문</SectionHeading>
            <div className="w-full max-w-[760px]">
              <FaqList />
            </div>
          </div>
        </section>

        {/* ── Chat consultation ── */}
        <section id="consultation" aria-labelledby="consultation-heading" className={sectionCls}>
          <div className={containerCls}>
            <FadeInView>
              <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
                <h2 id="consultation-heading" className="text-[clamp(28px,3.5vw,44px)] font-medium leading-[1.3] tracking-[-0.025em] text-[var(--md-sys-color-on-surface)] break-keep">
                  PG 수수료 협의나 가입 심사가 막막한가요?
                </h2>
                <ConsultButton className="h-12 w-full shrink-0 gap-2.5 px-6 font-sans text-base font-medium tracking-[-0.01em] normal-case sm:w-auto">
                  <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.5} />
                  채팅으로 문의해요
                </ConsultButton>
              </div>
            </FadeInView>
          </div>
        </section>

        {/* ── Final CTA / 도입문의 ── */}
        <section id="contact" className="py-[var(--s-11)] px-8 bg-[var(--md-sys-color-on-surface)] scroll-mt-[var(--landing-header-height)]">
          <div className="mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-8)]">
            <FadeInView>
              <div className="flex flex-col gap-[var(--s-3)]">
                {/* 이 섹션은 배경이 `on-surface`(어두움)라 반전면이다 — 아래 h2 가
                    `surface` 를 쓰는 것과 같은 이유로 여기도 반전 토큰을 쓴다.
                    `on-surface-variant` 는 이 배경 위에서 2.74:1 로 AA 미달이다.
                    (색 클로버가 살아 있던 동안에는 이 글자가 배경색으로 상속돼
                    아예 보이지 않았고, 그래서 대비 문제가 드러나지 않았다.) */}
                <span className="font-mono text-sm leading-[inherit] tracking-[0.18em] uppercase text-[var(--md-sys-color-inverse-on-surface)]">
                  — 도입문의
                </span>
                <h2 className="text-[clamp(24px,4vw,52px)] leading-[1.12] tracking-[-0.024em] font-medium text-[var(--md-sys-color-surface)] text-balance break-keep">
                  지금 바로 불필요한 비용은 줄이고,<br />사업의 본질에 집중하세요.
                </h2>
              </div>
            </FadeInView>
            <FadeInView delay={0.2}>
              <div className="flex flex-col items-start gap-[var(--s-5)]">
                <QuoteStartLink>
                  <button className="inline-flex items-center gap-2 h-12 px-6 rounded-md bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] font-mono text-[13px] tracking-[0.06em] uppercase transition-opacity duration-[140ms] hover:opacity-85 active:scale-[0.98]">
                    PG견적 무료로 받기 →
                  </button>
                </QuoteStartLink>
              </div>
            </FadeInView>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
