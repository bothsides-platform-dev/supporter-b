'use client';

/**
 * ClauseTemplateEditor — 조항형 계약서 서식 편집기.
 *
 * PDF 에디터(`ContractTemplateEditor`)와 나란한 자리지만 성격이 다르다: 저 쪽은
 * 올린 PDF 위에 서명칸을 배치하고, 이 쪽은 **문서 자체를 쓴다.** 서명란은 편집
 * 대상이 아니다 — 레이아웃이 항상 붙이고 좌표도 거기서 나온다.
 *
 * **pdfjs 를 임포트하지 않는다.** 미리보기는 서버가 렌더한 PDF 를 `<iframe>` 에
 * 띄운다 — 뷰어를 얹으면 500KB 청크와 SSR 경계 확장을 사는데, 얻는 것은 크롬
 * 일관성뿐이다. 그래서 이 컴포넌트는 `next/dynamic` 없이 평범하게 임포트된다.
 *
 * 상태 전이는 전부 `clause-editor-state.ts`(순수)가 소유한다. 여기서는 그 함수를
 * 부르고 결과를 그린다.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { underlineInputClass } from '@/components/forms/inputs';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import { saveComposedTemplateAction } from '@/lib/server/actions/signing/saveComposedTemplateAction';
import { buildDefaultContractDoc } from '@/lib/contract-doc/default-clauses';
import { CONTRACT_VARIABLES } from '@/lib/contract-doc/variables';
import { MAX_CLAUSES } from '@/lib/contract-doc/limits';
import { SIGNING_TEMPLATE_NAME_MAX } from '@/lib/signing/template-limits';
import type { ContractDoc } from '@/lib/types/contract-doc';
import {
  addClause,
  fromDocument,
  moveClause,
  removeClause,
  toDocument,
  updateClause,
  type ClauseEditorState,
} from './clause-editor-state';

export type ClauseTemplateEditorInitial = {
  templateId: string;
  name: string;
  document: ContractDoc;
};

/** 미리보기 요청을 모아 보내는 간격 — 타이핑마다 렌더하면 서버 CPU 를 태운다. */
const PREVIEW_DEBOUNCE_MS = 700;

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

