'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/primitives/Button';
import { Tabs } from '@/components/primitives/Tabs';
import { cn } from '@/lib/utils';
import type { ContractSignatureMethod } from '@/lib/types/contract-doc';

import {
  beginStroke,
  clearModel,
  emptyModel,
  endStroke,
  extendStroke,
  isEmptyModel,
  type SignatureModel,
  type StrokePoint,
} from './signature-pad-model';

export type SignaturePadValue = {
  imageDataUrl: string | null;
  method: ContractSignatureMethod;
};

export type SignaturePadProps = {
  name: string;
  onChange: (v: SignaturePadValue) => void;
};

// 서명 PNG 는 DPR·화면폭과 무관하게 항상 이 논리 크기로 정규화해 내보낸다(서버 512KB 상한 대비).
const EXPORT_W = 640;
const EXPORT_H = 240;
const DPR_CAP = 2;
const STROKE_COLOR = '#2b2b2b';
const STROKE_WIDTH = 2.5;
const TYPE_FONT = '40px "Pretendard Variable", system-ui, sans-serif';

// 그린 서명: 라이브 캔버스를 오프스크린 640×240 에 drawImage 로 정규화해 PNG 로 굽는다.
function exportFromCanvas(source: HTMLCanvasElement): string | null {
  const out = document.createElement('canvas');
  out.width = EXPORT_W;
  out.height = EXPORT_H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, EXPORT_W, EXPORT_H);
  ctx.drawImage(source, 0, 0, EXPORT_W, EXPORT_H);
  return out.toDataURL('image/png');
}

// 타이핑 서명: 이름을 640×240 오프스크린 중앙에 렌더해 동일 규격 PNG 로 굽는다. 빈 문자열이면 null.
function exportFromName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const out = document.createElement('canvas');
  out.width = EXPORT_W;
  out.height = EXPORT_H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, EXPORT_W, EXPORT_H);
  ctx.fillStyle = STROKE_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = TYPE_FONT;
  ctx.fillText(trimmed, EXPORT_W / 2, EXPORT_H / 2);
  return out.toDataURL('image/png');
}

const TABS = [
  { id: 'draw', label: '그리기' },
  { id: 'type', label: '입력' },
];

export function SignaturePad({ name, onChange }: SignaturePadProps) {
  const [method, setMethod] = useState<ContractSignatureMethod>('draw');
  const [typedName, setTypedName] = useState(name);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const modelRef = useRef<SignatureModel>(emptyModel);
  const drawingRef = useRef(false);

  // 모델을 라이브 캔버스에 다시 그린다. ctx 가 없으면(jsdom 등) 조용히 무시.
  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, EXPORT_W, EXPORT_H);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const model = modelRef.current;
    const strokes = model.active ? [...model.strokes, model.active] : model.strokes;
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
  }, []);

  // 마운트 시 1회: 컨텍스트 확보 + DPR 백킹 스케일. 캔버스는 탭 전환에도 언마운트하지 않아
  // (숨김 토글) 그린 서명이 유지된다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = EXPORT_W * dpr;
    canvas.height = EXPORT_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [redraw]);

  const emitDraw = useCallback(() => {
    const canvas = canvasRef.current;
    const url = canvas && !isEmptyModel(modelRef.current) ? exportFromCanvas(canvas) : null;
    onChange({ imageDataUrl: url, method: 'draw' });
  }, [onChange]);

  // 포인터 좌표(클라이언트)를 논리 640×240 좌표계로 매핑한다.
  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = rect.width ? EXPORT_W / rect.width : 1;
    const sy = rect.height ? EXPORT_H / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ctxRef.current) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // jsdom 등 setPointerCapture 미구현 환경 — 무시.
    }
    drawingRef.current = true;
    modelRef.current = beginStroke(modelRef.current, pointFromEvent(e));
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    modelRef.current = extendStroke(modelRef.current, pointFromEvent(e));
    redraw();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 무시.
    }
    modelRef.current = endStroke(modelRef.current);
    redraw();
    emitDraw();
  };

  const handleClear = () => {
    modelRef.current = clearModel();
    redraw();
    onChange({ imageDataUrl: null, method: 'draw' });
  };

  const handleTypedChange = (value: string) => {
    setTypedName(value);
    onChange({ imageDataUrl: exportFromName(value), method: 'type' });
  };

  const handleMethodChange = (id: string) => {
    const next = id as ContractSignatureMethod;
    setMethod(next);
    if (next === 'type') {
      onChange({ imageDataUrl: exportFromName(typedName), method: 'type' });
    } else {
      emitDraw();
    }
  };

  return (
    <div className="space-y-3">
      <Tabs tabs={TABS} active={method} onChange={handleMethodChange} />

      {/* 그리기 패널 — 캔버스는 항상 마운트해 탭 전환에도 서명을 보존한다. */}
      <div className={cn('space-y-2', method === 'draw' ? 'block' : 'hidden')}>
        <canvas
          ref={canvasRef}
          data-testid="signature-canvas"
          className={cn(
            'aspect-[640/240] w-full max-w-[640px] cursor-crosshair touch-none rounded-[var(--md-sys-shape-small)]',
            'border border-[var(--md-sys-color-outline-variant)] bg-white',
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
            위 칸에 서명을 그려 주세요.
          </p>
          <Button type="button" variant="text" size="sm" onClick={handleClear}>
            다시 그리기
          </Button>
        </div>
      </div>

      {/* 입력 패널 */}
      <div className={cn('space-y-2', method === 'type' ? 'block' : 'hidden')}>
        <input
          type="text"
          value={typedName}
          onChange={(e) => handleTypedChange(e.target.value)}
          placeholder="이름을 입력해 주세요"
          className={cn(
            'h-10 w-full rounded-[var(--md-sys-shape-small)] px-3 text-sm',
            'border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]',
            'text-[var(--md-sys-color-on-surface)]',
            'focus:border-[var(--md-sys-color-primary)] focus:outline-none',
          )}
        />
        <div
          aria-hidden
          className={cn(
            'flex aspect-[640/240] w-full max-w-[640px] items-center justify-center',
            'rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-white',
          )}
        >
          <span className="text-[40px] leading-none text-[#2b2b2b]">{typedName.trim()}</span>
        </div>
      </div>
    </div>
  );
}
