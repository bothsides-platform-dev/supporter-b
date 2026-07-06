import Link from 'next/link'
import { BRAND_MARK_PATH } from '@/lib/brand/brand-mark-path'
import { cn } from '@/lib/utils'
import { WORDMARK_PATHS } from './wordmark-paths.generated'

type LogoVariant = 'default' | 'compact'

type LogoProps = {
  variant?: LogoVariant
  className?: string
  href?: string
}

export function BrandMark({
  size = 20,
  className,
  colorVar = '--md-sys-color-on-surface',
  strokeWidth = 450,
}: {
  size?: number | string
  className?: string
  /** 마크 잉크 색으로 쓸 CSS 커스텀 프로퍼티 이름(-- 접두 포함). 다크 씬 등 inverse 토큰 컨텍스트에서 오버라이드. */
  colorVar?: string
  /** path-space 단위 stroke 굵기 — 기본값은 Logo/SidebarBrand의 font-black 워드마크와 짝을 맞춘 값.
      본문 텍스트(예: font-medium 헤드라인) 옆에 쓸 때는 더 낮은 값으로 오버라이드해 무게감을 맞춘다. */
  strokeWidth?: number
}) {
  const color = `var(${colorVar})`
  return (
    <svg
      viewBox="334 294 636 636"
      width={size}
      height={size}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g transform="translate(0 1254) scale(0.1 -0.1)" fill={color}>
        {/* stroke = 은은한 볼드 처리 — 채움 실루엣 위에 같은 색 stroke를 덧씌워 윤곽만 균일하게 두껍힘.
            linejoin=miter — round을 쓰면 stem의 직각 모서리가 다시 둥글게 뭉개진다. */}
        <path
          d={BRAND_MARK_PATH}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="miter"
          strokeLinecap="butt"
        />
      </g>
    </svg>
  )
}

/* "서포트 B" 워드마크 벡터 패스 — components/primitives/wordmark-paths.generated.ts(코드젠 산출물,
   `pnpm brand:wordmark`) SSOT. 좌표계가 Pretendard 폰트 단위(unitsPerEm)를 그대로 쓰므로, svg를
   폰트와 동일한 em 스케일(unitsPerEm = 1em)로 그리면 주변 실제 텍스트와 크기·베이스라인이
   자동으로 맞는다 — vertical-align을 descent 비율만큼 내려 베이스라인을 정렬한다. */
export const WORDMARK_VIEWBOX = `0 ${-WORDMARK_PATHS.ascent} ${WORDMARK_PATHS.totalWidth} ${WORDMARK_PATHS.ascent - WORDMARK_PATHS.descent}`
export const WORDMARK_WIDTH_EM = WORDMARK_PATHS.totalWidth / WORDMARK_PATHS.unitsPerEm
export const WORDMARK_HEIGHT_EM = (WORDMARK_PATHS.ascent - WORDMARK_PATHS.descent) / WORDMARK_PATHS.unitsPerEm
export const WORDMARK_VALIGN_EM = WORDMARK_PATHS.descent / WORDMARK_PATHS.unitsPerEm

export function SupportBWordmark({
  particle = '',
  className,
  colorVar = '--md-sys-color-on-surface',
}: {
  particle?: string
  className?: string
  colorVar?: string
}) {
  return (
    <span className={cn('inline-flex items-baseline whitespace-nowrap', className)}>
      <span className="sr-only">서포트 B</span>
      <svg
        aria-hidden="true"
        viewBox={WORDMARK_VIEWBOX}
        style={{
          width: `${WORDMARK_WIDTH_EM}em`,
          height: `${WORDMARK_HEIGHT_EM}em`,
          verticalAlign: `${WORDMARK_VALIGN_EM}em`,
        }}
        fill={`var(${colorVar})`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {WORDMARK_PATHS.glyphs.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
      {particle ? <span style={{ color: `var(${colorVar})` }}>{particle}</span> : null}
    </span>
  )
}

export function Logo({ variant = 'default', className, href }: LogoProps) {
  if (variant === 'compact') {
    return (
      <Link
        href={href ?? '/home'}
        aria-label="서포트 B 홈"
        className={cn(
          'group flex items-center justify-center',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-surface)]',
          'rounded-md',
          className,
        )}
      >
        <BrandMark
          size={22}
          className="opacity-[0.82] group-hover:opacity-100 transition-opacity duration-[140ms]"
        />
      </Link>
    )
  }

  return (
    <Link
      href={href ?? '/'}
      aria-label="서포트 B 홈"
      className={cn(
        'group inline-flex items-center',
        'opacity-100 hover:opacity-70 transition-opacity duration-[140ms]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-on-surface)]',
        'rounded-md',
        className,
      )}
    >
      {/* 워드마크 자체가 마지막 글자 자리에 브랜드 마크를 품고 있어(SupportBWordmark 참고)
          별도 아이콘을 앞에 두면 같은 B 형태가 한 줄에 두 번 반복돼 중복으로 읽힌다. */}
      <SupportBWordmark className="text-[22px]" />
    </Link>
  )
}
