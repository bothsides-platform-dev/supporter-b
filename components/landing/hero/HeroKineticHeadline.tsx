'use client';

import { Fragment, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { SupportBWordmark } from '@/components/primitives/Logo';
import { EASE_OUT } from '@/lib/landing/ease';
import { WordMaskRoll, type RollingPhrase } from './WordMaskRoll';

const TYPING_VALUES = [
  ['PG사마다 같은 설명을', '반복하기 번거로울 때.'],
  ['받은 견적이 회사에 유리한지', '판단이 어려울 때.'],
  ['우리 서비스가 PG사에', '가입이 될지 막막할 때.'],
  ['결제 오픈 전까지 무엇부터', '준비할지 고민될 때.'],
];

// 헤드라인용 서포트B 워드마크. 파티클까지 같은 단어로 묶어
// "서포트B를/로"가 줄바꿈 없이 한 덩어리로 읽히게 한다.
export function BrandWordB({ particle }: { particle: string }) {
  return <SupportBWordmark particle={particle} colorVar="--md-sys-color-inverse-on-surface" />;
}

const LINE1_WORDS: ReactNode[] = [<BrandWordB key="support-b" particle="를" />];

const headlineCls =
  'text-[clamp(30px,5.5vw,72px)] max-md:text-[clamp(22px,7.2vw,34px)] leading-[1.06] tracking-[-0.028em] font-medium break-keep';

// 단어별 마스크 리빌 — overflow-hidden 마스크 안에서 글자가 아래에서 솟아오른다(키네틱 타이포).
// 마스크에 살짝 세로 여유(pb/-mb)를 줘 정착 후 글리프가 잘리지 않게 한다.
function MaskedWord({ word, delay }: { word: ReactNode; delay: number }) {
  return (
    <span className="inline-block overflow-hidden align-top pb-[0.08em] -mb-[0.08em]">
      <motion.span
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        className="inline-block will-change-transform"
      >
        {word}
      </motion.span>
    </span>
  );
}

// 강조 문구는 독립된 줄에서 리빌한다. 모든 후보의 높이는 WordMaskRoll이 예약한다.
// className은 리빌 마스크(overflow-hidden) 박스 자체의 너비를 바꾼다 — WordMaskRoll의
// max-w-full은 이 박스의 100%로 해석되므로, 여기서 넓히면 내부도 함께 넓어진다.
function MaskedLine({
  children,
  delay,
  className,
}: {
  children: ReactNode;
  delay: number;
  className?: string;
}) {
  return (
    <span className={`block overflow-hidden pb-[0.08em] -mb-[0.08em] ${className ?? ''}`}>
      <motion.span
        initial={{ y: '112%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay, ease: EASE_OUT }}
        className="block will-change-transform"
      >
        {children}
      </motion.span>
    </span>
  );
}

// 데스크톱에서 롤링 줄만 HeroPinnedScene의 1080px 칼럼을 넘어 뷰포트 오른쪽 32px
// 여백까지 늘어난다 — 칼럼 좌측 패딩(32px, 칼럼이 뷰포트보다 넓을 때는 중앙 정렬 여백)을
// 그대로 시작점으로 두고, 거기서 뷰포트 끝까지 뺀 나머지 폭을 그대로 쓴다.
//
// 활성 breakpoint는 md(768px)가 아니라 1920px — 네 후보 문구는 폭이 서로 달라서(이 폰트
// 크기에서 2줄 합산 ~1232~1276px) 뷰포트를 매끈하게 늘리면 더 좁은 문구만 먼저 한 줄로
// 붙고 가장 넓은 문구는 여전히 두 줄로 남는 "혼재 구간"(실측 약 1512~1600px, 흔한 노트북
// 해상도와 겹친다)이 생긴다. 그래서 램프가 아니라 계단형이다: 1920px 미만에서는 이 클래스가
// 전혀 적용되지 않아 기존 1080px 칼럼 폭(최대 1016px)을 그대로 쓰고, 그 폭은 가장 좁은
// 문구가 필요로 하는 ~1232px보다도 작아 네 문구 모두 항상 2줄이다. 1920px부터는 위 calc가
// 최소 1436px(= 1920/2+476)를 주는데, 이는 가장 넓은 문구가 필요로 하는 ~1276px보다 충분히
// 넓어 네 문구 모두 항상 1줄이 된다 — 혼재 구간을 건너뛴다. 문구를 바꿀 때는 이 폭 가정도
// 다시 확인한다.
const ROLLING_LINE_WIDTH_CLS =
  'min-[1920px]:w-[calc(100vw_-_max(2rem,_(100vw_-_1080px)/2_+_2rem)_-_2rem)]';

// 다크 오프닝 씬 위의 헤드라인 — 색은 inverse-* 토큰(라이트 테마에서 near-black 위 라이트 텍스트,
// 다크 테마에서는 반전)으로 해석돼 파이널 CTA 인버티드 섹션과 같은 규칙을 따른다.
// 구매사 카피를 기본값으로 두고 PG는 자기 문구를 주입한다. 롤링 위치는 DOM 읽기 순서와 일치한다.
export function HeroKineticHeadline({
  line1Words = LINE1_WORDS,
  phrases = TYPING_VALUES,
  suffix = '찾아주세요.',
  rollingPosition = 'after',
}: {
  line1Words?: ReactNode[];
  phrases?: RollingPhrase[];
  suffix?: string;
  rollingPosition?: 'before' | 'after';
} = {}) {
  const rollingLine = (
    <MaskedLine
      delay={rollingPosition === 'before' ? 0.08 : 0.32}
      className={ROLLING_LINE_WIDTH_CLS}
    >
      <WordMaskRoll phrases={phrases} className="text-[var(--md-sys-color-inverse-primary)]" />
    </MaskedLine>
  );
  return (
    <h1
      className={`${headlineCls} flex flex-col gap-[0.12em] text-[var(--md-sys-color-inverse-on-surface)]`}
    >
      {rollingPosition === 'before' ? <>{rollingLine}{' '}</> : null}
      <span className="block">
        {line1Words.map((word, i) => (
          <Fragment key={i}>
            <MaskedWord word={word} delay={0.08 + i * 0.07} />
            {i < line1Words.length - 1 ? ' ' : null}
          </Fragment>
        ))}{' '}
        <MaskedWord word={suffix} delay={0.08 + line1Words.length * 0.07} />
      </span>{' '}
      {rollingPosition === 'after' ? rollingLine : null}
    </h1>
  );
}
