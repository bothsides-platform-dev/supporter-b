import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BRAND_MARK_PATH } from '@/lib/brand/brand-mark-path'
import { AnimatedBrandMark } from '@/components/primitives/AnimatedBrandMark'

type LogoVariant = 'default' | 'compact'

type LogoProps = {
  variant?: LogoVariant
  className?: string
  href?: string
  /** true면 마운트 시 1회 draw-on 애니메이션 마크(AnimatedBrandMark)를 쓴다 — 랜딩 헤더 전용 옵트인. */
  animated?: boolean
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
      <span className="font-sans font-black leading-none tracking-[-0.04em]">서포트비</span>
      {particle ? <span>{particle}</span> : null}
    </span>
  )
}

export function Logo({ variant = 'default', className, href, animated }: LogoProps) {
  const Mark = animated ? AnimatedBrandMark : BrandMark

  if (variant === 'compact') {
    return (
      <Link
        href={href ?? '/home'}
        aria-label="서포트비 홈"
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
      aria-label="서포트비 홈"
      className={cn(
        'group inline-flex items-baseline gap-3',
        'opacity-100 hover:opacity-70 transition-opacity duration-[140ms]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-on-surface)]',
        'rounded-md',
        className,
      )}
    >
      {/* baseline 정렬 + 잉크 매칭 — 22px Pretendard black 한글 잉크는 baseline 위 ~18px·아래 ~2px(총 ~20px).
          SVG는 bottom이 baseline에 앉으므로 size=20 + 2px 하강으로 잉크 상·하단을 글자와 일치시킨다(실측 보정). */}
      <Mark size={20} className="translate-y-[2px]" />
      <SupportBWordmark className="text-[22px]" />
    </Link>
  )
}
