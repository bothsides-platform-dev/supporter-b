'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import * as pdfjsLib from 'pdfjs-dist';

import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { toast } from '@/lib/toast';
import { createSigningTemplateUploadSessionAction } from '@/lib/server/actions/signing/createSigningTemplateUploadSessionAction';
import { createSigningTemplateAction } from '@/lib/server/actions/signing/createSigningTemplateAction';
import { addField, moveField, removeField, resizeField, type PageSize } from './template-editor-state';
import { validateTemplateFields } from '@/lib/signing/template-fields';
import type {
  SigningTemplateFieldInput,
  SigningTemplateFieldParty,
  SigningTemplateFieldType,
} from '@/lib/types/signing';

// pdf.js 워커 — Next.js는 워커 파일을 정적 자산으로 서빙해야 한다. 번들러가 처리하도록
// import.meta.url 기반 워커를 쓴다(pdfjs-dist v4+ 표준 패턴, v6.2.108에서도 유지됨 —
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs 실재 확인).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const FIELD_TOOLS: { type: SigningTemplateFieldType; party: SigningTemplateFieldParty; label: string }[] = [
  { type: 'signature', party: 'buyer', label: '구매사 서명' },
  { type: 'signature', party: 'pg', label: 'PG사 서명' },
  { type: 'name', party: 'buyer', label: '구매사 이름' },
  { type: 'name', party: 'pg', label: 'PG사 이름' },
  { type: 'date', party: 'buyer', label: '구매사 날짜' },
  { type: 'date', party: 'pg', label: 'PG사 날짜' },
  { type: 'text', party: 'buyer', label: '구매사 텍스트' },
  { type: 'text', party: 'pg', label: 'PG사 텍스트' },
];

type Props = { onSaved: (templateId: string) => void; onCancel: () => void };

