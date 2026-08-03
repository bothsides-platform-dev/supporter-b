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
import { signingErrorMessage } from '@/lib/signing/error-messages';
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

// 필드 타입·소속의 한국어 표기 — 툴바 버튼과 배치된 칩·삭제 버튼 이름이 같은 어휘를
// 쓴다(칩만 영어 원값을 노출하면 '구매사 signature' 같은 한영 혼용이 된다).
const FIELD_TYPE_LABELS: Record<SigningTemplateFieldType, string> = {
  signature: '서명',
  name: '이름',
  date: '날짜',
  text: '텍스트',
};
const PARTY_LABELS: Record<SigningTemplateFieldParty, string> = {
  buyer: '구매사',
  pg: 'PG사',
};
const fieldLabel = (party: SigningTemplateFieldParty, type: SigningTemplateFieldType) =>
  `${PARTY_LABELS[party]} ${FIELD_TYPE_LABELS[type]}`;

const FIELD_TOOLS: { type: SigningTemplateFieldType; party: SigningTemplateFieldParty }[] = [
  { type: 'signature', party: 'buyer' },
  { type: 'signature', party: 'pg' },
  { type: 'name', party: 'buyer' },
  { type: 'name', party: 'pg' },
  { type: 'date', party: 'buyer' },
  { type: 'date', party: 'pg' },
  { type: 'text', party: 'buyer' },
  { type: 'text', party: 'pg' },
];

// 서명 가능한 타입 — validateTemplateFields 의 판정과 같은 기준(signature/name).
// 힌트 표시용으로만 쓰고, 실제 저장 게이트는 여전히 validateTemplateFields 가 소유한다.
const isSignable = (t: SigningTemplateFieldType) => t === 'signature' || t === 'name';

type Props = { onSaved: (templateId: string) => void; onCancel: () => void };

