// Value: protects=every inline icon's stroke (incl. half stroke-width, round caps) stays inside its viewBox, so no icon renders with a clipped edge at any size (e.g. PaperclipIcon at 48px in the attachment EmptyState); fails_when=an icon path is edited/added so its geometry plus half stroke-width crosses the viewBox (the pre-fix PaperclipIcon arc reached y~17.15 in a 16x16 box); why_new=no test inspected icon geometry, jsdom has no SVG getBBox and clipping is invisible to DOM assertions; seam=none (renders the real exported components); no_claim=does not check visual design, optical balance, or icons outside components/icons/index.tsx.
import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Icons from '@/components/icons';

type Pt = [number, number];

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

// Bounds come from endpoints plus analytic extrema, not sampling, so a near-miss overflow can't slip between samples.
const inUnit = (t: number) => t > 0 && t < 1;

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, out: Pt[]) {
  const at = (t: number): Pt => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  out.push(at(0), at(1));
  for (const k of [0, 1]) {
    // B'(t)/3 = a t^2 + b t + c
    const a = -p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k];
    const b = 2 * (p0[k] - 2 * p1[k] + p2[k]);
    const c = p1[k] - p0[k];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12 && inUnit(-c / b)) out.push(at(-c / b));
      continue;
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    for (const s of [-1, 1]) {
      const t = (-b + s * Math.sqrt(disc)) / (2 * a);
      if (inUnit(t)) out.push(at(t));
    }
  }
}

function quad(p0: Pt, p1: Pt, p2: Pt, out: Pt[]) {
  const at = (t: number): Pt => {
    const u = 1 - t;
    return [
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ];
  };
  out.push(at(0), at(1));
  for (const k of [0, 1]) {
    const den = p0[k] - 2 * p1[k] + p2[k];
    if (Math.abs(den) > 1e-12 && inUnit((p0[k] - p1[k]) / den)) out.push(at((p0[k] - p1[k]) / den));
  }
}

// SVG spec F.6.5 endpoint -> center parameterization, then endpoints + axis extrema.
function arc(p0: Pt, rxIn: number, ryIn: number, phiDeg: number, large: number, sweep: number, p1: Pt, out: Pt[]) {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  // Spec F.6.2: a zero radius or coincident endpoints draws a line (or nothing), not an arc.
  if (rx === 0 || ry === 0 || (p0[0] === p1[0] && p0[1] === p1[1])) {
    out.push(p1);
    return;
  }
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const at = (t: number): Pt => {
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
  };
  out.push(at(t1), at(t1 + dt));
  // Angles where dx/dt = 0 and dy/dt = 0, repeated every pi.
  const bases = [Math.atan2(-ry * sin, rx * cos), Math.atan2(ry * cos, rx * sin)];
  const lo = Math.min(t1, t1 + dt);
  const hi = Math.max(t1, t1 + dt);
  for (const base of bases) {
    for (let t = base + Math.ceil((lo - base) / Math.PI) * Math.PI; t < hi; t += Math.PI) {
      if (t > lo) out.push(at(t));
    }
  }
}

