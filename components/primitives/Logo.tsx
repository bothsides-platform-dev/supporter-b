import Link from 'next/link'
import { cn } from '@/lib/utils'

type LogoVariant = 'default' | 'compact'

type LogoProps = {
  variant?: LogoVariant
  className?: string
  href?: string
}

/* "B" 브랜드 마크 — support-b 원본 트레이스(potrace). 좌표계는 원본 1254px 캔버스의
   마크 bbox(정사각 패딩) 기준이라 viewBox가 크다. 색은 fill 하나로 테마 적응. */
const BRAND_MARK_PATH =
  'M3891 9585 c-158 -45 -284 -167 -331 -324 -20 -65 -20 -89 -18 -2867 l3 -2801 42 -85 c32 -65 58 -100 104 -142 108 -100 197 -131 358 -124 94 4 114 8 174 37 97 47 189 135 232 225 18 39 38 98 44 130 8 42 11 887 11 2796 0 2423 -2 2743 -15 2795 -39 151 -126 260 -261 327 -80 39 -90 41 -187 45 -70 2 -119 -2 -156 -12z M5405 9378 c-3 -7 -4 -242 -3 -523 l3 -510 1165 -5 c1155 -5 1166 -5 1227 -26 107 -37 193 -92 279 -179 146 -147 212 -326 201 -545 -10 -194 -72 -335 -207 -471 -68 -69 -102 -94 -170 -127 -165 -81 -88 -75 -1180 -82 -1099 -6 -996 2 -1131 -86 -163 -107 -248 -315 -208 -506 37 -171 149 -302 317 -370 l57 -23 1020 -5 1020 -5 80 -28 c188 -67 328 -187 409 -352 58 -115 71 -181 71 -340 -1 -124 -4 -149 -28 -220 -38 -115 -91 -199 -183 -291 -67 -68 -96 -89 -175 -127 -166 -81 -99 -77 -1412 -77 l-1164 0 -7 -37 c-3 -21 -6 -260 -6 -530 l0 -493 1264 0 c1099 0 1280 2 1388 16 772 100 1313 597 1443 1324 23 128 31 399 16 541 -52 492 -256 840 -653 1111 l-67 46 62 54 c316 274 496 591 564 988 24 141 21 403 -5 550 -133 739 -724 1255 -1522 1329 -177 17 -2459 15 -2465 -1z'

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
        {/* stroke = 은은한 볼드 처리 — 채움 실루엣 위에 같은 색 stroke를 덧씌워 윤곽만 균일하게 두껍힘 */}
        <path d={BRAND_MARK_PATH} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      </g>
    </svg>
  )
}

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
    <span
      className={cn('inline-flex items-baseline whitespace-nowrap', className)}
      style={{ color: `var(${colorVar})` }}
    >
      <span className="font-sans font-black leading-none tracking-[-0.04em]">서포트 B</span>
      {particle ? <span>{particle}</span> : null}
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
        'group inline-flex items-center gap-3',
        'opacity-100 hover:opacity-70 transition-opacity duration-[140ms]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-on-surface)]',
        'rounded-md',
        className,
      )}
    >
      <BrandMark />
      <SupportBWordmark className="text-[22px]" />
    </Link>
  )
}
