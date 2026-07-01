import Image from 'next/image';
import { Footer } from '@/components/shell/Footer';
import { siteConfig } from '@/lib/site-config';
import { PgLandingHeaderNav } from '@/components/landing/PgLandingHeaderNav';
import { PgHeroSection } from '@/components/landing/PgHeroSection';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { FadeInView } from '@/components/landing/FadeInView';
import { ScrollDrivenProblem } from '@/components/landing/scroll-pinned/ScrollDrivenProblem';
import { PgCustomerCarousel } from '@/components/landing/PgCustomerCarousel';
import { PgCaseCard } from '@/components/landing/PgCaseCard';
import { LANDING_TYPE } from '@/components/landing/landing-type';
import { PgProcessSteps } from '@/components/landing/PgProcessSteps';
import { PgScrollDemo } from '@/components/landing/scroll-pinned/PgScrollDemo';
import { FaqList } from '@/components/landing/FaqList';
import { ConsultButton } from '@/components/landing/ConsultButton';
import { PG_FAQ_ITEMS } from '@/components/landing/pg-faq-data';

// ── 화면2: PG 영업 문제 제기 (4 카드) ──
const PROBLEM_ITEMS = [
  {
    num: '01',
    title: '관심은 있지만 움직이지 않는 고객사',
    desc: '견적은 요청하지만 당장 변경 의사가 없는 고객사에 반복적으로 시간을 씁니다.',
  },
  {
    num: '02',
    title: '조건 확인부터 다시 시작하는 영업',
    desc: '월 거래액, 업종, 현재 수수료율, 정산주기, 보증금 정보를 매번 새로 확인해야 합니다.',
  },
  {
    num: '03',
    title: '수수료율만 남는 협상',
    desc: 'PG사의 정산 안정성, 심사 역량, 운영지원 강점이 충분히 전달되지 못합니다.',
  },
  {
    num: '04',
    title: '낮은 전환율의 반복 미팅',
    desc: '실제 니즈가 불명확한 리드에 제안서와 미팅 리소스가 소모됩니다.',
  },
];

// ── 화면3: 신규 성장 고객사 인바운드 (4 캐러셀 카드) ──
const CUSTOMER_TYPES = [
  {
    title: 'PG 변경을 검토하는 기존 가맹점',
    desc: '현재 조건에 아쉬움이 있거나 거래 규모 증가로 더 나은 조건을 찾는 고객사를 만납니다.',
  },
  {
    title: '신규 PG 도입을 준비하는 성장 기업',
    desc: '결제 시스템을 처음 도입하거나 확장하려는 고객사의 초기 검토 단계에 참여합니다.',
  },
  {
    title: '조건 개선 니즈가 명확한 고객사',
    desc: '수수료율뿐 아니라 정산주기, 보증금, 셋업비, 운영지원까지 비교하려는 고객사를 만납니다.',
  },
  {
    title: '복수 PG 조건을 비교하는 구매 의사 보유 고객사',
    desc: '이미 비교 의사가 있는 고객사의 요청에 맞춰 제안할 수 있습니다.',
  },
];

// ── 화면4: 검증된 리드 / 동일한 기회 (3 메시지) ──
const VERIFIED_POINTS = [
  {
    index: '01',
    title: '확실한 니즈',
    img: '/landing/pg/need.webp',
    alt: '고객사가 PG 조건 비교 요청서를 직접 제출하는 모습',
    desc: '고객사가 직접 PG 조건 비교 요청을 제출합니다. 단순 문의가 아니라, 실제 조건 검토 의사가 있는 고객사를 대상으로 합니다.',
  },
  {
    index: '02',
    title: '정리된 정보',
    img: '/landing/pg/info.webp',
    alt: '거래액·업종·정산주기 등 제안 정보가 정리된 RFP',
    desc: '월 거래액, 업종, 현재 PG 조건, 희망 정산주기, 보증금 조건 등 제안에 필요한 정보를 RFP로 확인합니다.',
  },
  {
    index: '03',
    title: '동일한 기회',
    img: '/landing/pg/equal.webp',
    alt: '여러 PG사에게 동일한 기준으로 주어지는 제안 기회',
    desc: '조건에 맞는 파트너 PG사에게 동일한 기준의 제안 기회를 제공합니다. 고객사는 제출된 조건을 표준화된 방식으로 비교합니다.',
  },
];

// ── 화면5: 참여 프로세스 (5단계) ──
const PROCESS_STEPS = [
  {
    n: '01',
    title: '파트너 등록',
    body: '담당자 정보, 취급 업종, 선호 거래 규모, 심사 가능 범위 등을 등록합니다.',
    note: '초기 등록 이후 조건에 맞는 RFP를 선별해 받을 수 있습니다.',
  },
  {
    n: '02',
    title: 'RFP 수신',
    body: 'PG 조건 비교 니즈가 있는 고객사의 RFP를 확인합니다.',
    note: '업종, 거래 규모, 현재 조건, 희망 조건이 정리된 상태로 제공됩니다.',
  },
  {
    n: '03',
    title: '제안 제출',
    body: '수수료율, 정산주기, 보증금, 셋업비, 운영지원 조건을 표준 포맷에 맞춰 제출합니다.',
    note: '반복적인 제안서 작성 부담을 줄일 수 있습니다.',
  },
  {
    n: '04',
    title: '고객사 검토',
    body: '고객사는 여러 PG사의 조건을 동일한 기준으로 비교합니다.',
    note: '수수료뿐 아니라 정산 안정성, 심사 속도, 운영지원도 함께 평가됩니다.',
  },
  {
    n: '05',
    title: '계약 논의',
    body: '고객사가 선택한 PG사와 최종 계약 조건을 직접 논의합니다.',
    note: 'Supporter B는 비교와 연결 과정을 지원합니다.',
  },
];

