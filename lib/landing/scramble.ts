// 히어로 헤드라인 순환 문구 전환 이펙트의 순수 코어 — DOM 없이 슬롯 스케줄·글리프 팔레트만
// 다룬다. 렌더링·rAF 구동은 components/landing/hero/ScrambleText.tsx 가 소유한다.
//
// 결정성: 무작위성(스태거 정착 시점·스크램블 글리프)은 모두 주입 가능한 rng를 통해서만
// 나온다(호출자 기본값은 Math.random이지만 테스트는 결정적 rng를 넘긴다) — ascii-field.ts의
// "Math.random 금지" 원칙과 달리 이 모듈은 프레임마다 새로운 글리프가 '떨리는' 느낌이 목적이라
// 상태 없는 순수 해시 대신 rng 주입을 쓴다.

/** 스크램블 중 보여줄 글리프 팔레트 — 배경 ASCII 필드(· : + * # ₩ %)를 포함해 시각적으로
 * 통일하고, 해킹/디코드 느낌을 더하는 넓은 기호를 더한다. */
export const SCRAMBLE_CHARS = '·:+*#₩%!<>-_\\/[]{}=^?$&@~' as const;

/** 코드포인트 단위 분해 — 한글 문구를 안전하게 슬롯화한다(JS string.slice는 서러게이트 페어에서
 * 깨질 수 있으나 한글 음절은 BMP 안이라 문제 없다; 그래도 Array.from으로 명시한다). */
export function splitGraphemes(s: string): string[] {
  return Array.from(s);
}

/** 전역 진행(0→1) 중 이 슬롯이 스크램블에서 정착으로 전환되는 시점 범위. 슬롯마다 다르게
 * 뽑혀 "한 글자씩 자리를 찾아가는" 스태거를 만든다. */
const SETTLE_START = 0.55;
const SETTLE_SPAN = 0.45;

/** 스크램블 중 최소 투명도·스케일 — 정착에 가까워질수록 1로 수렴한다("작아지고 흐릿한 조각이
 * 모여 글자가 된다"는 조립감). */
const SCRAMBLE_OPACITY_MIN = 0.4;
const SCRAMBLE_SCALE_MIN = 0.72;

export interface SlotSchedule {
  /** 전환 전 글자(짧은 문구로 전환 시 빈 문자열일 수 있음). */
  from: string;
  /** 전환 후(정착) 글자. */
  to: string;
  /** 이 슬롯이 정착하는 전역 진행 시점 [SETTLE_START, SETTLE_START+SETTLE_SPAN). */
  end: number;
}

export interface SlotVisual {
  /** 이번 프레임에 그릴 문자. */
  char: string;
  /** 스크램블 중이면 true, 정착했으면 false. */
  active: boolean;
  opacity: number;
  scale: number;
}

/**
 * 두 문구 사이의 슬롯별 전환 스케줄을 만든다. 슬롯 수는 두 문구 중 더 긴 쪽 길이 —
 * 짧은 문구로 줄어들 때는 남는 슬롯이 빈 문자열로 정착해 자연히 사라진다.
 */
export function buildTransition(
  from: string,
  to: string,
  rng: () => number = Math.random,
): SlotSchedule[] {
  const fromChars = splitGraphemes(from);
  const toChars = splitGraphemes(to);
  const len = Math.max(fromChars.length, toChars.length);
  const schedules: SlotSchedule[] = [];
  for (let i = 0; i < len; i++) {
    schedules.push({
      from: fromChars[i] ?? '',
      to: toChars[i] ?? '',
      end: SETTLE_START + rng() * SETTLE_SPAN,
    });
  }
  return schedules;
}

/**
 * 전역 진행(progress, 0→1)에서 한 슬롯의 시각 상태를 계산한다. `progress >= schedule.end`가
 * 되는 즉시 정착(`to`, opacity/scale=1, active=false)하고, 그 전에는 `glyph`(스크램블 글리프)를
 * 보여주며 슬롯 자신의 로컬 진행(0→end 구간)에 따라 opacity/scale이 서서히 1로 수렴한다.
 */
export function slotState(schedule: SlotSchedule, progress: number, glyph: string): SlotVisual {
  if (progress >= schedule.end) {
    return { char: schedule.to, active: false, opacity: 1, scale: 1 };
  }
  const local = schedule.end <= 0 ? 1 : Math.min(1, Math.max(0, progress / schedule.end));
  return {
    char: glyph,
    active: true,
    opacity: SCRAMBLE_OPACITY_MIN + (1 - SCRAMBLE_OPACITY_MIN) * local,
    scale: SCRAMBLE_SCALE_MIN + (1 - SCRAMBLE_SCALE_MIN) * local,
  };
}

/** SCRAMBLE_CHARS에서 무작위 글리프 하나를 고른다(프레임마다 호출해 '떨리는' 느낌을 만든다). */
export function randomGlyph(rng: () => number = Math.random): string {
  const idx = Math.min(SCRAMBLE_CHARS.length - 1, Math.floor(rng() * SCRAMBLE_CHARS.length));
  return SCRAMBLE_CHARS[idx];
}