function pathPoints(d: string): Pt[] {
  const out: Pt[] = [];
  const tokens = d.match(/[a-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  let cmd = '';
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastCtrl: Pt | null = null;
  let lastQ: Pt | null = null;
  const isCmd = (t: string) => /^[a-z]$/i.test(t);
  // Arc flags are always one character and may be packed ("a1.5 1.5 0 002.12 2.12"):
  // take the first character and put the remainder back as the next token.
  const num = () => Number(tokens[i++]);
  const flag = () => {
    const t = tokens[i++];
    if (!/^[01]/.test(t)) throw new Error(`invalid arc flag "${t}" in "${d}"`);
    if (t.length > 1) tokens.splice(i, 0, t.slice(1));
    return Number(t[0]);
  };
  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cur[0] : 0;
    const oy = rel ? cur[1] : 0;
    if (C === 'Z') {
      if (i < tokens.length && !isCmd(tokens[i])) throw new Error(`unexpected arguments after close-path in "${d}"`);
      cur = start;
      out.push(cur);
      lastCtrl = lastQ = null;
      continue;
    }
    if (C === 'M' || C === 'L') {
      cur = [ox + num(), oy + num()];
      if (C === 'M') {
        start = cur;
        cmd = rel ? 'l' : 'L';
      }
      out.push(cur);
      lastCtrl = lastQ = null;
    } else if (C === 'H') {
      cur = [ox + num(), cur[1]];
      out.push(cur);
      lastCtrl = lastQ = null;
    } else if (C === 'V') {
      cur = [cur[0], oy + num()];
      out.push(cur);
      lastCtrl = lastQ = null;
    } else if (C === 'C') {
      const c1: Pt = [ox + num(), oy + num()];
      const c2: Pt = [ox + num(), oy + num()];
      const e: Pt = [ox + num(), oy + num()];
      cubic(cur, c1, c2, e, out);
      lastCtrl = c2;
      lastQ = null;
      cur = e;
    } else if (C === 'S') {
      const c1: Pt = lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
      const c2: Pt = [ox + num(), oy + num()];
      const e: Pt = [ox + num(), oy + num()];
      cubic(cur, c1, c2, e, out);
      lastCtrl = c2;
      lastQ = null;
      cur = e;
    } else if (C === 'Q') {
      const c: Pt = [ox + num(), oy + num()];
      const e: Pt = [ox + num(), oy + num()];
      quad(cur, c, e, out);
      lastQ = c;
      lastCtrl = null;
      cur = e;
    } else if (C === 'T') {
      const c: Pt = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
      const e: Pt = [ox + num(), oy + num()];
      quad(cur, c, e, out);
      lastQ = c;
      lastCtrl = null;
      cur = e;
    } else if (C === 'A') {
      const rx = num();
      const ry = num();
      const phi = num();
      const large = flag();
      const sweep = flag();
      const e: Pt = [ox + num(), oy + num()];
      arc(cur, rx, ry, phi, large, sweep, e, out);
      lastCtrl = lastQ = null;
      cur = e;
    } else {
      throw new Error(`unsupported path command ${cmd} in "${d}"`);
    }
  }
  return out;
}

function attr(tag: string, name: string): number | undefined {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? Number(m[1]) : undefined;
}

function shapePoints(markup: string): Pt[] {
  const pts: Pt[] = [];
  for (const [tag, kind] of markup.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/g)) {
    if (kind === 'path') {
      pts.push(...pathPoints(tag.match(/\sd="([^"]*)"/)![1]));
    } else if (kind === 'circle' || kind === 'ellipse') {
      const cx = attr(tag, 'cx') ?? 0;
      const cy = attr(tag, 'cy') ?? 0;
      const rx = attr(tag, 'r') ?? attr(tag, 'rx') ?? 0;
      const ry = attr(tag, 'r') ?? attr(tag, 'ry') ?? 0;
      pts.push([cx - rx, cy - ry], [cx + rx, cy + ry]);
    } else if (kind === 'rect') {
      const x = attr(tag, 'x') ?? 0;
      const y = attr(tag, 'y') ?? 0;
      pts.push([x, y], [x + (attr(tag, 'width') ?? 0), y + (attr(tag, 'height') ?? 0)]);
    } else if (kind === 'line') {
      pts.push([attr(tag, 'x1') ?? 0, attr(tag, 'y1') ?? 0], [attr(tag, 'x2') ?? 0, attr(tag, 'y2') ?? 0]);
    } else {
      const nums = (tag.match(/\spoints="([^"]*)"/)![1].match(NUM) ?? []).map(Number);
      for (let k = 0; k + 1 < nums.length; k += 2) pts.push([nums[k], nums[k + 1]]);
    }
  }
  return pts;
}

// EmptyState renders icons with `[&_svg]:stroke-[1.5px]`, overriding the icon's own width.
const MIN_RENDERED_STROKE = 1.5;

const MEASURABLE_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);

function measure(markup: string) {
  // Anything this guard cannot model must fail loudly, never be skipped.
  for (const [, tag] of markup.matchAll(/<([a-zA-Z][\w-]*)/g)) {
    if (!MEASURABLE_TAGS.has(tag)) throw new Error(`unsupported element <${tag}>`);
  }
  if ((markup.match(/<svg\b/g) ?? []).length !== 1) throw new Error('nested <svg> coordinate systems are not modelled');
  const painted = markup.match(/\s(transform|style|marker(?:-start|-mid|-end)?|filter|vector-effect)=/);
  if (painted) throw new Error(`${painted[1]} attributes are not modelled`);
  // Half the stroke width bounds the paint only for round caps and joins (set on the root by `base`).
  const root = markup.match(/<svg\b[^>]*>/)![0];
  for (const prop of ['stroke-linecap', 'stroke-linejoin']) {
    if (!root.includes(`${prop}="round"`)) throw new Error(`root <svg> must set ${prop}="round"`);
    for (const [, v] of markup.matchAll(new RegExp(`\\s${prop}="([^"]*)"`, 'g'))) {
      if (v !== 'round') throw new Error(`${prop}="${v}" is not modelled`);
    }
  }
  const [minX, minY, w, h] = markup.match(/viewBox="([^"]*)"/)![1].split(/[\s,]+/).map(Number);
  const widths = [...markup.matchAll(/\sstroke-width="([^"]*)"/g)].map((m) => {
    if (!/^\d*\.?\d+$/.test(m[1])) throw new Error(`stroke-width "${m[1]}" is not a plain number`);
    return Number(m[1]);
  });
  const half = Math.max(MIN_RENDERED_STROKE, ...widths) / 2;
  const pts = shapePoints(markup);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    box: { minX, minY, maxX: minX + w, maxY: minY + h },
    half,
    count: pts.length,
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