export function ContractTemplateEditor({ onSaved, onCancel }: Props) {
  const [name, setName] = useState('');
  // 원시 uploadId 가 아니라 서버가 워크스페이스에 서명 바인딩한 토큰을 들고 있는다 —
  // 저장할 때 그대로 돌려주면 서버가 소유를 대조한다(조직 공유 업로드 세션 방어).
  const [uploadToken, setUploadToken] = useState<string | null>(null);
  const [pages, setPages] = useState<PageSize[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fields, setFields] = useState<SigningTemplateFieldInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    () => !!uploadToken && !!name.trim() && validateTemplateFields(fields).ok,
    [uploadToken, name, fields],
  );

  // 저장이 비활성인 이유 — 버튼만 조용히 죽어 있으면 사용자가 막다른 길에 갇힌다.
  // 실제 게이트(canSave)와 같은 조건에서 파생하되 사람이 읽을 문장으로 편다.
  const missingHints = useMemo(() => {
    const hints: string[] = [];
    if (!uploadToken) hints.push('계약서 PDF를 올려 주세요');
    if (!name.trim()) hints.push('템플릿 이름을 입력해 주세요');
    if (!fields.some((f) => f.party === 'buyer' && isSignable(f.type)))
      hints.push('구매사 서명 필드를 배치해 주세요');
    if (!fields.some((f) => f.party === 'pg' && isSignable(f.type)))
      hints.push('PG사 서명 필드를 배치해 주세요');
    return hints;
  }, [uploadToken, name, fields]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
    const session = await createSigningTemplateUploadSessionAction({
      filename: file.name,
      contentType: 'application/pdf',
      sizeBytes: file.size,
    });
    if (!session.ok) {
      toast('업로드 세션을 만들지 못했어요', { type: 'error' });
      return;
    }

    // 업로드/PDF 파싱은 전부 이 try 안에서 진행한다 — onChange가 `void handleUpload(file)`로
    // 호출되므로(반환 프로미스를 아무도 기다리지 않는다) 여기서 던지는 예외는 감싸지
    // 않으면 조용한 unhandled rejection이 되고, 파일 input은 여전히 파일이 선택된
    // 것처럼 보여 사용자가 실패를 알거나 재시도할 방법이 없다. 업로드 토큰은 업로드가 실제로
    // 성공한 뒤에만 설정한다(그 전에 설정해두면 업로드가 실패해도 "업로드된 것처럼" 상태가
    // 남는다) — 성공 판정 하나로 묶이므로 이 경로엔 토큰이 설정됐는데 실제로는
    // 아무것도 저장되지 않은 창이 존재하지 않는다.
    try {
      // 스노우싸인 `/v1/uploads` 는 **S3 presigned POST** 를 준다 — R2 첨부
      // (lib/attachments/upload-client.ts)의 presigned PUT 과 다르다. 그 패턴을
      // 그대로 가져와 fields 를 버리고 PUT 을 쏘면 S3 가 403 을 돌려주고, PG 는
      // 계약서 템플릿을 한 건도 등록할 수 없다(실측 2026-08-03: PUT 403 / POST 204,
      // scripts/signing/snowsign-smoke.ts --template T2).
      //
      // 규칙 두 가지: ① 서명에 포함된 fields 를 하나도 빠뜨리지 않는다, ② `file` 은
      // 반드시 마지막에 붙인다(S3 는 file 뒤의 필드를 무시한다). Content-Type 은
      // fields 안에 이미 들어 있으므로 요청 헤더로는 절대 넣지 않는다 — 헤더로 박으면
      // 브라우저가 multipart boundary 를 못 붙여 본문이 통째로 깨진다.
      const form = new FormData();
      for (const [k, v] of Object.entries(session.fields)) form.append(k, v);
      form.append('file', file);
      const uploaded = await fetch(session.uploadUrl, { method: 'POST', body: form });
      if (!uploaded.ok) {
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
      setUploadToken(session.uploadToken);
      setPages(sizes);
      setCurrentPage(1);
    } catch {
      toast('PDF를 처리하지 못했어요', { type: 'error' });
    }
    } finally {
      setUploading(false);
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
    if (!uploadToken || !canSave) return;
    setSaving(true);
    const result = await createSigningTemplateAction({ name: name.trim(), uploadToken, fields });
    setSaving(false);
    if (!result.ok) {
      // 서버는 SNOWSIGN_* 쿼터·검증 등 코드를 구분해 돌려준다 — SSOT 로 옮겨 사용자가
      // 원인과 다음 행동을 알 수 있게 한다(알 수 없는 코드만 일반 문구).
      toast(signingErrorMessage(result.error, '템플릿을 저장하지 못했어요'), { type: 'error' });
      return;
    }
    toast('템플릿을 저장했어요');
    onSaved(result.templateId);
  }, [uploadToken, canSave, name, fields, onSaved]);

  const inputClass =
    'rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] ' +
    'bg-[var(--md-sys-color-surface)] px-2 py-1 text-sm text-[var(--md-sys-color-on-surface)]';

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
          className={inputClass}
        />
        <Label as="label" htmlFor="tpl-pdf">
          계약서 PDF
        </Label>
        <input
          id="tpl-pdf"
          type="file"
          accept="application/pdf"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // 값을 비워야 같은 파일을 다시 골랐을 때도 change 가 발화한다 —
            // 실패 후 재시도가 조용히 무시되는 것을 막는다.
            e.target.value = '';
            if (file) void handleUpload(file);
          }}
          className="text-sm text-[var(--md-sys-color-on-surface-variant)]"
        />
      </div>

      {uploading && (
        <p role="status" className="animate-pulse text-[12.5px] text-[var(--md-sys-color-on-surface-variant)]">
          PDF를 불러오는 중이에요…
        </p>
      )}

      {pages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FIELD_TOOLS.map((tool) => (
            <button
              key={`${tool.type}-${tool.party}`}
              type="button"
              onClick={() => handleAddField(tool.type, tool.party)}
              className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2 py-1 text-xs text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)]"
            >
              {fieldLabel(tool.party, tool.type)}
            </button>
          ))}
        </div>
      )}

      <div ref={pagesContainerRef} className="flex flex-col gap-4">
      {pages.map((p, idx) => {
        const pageNumber = idx + 1;
        return (
          <div key={pageNumber} className="space-y-1">
          {/* 어느 페이지에 필드가 떨어지는지 알 수 있어야 한다 — 번호 라벨 + 활성 표시. */}
          <p className="md-numeric text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {pageNumber}페이지
            {pages.length > 1 && pageNumber === currentPage && (
              <span className="ml-1.5 text-[var(--md-sys-color-primary)]">— 필드가 여기에 추가돼요</span>
            )}
          </p>
          <div
            data-page={pageNumber}
            style={{ position: 'relative', width: p.width, height: p.height }}
            className={
              pages.length > 1 && pageNumber === currentPage
                ? 'border border-[var(--md-sys-color-primary)]'
                : 'border border-[var(--md-sys-color-outline-variant)]'
            }
            onMouseEnter={() => setCurrentPage(pageNumber)}
            onClick={() => setCurrentPage(pageNumber)}
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
                  <div className="flex h-full w-full items-center justify-between gap-1 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]/85 px-1 text-[10px] text-[var(--md-sys-color-on-surface)]">
                    <span className="truncate">{fieldLabel(f.party, f.type)}</span>
                    <button
                      type="button"
                      aria-label={`${fieldLabel(f.party, f.type)} 필드 삭제`}
                      onClick={() => setFields((prev) => removeField(prev, f.id))}
                      className="shrink-0 px-1 py-0.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
                    >
                      ✕
                    </button>
                  </div>
                </Rnd>
              ))}
          </div>
          </div>
        );
      })}
      </div>

      <div className="flex items-center justify-end gap-3">
        {/* 저장이 비활성인 이유 — 남은 조건을 문장으로 알려준다(막다른 길 방지). */}
        {!canSave && (
          <p className="min-w-0 flex-1 text-right text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
            {missingHints.join(' · ')}
          </p>
        )}
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