// ── 화면6: 파트너사 영업 성과 사례 (3 카드) ──
const CASES: { metric: string; metricCaption: string; quote: string; role: string }[] = [
  {
    metric: '300%',
    metricCaption: '리드 검증·획득 단가 절감',
    quote:
      '신규 PG 도입을 검토하는 고객사 리드를 거래액·업종·조건까지 검증해 제공받아, 좋은 리드를 확보할 수 있었습니다. 덕분에 신규 영업 리드에 대한 고민을 덜었습니다.',
    role: 'K사 영업 팀장',
  },
  {
    metric: '150%',
    metricCaption: '제안 효율 개선·제안 리소스 절감',
    quote:
      '표준화된 요청 정보에 맞춰 고객사가 필요한 조건을 빠르게 제안할 수 있었습니다. 실제 도입 의사가 확실한 고객사에 집중하니 영업 리소스를 효율적으로 쓸 수 있었습니다.',
    role: 'K사 영업 대리',
  },
  {
    metric: '200%',
    metricCaption: '중소형 PG사 신규 영업 기회 확대',
    quote:
      '메이저 PG사만 얻던 영업 기회를 중소형 PG사인 저희도 얻을 수 있었어요. 덕분에 상반기에 부족했던 영업 리커버리 보충 계획을 채울 수 있었습니다.',
    role: 'S사 영업 본부장',
  },
];

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/icon.svg`,
  description: 'PG 영업담당자를 위한 신규 가맹점 인바운드 채널',
};

const faqPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: PG_FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

const sectionCls =
  'py-[var(--s-11)] px-8 border-b border-[var(--md-sys-color-outline-variant)] scroll-mt-[var(--shell-topbar)]';
const containerCls = 'mx-auto w-full max-w-[1080px] flex flex-col gap-[var(--s-9)]';
const subCls = `max-w-[760px] ${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface-variant)]`;

export function PgLanding() {
  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd) }}
      />

      {/* ── Nav ── */}
      <header className="fixed top-0 left-0 right-0 z-10 px-8 h-[var(--shell-topbar)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
        <PgLandingHeaderNav />
      </header>

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

        {/* ── 화면3: 신규 성장 고객사 인바운드 ── */}
        <section id="inbound" className={sectionCls}>
          <div className={containerCls}>
            <FadeInView>
              <p className="text-[clamp(20px,3vw,32px)] leading-[1.32] tracking-[-0.018em] font-medium text-[var(--md-sys-color-on-surface)]">
                콜드콜보다 빠르게.
                <br />
                광고 리드보다 정확하게.
                <br />
                <span className="text-[var(--md-sys-color-primary)]">
                  이미 PG 조건을 비교 중인 고객사에게 먼저 닿으세요.
                </span>
              </p>
            </FadeInView>
            <div className="flex flex-col gap-[var(--s-5)]">
              <SectionHeading>새로운 성장 고객사가 PG사를 찾아오게 만듭니다</SectionHeading>
              <FadeInView>
                <p className={subCls}>
                  수수료율·정산주기·보증금·운영 조건을 비교하려는 고객사가 Supporter B에 견적을
                  올립니다. 파트너 PG사는 먼저 연락하지 않아도, 조건에 맞는 요청을 인바운드로 받아
                  새로운 영업 기회를 확보합니다.
                </p>
              </FadeInView>
            </div>
            <FadeInView>
              <Image
                src="/landing/pg/inbound.webp"
                alt="PG 조건을 검토하는 고객사들"
                width={960}
                height={540}
                sizes="(max-width: 768px) 100vw, 560px"
                className="mx-auto w-full max-w-[560px] h-auto"
              />
            </FadeInView>
            <FadeInView>
              <PgCustomerCarousel items={CUSTOMER_TYPES} />
            </FadeInView>
            <FadeInView>
              <p className={`${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface)]`}>
                Supporter B는 “PG 조건을 비교하고 싶다”는 분명한 신호가 있는 고객사만 골라
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
            <div className="flex flex-col gap-[var(--s-10)]">
              {VERIFIED_POINTS.map((p, i) => (
                <FadeInView key={p.index}>
                  <div className="grid items-center gap-[var(--s-6)] md:grid-cols-2 md:gap-[var(--s-9)]">
                    <Image
                      src={p.img}
                      alt={p.alt}
                      width={960}
                      height={720}
                      sizes="(max-width: 768px) 100vw, 480px"
                      className={`w-full max-w-[480px] h-auto ${i % 2 ? 'md:order-2' : ''}`}
                    />
                    <div className={`flex flex-col gap-[var(--s-3)] ${i % 2 ? 'md:order-1' : ''}`}>
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
            <PgScrollDemo />
            <FadeInView>
              <PgProcessSteps steps={PROCESS_STEPS} />
            </FadeInView>
            <FadeInView>
              <div>
                <ConsultButton>파트너 상담 신청하기 →</ConsultButton>
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
                  Supporter B는 성장 고객사의 PG 비교 요청을 검증된 RFP로 정리해 파트너 PG사에게
                  제공합니다. 새로운 가맹점 영업 기회를 더 빠르게 만나보세요.
                </p>
              </div>
            </FadeInView>
            <FadeInView delay={0.15}>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--s-3)]">
                <ConsultButton variant="on-dark">파트너 상담 신청 →</ConsultButton>
                <ConsultButton variant="ghost">제휴 소개서 받기</ConsultButton>
              </div>
            </FadeInView>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