export function ClauseTemplateEditor({
  initial,
  onCancel,
  onSaved,
}: {
  /** 없으면 새 서식(기본 조항 세트로 시작). */
  initial?: ClauseTemplateEditorInitial;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '표준 계약서');
  const [doc, setDoc] = useState<ClauseEditorState>(() =>
    fromDocument(initial?.document ?? buildDefaultContractDoc()),
  );
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // 이전 object URL 을 놓아 주기 위한 핸들 — 교체할 때마다 revoke 하지 않으면
  // 편집하는 내내 blob 이 쌓인다.
  const previewUrlRef = useRef<string | null>(null);

  const canSave = name.trim() !== '' && doc.clauses.length > 0 && !saving;

  // ── 미리보기 ──────────────────────────────────────────────────────────────
  const refreshPreview = useCallback(async (state: ClauseEditorState) => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/signing/templates/preview', {
        method: 'POST',
        body: JSON.stringify({ document: toDocument(state) }),
      });
      if (!res.ok) {
        // 400 은 대개 사용자가 방금 만든 문제다(오타 토큰·상한 초과) — 본문에
        // 이유가 실려 있으면 그대로 보여준다.
        setPreviewError(
          res.status === 400
            ? (await res.text()) || '미리보기를 만들지 못했어요'
            : '미리보기를 만들지 못했어요',
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch {
      setPreviewError('미리보기를 만들지 못했어요');
    } finally {
      setPreviewing(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refreshPreview(doc), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [doc, refreshPreview]);

  // 언마운트에서 마지막 URL 을 놓아 준다.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function save() {
    setError(null);
    startSaving(async () => {
      const r = await saveComposedTemplateAction({
        ...(initial ? { templateId: initial.templateId } : {}),
        name: name.trim(),
        document: toDocument(doc),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast('계약서 서식을 저장했어요', { type: 'success' });
      onSaved();
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6 py-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="clause-tpl-name">서식 이름</Label>
          <input
            id="clause-tpl-name"
            className={cn(underlineInputClass, 'w-full max-w-md')}
            value={name}
            maxLength={SIGNING_TEMPLATE_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="표준 계약서"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="text" onClick={onCancel} disabled={saving}>
            취소
          </Button>
          <Button variant="filled" onClick={save} disabled={!canSave}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="px-6 pt-3 md-label-small text-[var(--md-sys-color-error)]">
          {signingErrorMessage(error, '서식을 저장하지 못했어요')}
        </p>
      )}

      <div className="grid flex-1 grid-cols-1 gap-6 overflow-auto px-6 py-4 lg:grid-cols-2">
        {/* ── 왼쪽: 편집 ───────────────────────────────────────────────── */}
        <div className="space-y-5">
          <p className={cn('md-label-small', dim)}>
            표준 문안 예시예요. 법률 자문이 아니니 회사 문안으로 고쳐 쓰고, 필요하면 법무
            검토를 받아 주세요.
          </p>

          <Section label="제목">
            <input
              className={cn(underlineInputClass, 'w-full')}
              value={doc.title}
              onChange={(e) => setDoc({ ...doc, title: e.target.value })}
            />
          </Section>

          <Section label="전문 (당사자 표시)">
            <ClauseTextarea
              value={doc.preamble}
              onChange={(v) => setDoc({ ...doc, preamble: v })}
            />
          </Section>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="md-title-small">조항</span>
              <span className={cn('md-label-small', dim)}>
                {doc.clauses.length} / {MAX_CLAUSES}
              </span>
            </div>
            {doc.clauses.map((clause, index) => (
              <div
                key={clause.id}
                className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-3"
              >
                <div className="flex items-center gap-2">
                  {/* 조 번호는 순서에서 파생한다 — 입력받지 않는다. */}
                  <span className="md-label-small shrink-0 md-numeric">제{index + 1}조</span>
                  <input
                    aria-label={`제${index + 1}조 제목`}
                    className={cn(underlineInputClass, 'min-w-0 flex-1')}
                    value={clause.heading}
                    placeholder="조 제목"
                    onChange={(e) =>
                      setDoc(updateClause(doc, clause.id, { heading: e.target.value }))
                    }
                  />
                  <Button
                    variant="text"
                    size="sm"
                    aria-label={`제${index + 1}조 위로`}
                    disabled={index === 0}
                    onClick={() => setDoc(moveClause(doc, clause.id, 'up'))}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="text"
                    size="sm"
                    aria-label={`제${index + 1}조 아래로`}
                    disabled={index === doc.clauses.length - 1}
                    onClick={() => setDoc(moveClause(doc, clause.id, 'down'))}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="text"
                    size="sm"
                    color="error"
                    aria-label={`제${index + 1}조 삭제`}
                    onClick={() => setDoc(removeClause(doc, clause.id))}
                  >
                    삭제
                  </Button>
                </div>

                {clause.kind === 'text' ? (
                  <ClauseTextarea
                    ariaLabel={`제${index + 1}조 본문`}
                    value={clause.body}
                    onChange={(v) => setDoc(updateClause(doc, clause.id, { body: v }))}
                  />
                ) : (
                  <div className="space-y-2">
                    <ClauseTextarea
                      ariaLabel={`제${index + 1}조 표 앞 문장`}
                      value={clause.intro}
                      onChange={(v) => setDoc(updateClause(doc, clause.id, { intro: v }))}
                    />
                    <p className={cn('md-label-small rounded-[6px] bg-[var(--md-sys-color-surface-container)] px-3 py-2', dim)}>
                      결제수단별 수수료 표가 여기 들어가요. 요율은 선정된 견적에서 자동으로
                      채워져요.
                    </p>
                    <ClauseTextarea
                      ariaLabel={`제${index + 1}조 표 뒤 문장`}
                      value={clause.outro}
                      onChange={(v) => setDoc(updateClause(doc, clause.id, { outro: v }))}
                    />
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outlined"
                size="sm"
                disabled={doc.clauses.length >= MAX_CLAUSES}
                onClick={() => setDoc(addClause(doc, 'text'))}
              >
                조항 추가
              </Button>
              <Button
                variant="outlined"
                size="sm"
                disabled={doc.clauses.length >= MAX_CLAUSES}
                onClick={() => setDoc(addClause(doc, 'feeTable'))}
              >
                수수료 표 추가
              </Button>
            </div>
          </div>

          <Section label="말미문언">
            <ClauseTextarea value={doc.closing} onChange={(v) => setDoc({ ...doc, closing: v })} />
          </Section>

          <Section label="쓸 수 있는 자동 입력 값">
            <p className={cn('md-label-small', dim)}>
              본문에 아래 토큰을 넣으면 보낼 때 선정된 견적의 값으로 바뀌어요.
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(CONTRACT_VARIABLES).map(([token, meta]) => (
                <li
                  key={token}
                  className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-2 py-1"
                >
                  <code className="md-label-small md-numeric">{`{{${token}}}`}</code>
                  <span className={cn('md-label-small ml-1.5', dim)}>{meta.label}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* ── 오른쪽: 미리보기 ─────────────────────────────────────────── */}
        <div className="flex min-h-[60vh] flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="md-title-small">미리보기</span>
            <span className={cn('md-label-small', dim)} aria-live="polite">
              {previewing ? '만드는 중이에요…' : ''}
            </span>
          </div>
          {/* 실제 값이 들어가면 줄 수·쪽 나눔이 달라질 수 있다는 사실을 숨기지 않는다 —
              미리보기를 최종본으로 오해하면 조판을 잘못 판단한다. */}
          <p className={cn('md-label-small', dim)}>
            자동 입력 값은 〔이런 모양〕으로 표시돼요. 실제 값이 들어가면 줄 수가 달라질 수
            있어요.
          </p>
          {previewError ? (
            <p className="md-label-small text-[var(--md-sys-color-error)]">{previewError}</p>
          ) : null}
          {previewUrl ? (
            <iframe
              title="계약서 미리보기"
              src={previewUrl}
              className="h-full min-h-[60vh] w-full rounded-[6px] border border-[var(--md-sys-color-outline-variant)]"
            />
          ) : (
            <div className="flex h-full min-h-[60vh] items-center justify-center rounded-[6px] border border-[var(--md-sys-color-outline-variant)]">
              <span className={cn('md-label-small', dim)}>미리보기를 준비하고 있어요</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="md-label-small">{label}</span>
      {children}
    </div>
  );
}

/**
 * 조항 편집용 textarea — 최소 높이 72px, 세로 크기는 **사용자가 끈다**(`resize-y`).
 *
 * 자동 높이(`useAutoGrowTextarea`)를 쓰지 않는다: 조항 본문은 채팅 한 줄과 달리
 * 길고, 자동으로 늘어나면 조항 하나가 화면을 다 먹어 목록 재정렬이 어려워진다.
 */
function ClauseTextarea({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <textarea
      aria-label={ariaLabel}
      className={cn(underlineInputClass, 'min-h-[72px] w-full resize-y')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
