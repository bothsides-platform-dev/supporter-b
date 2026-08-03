'use client';

import { useCallback, useMemo, useState } from 'react';
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
    setUploadId(session.uploadId);

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
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const sizes: PageSize[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale: 1 });
      sizes.push({ width: vp.width, height: vp.height });
    }
    setPages(sizes);
    setCurrentPage(1);
  }, []);

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