export function ContractTemplateEditor({ onSaved, onCancel }: Props) {
  const [name, setName] = useState('');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageSize[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fields, setFields] = useState<SigningTemplateFieldInput[]>([]);
  const [saving, setSaving] = useState(false);

  // 파싱된 pdf.js 핸들 — 페이지 canvas 렌더링(아래 useEffect)이 doc 을, 해제가 task 를
  // 쓴다(v6 에서 destroy 는 문서가 아니라 로딩 태스크에 있다 — 워커까지 함께 반환).
  // state 가 아니라 ref 인 이유: 핸들 교체가 리렌더를 일으킬 필요가 없고, 렌더 트리거는
  // `pages` 하나로 충분하다.
  const pdfRef = useRef<{
    task: ReturnType<typeof pdfjsLib.getDocument>;
    doc: pdfjsLib.PDFDocumentProxy;
  } | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);

  const page = pages[currentPage - 1];
  const canSave = useMemo(
    () => !!uploadId && !!name.trim() && validateTemplateFields(fields).ok,
    [uploadId, name, fields],
  );

  const handleUpload = useCallback(async (file: File) => {
    const session = await createSigningTemplateUploadSessionAction({
      filename: file.name,
      contentType: 'application/pdf',
      sizeBytes: file.size,
    });
    if (!session.ok) {
      toast('업로드 세션을 만들지 못했어요', { type: 'error' });
      return;
    }

    // PUT/PDF 파싱은 전부 이 try 안에서 진행한다 — onChange가 `void handleUpload(file)`로
    // 호출되므로(반환 프로미스를 아무도 기다리지 않는다) 여기서 던지는 예외는 감싸지
    // 않으면 조용한 unhandled rejection이 되고, 파일 input은 여전히 파일이 선택된
    // 것처럼 보여 사용자가 실패를 알거나 재시도할 방법이 없다. uploadId는 PUT이 실제로
    // 성공한 뒤에만 설정한다(그 전에 설정해두면 PUT이 실패해도 "업로드된 것처럼" 상태가
    // 남는다) — 성공 판정 하나로 묶이므로 이 경로엔 uploadId가 설정됐는데 실제로는
    // 아무것도 저장되지 않은 창이 존재하지 않는다.
    try {
      // 직접 PUT — lib/attachments/upload-client.ts의 R2 presigned 업로드와 동일한
      // 2-phase 패턴(session.fields는 여기서 쓰지 않는다: PUT은 폼 필드가 필요 없다).
      const put = await fetch(session.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!put.ok) {
        toast('PDF 업로드에 실패했어요', { type: 'error' });
        return;
      }

      const buf = await file.arrayBuffer();
      const task = pdfjsLib.getDocument({ data: buf });
      const doc = await task.promise;
      const sizes: PageSize[] = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const p = await doc.getPage(i);
        const vp = p.getViewport({ scale: 1 });
        sizes.push({ width: vp.width, height: vp.height });
      }
      // 이전 문서가 있으면 해제하고 새 핸들로 교체 — 렌더 effect 가 pages 변경을 보고
      // 새 canvas 에 다시 그린다.
      void pdfRef.current?.task.destroy?.();
      pdfRef.current = { task, doc };
      setUploadId(session.uploadId);
      setPages(sizes);
      setCurrentPage(1);
    } catch {
      toast('PDF를 처리하지 못했어요', { type: 'error' });
    }
  }, []);

  // 페이지 본문을 canvas 에 실제로 그린다. 크기만 잡고 본문을 안 그리면 사용자는 빈
  // 사각형 위에 서명칸을 놓게 된다(계약서의 어디가 서명란인지 볼 수 없다). 렌더 좌표계는
  // 필드 배치와 같은 scale 1 viewport 라 배치 픽셀과 문서 픽셀이 1:1 로 맞는다.
  useEffect(() => {
    const doc = pdfRef.current?.doc;
    const root = pagesContainerRef.current;
    if (!doc || !root || pages.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (let i = 1; i <= pages.length; i += 1) {
        if (cancelled) return;
        const canvas = root.querySelector<HTMLCanvasElement>(`canvas[data-page-canvas="${i}"]`);
        if (!canvas) continue;
        try {
          const p = await doc.getPage(i);
          const viewport = p.getViewport({ scale: 1 });
          // v6 API — canvas 를 직접 넘기면 컨텍스트는 pdf.js 가 얻는다.
          await p.render({ canvas, viewport }).promise;
        } catch {
          if (!cancelled) toast('PDF 미리보기를 그리지 못했어요', { type: 'error' });
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pages]);

  // 언마운트 시 pdf.js 로딩 태스크 해제(문서 + 워커 메모리 반환).
  useEffect(
    () => () => {
      void pdfRef.current?.task.destroy?.();
    },
    [],
  );

  const handleAddField = useCallback(
    (type: SigningTemplateFieldType, party: SigningTemplateFieldParty) => {
      if (!page) return;
      setFields((f) => addField(f, { type, party, pageNumber: currentPage }, page));
    },
    [page, currentPage],
  );

  const handleSave = useCallback(async () => {
    if (!uploadId || !canSave) return;
    setSaving(true);
    const result = await createSigningTemplateAction({ name: name.trim(), documentUploadId: uploadId, fields });
    setSaving(false);
    if (!result.ok) {
      toast('템플릿을 저장하지 못했어요', { type: 'error' });
      return;
    }
    toast('템플릿을 저장했어요');
    onSaved(result.templateId);
  }, [uploadId, canSave, name, fields, onSaved]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Label as="label" htmlFor="tpl-name">
          템플릿 이름
        </Label>
        <input
          id="tpl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[6px] border px-2 py-1 text-sm"
        />
        <Label as="label" htmlFor="tpl-pdf">
          계약서 PDF
        </Label>
        <input
          id="tpl-pdf"
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
      </div>

      {pages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FIELD_TOOLS.map((tool) => (
            <button
              key={`${tool.type}-${tool.party}`}
              type="button"
              onClick={() => handleAddField(tool.type, tool.party)}
              className="rounded-[6px] border px-2 py-1 text-xs"
            >
              {tool.label}
            </button>
          ))}
        </div>
      )}

      <div ref={pagesContainerRef} className="flex flex-col gap-4">
      {pages.map((p, idx) => {
        const pageNumber = idx + 1;
        return (
          <div
            key={pageNumber}
            data-page={pageNumber}
            style={{ position: 'relative', width: p.width, height: p.height }}
            className="border"
            onMouseEnter={() => setCurrentPage(pageNumber)}
          >
            {/* 페이지 본문 — 위 렌더 effect 가 여기에 그린다. 필드 오버레이(Rnd)보다
                먼저 렌더돼 항상 아래 레이어다. */}
            <canvas
              data-page-canvas={pageNumber}
              width={p.width}
              height={p.height}
              aria-hidden="true"
              className="absolute inset-0"
            />
            {fields
              .filter((f) => f.pageNumber === pageNumber)
              .map((f) => (
                <Rnd
                  key={f.id}
                  size={{ width: f.width, height: f.height }}
                  position={{ x: f.x, y: f.y }}
                  bounds="parent"
                  onDragStop={(_e, d) => setFields((prev) => moveField(prev, f.id, { x: d.x, y: d.y }, p))}
                  onResizeStop={(_e, _dir, ref) =>
                    setFields((prev) =>
                      resizeField(prev, f.id, {
                        width: parseInt(ref.style.width, 10),
                        height: parseInt(ref.style.height, 10),
                      }),
                    )
                  }
                >
                  <div className="flex h-full w-full items-center justify-between border bg-white/70 px-1 text-[10px]">
                    <span>
                      {f.party === 'buyer' ? '구매사' : 'PG사'} {f.type}
                    </span>
                    <button type="button" onClick={() => setFields((prev) => removeField(prev, f.id))}>
                      x
                    </button>
                  </div>
                </Rnd>
              ))}
          </div>
        );
      })}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="text" onClick={onCancel}>
          취소
        </Button>
        <Button disabled={!canSave || saving} onClick={handleSave}>
          저장
        </Button>
      </div>
    </div>
  );
}