describe('geometry helpers', () => {
  it('rejects numeric arguments after close-path instead of looping', () => {
    expect(() => pathPoints('M1 1z0')).toThrow();
  });

  it('finds the exact extremum of a quadratic curve', () => {
    const pts = pathPoints('M2.016543 8Q27.797793 8 3.579043 8');
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(15.31, 3);
  });

  it('finds the exact extremum of an arc between samples', () => {
    const r = 6;
    const a = 0.3;
    const b = a + 3;
    const p0 = `${8 + r * Math.cos(a)} ${8 + r * Math.sin(a)}`;
    const p1 = `${8 + r * Math.cos(b)} ${8 + r * Math.sin(b)}`;
    const pts = pathPoints(`M${p0}A${r} ${r} 0 0 1 ${p1}`);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(14, 6);
  });

  it('reads a packed sweep flag as one character, leaving the coordinate intact', () => {
    const pts = pathPoints('M2 8 A2 2 0 0 118 8');
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(18, 9);
  });

  it('treats a zero-length arc as its endpoint', () => {
    const pts = pathPoints('M4 4A3 3 0 0 1 4 4');
    expect(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('refuses markup it cannot measure instead of skipping it', () => {
    const wrap = (inner: string) => `<svg viewBox="0 0 16 16" stroke-width="1">${inner}</svg>`;
    expect(() => measure(wrap('<g transform="translate(10 0)"><path d="M2 2L14 14"/></g>'))).toThrow();
    expect(() => measure(wrap('<path transform="translate(10 0)" d="M2 2L14 14"/>'))).toThrow();
    expect(() => measure(wrap('<path d="M2 2L14 14"/><use href="#x"/>'))).toThrow();
    expect(() => measure(wrap('<path style="stroke-width:6" d="M2 2L14 14"/>'))).toThrow();
    expect(() => measure(wrap('<path stroke-width="2px" d="M2 2L14 14"/>'))).toThrow();
    expect(() => measure(wrap('<svg x="14" viewBox="0 0 16 16"><path d="M2 2L14 14"/></svg>'))).toThrow();
    expect(() => measure(wrap('<path marker-end="url(#m)" d="M2 2L14 14"/>'))).toThrow();
    expect(() => measure(wrap('<path filter="url(#f)" d="M2 2L14 14"/>'))).toThrow();
    expect(() => measure(wrap('<path vector-effect="non-scaling-stroke" d="M2 2L14 14"/>'))).toThrow();
  });

  it('only accepts round caps and joins, the shape the half-stroke margin is exact for', () => {
    const svg = (attrs: string) => `<svg viewBox="0 0 16 16" stroke-width="1.5" ${attrs}><path d="M4 5L8 1L12 5"/></svg>`;
    expect(() => measure(svg('stroke-linecap="round" stroke-linejoin="round"'))).not.toThrow();
    expect(() => measure(svg('stroke-linecap="square"'))).toThrow();
    expect(() => measure(svg('stroke-linejoin="miter"'))).toThrow();
    expect(() => measure(svg(''))).toThrow();
  });

  it('uses the widest stroke on any element, never below the EmptyState override', () => {
    const round = 'stroke-linecap="round" stroke-linejoin="round"';
    expect(measure(`<svg viewBox="0 0 16 16" stroke-width="1" ${round}><path stroke-width="4" d="M2 2L14 14"/></svg>`).half).toBe(2);
    expect(measure(`<svg viewBox="0 0 16 16" stroke-width="1" ${round}><path d="M2 2L14 14"/></svg>`).half).toBe(0.75);
  });
});

const iconExports = Object.entries(Icons).filter(([name]) => /Icon$/.test(name));
const iconEntries = iconExports as [string, (p: object) => ReactElement][];

describe('icon geometry stays inside the viewBox (no clipped strokes)', () => {
  it('finds the icon set', () => {
    expect(iconEntries.length).toBeGreaterThan(10);
    expect(iconEntries.map(([n]) => n)).toContain('PaperclipIcon');
  });

  it('can render every *Icon export (a memo/forwardRef icon must not be skipped silently)', () => {
    expect(iconExports.filter(([, v]) => typeof v !== 'function').map(([n]) => n)).toEqual([]);
  });

  it.each(iconEntries)('%s', (_name, Icon) => {
    const m = measure(renderToStaticMarkup(createElement(Icon, {})));
    expect(m.count).toBeGreaterThan(0);
    const eps = 1e-6;
    expect(m.minX - m.half).toBeGreaterThanOrEqual(m.box.minX - eps);
    expect(m.minY - m.half).toBeGreaterThanOrEqual(m.box.minY - eps);
    expect(m.maxX + m.half).toBeLessThanOrEqual(m.box.maxX + eps);
    expect(m.maxY + m.half).toBeLessThanOrEqual(m.box.maxY + eps);
  });
});
