'use client';

import { Component, useCallback, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { FileSignatureIcon, PlusIcon } from '@/components/icons';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { FieldError } from '@/components/primitives/FieldError';
import { LocalDate } from '@/components/primitives/LocalTime';
import { PageHeader } from '@/components/shell/PageHeader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { SIGNING_TEMPLATE_NAME_MAX } from '@/lib/signing/template-limits';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import { deleteSigningTemplateAction } from '@/lib/server/actions/signing/deleteSigningTemplateAction';
import { renameSigningTemplateAction } from '@/lib/server/actions/signing/renameSigningTemplateAction';
import { listSigningTemplatesAction } from '@/lib/server/actions/signing/listSigningTemplatesAction';
import { getSigningTemplateDetailAction } from '@/lib/server/actions/signing/getSigningTemplateDetailAction';
import type { PgSigningTemplate } from '@/lib/types/signing';
// 타입 전용 — 에디터 모듈(pdfjs 정적 의존)이 아니라 순수 상태 모듈에서 가져와
// SSR(Node) 모듈 그래프를 오염시키지 않는다(ssr-safe 테스트 불변식).
import type { ContractTemplateEditorInitial } from './template-editor-state';

// pdfjs-dist(에디터의 정적 의존)는 모듈 최상위에서 `new DOMMatrix()`를 실행해
// Node(SSR)에서 즉사한다 — 서버 번들에 들어가지 않도록 클라이언트 전용으로 지연 로드.
// ssr:false 는 preload 도 끄므로 500KB급 pdfjs 청크는 클릭 시점에야 내려온다 —
// 에디터가 목록을 통째로 대체하는 화면이라 다운로드 동안 빈 화면을 두지 않는다.
const ContractTemplateEditor = dynamic(
  () => import('./ContractTemplateEditor').then((m) => m.ContractTemplateEditor),
  {
    ssr: false,
    loading: () => (
      <p
        role="status"
        className="flex flex-1 items-center justify-center animate-pulse text-[12.5px] text-[var(--md-sys-color-on-surface-variant)]"
      >
        에디터를 불러오는 중이에요…
      </p>
    ),
  },
);

// 청크 로드 실패는 React.lazy 가 rejection 을 캐시해 리마운트로 복구되지 않는다
// (대표 트리거: 배포 후 열린 탭의 옛 content-hash 청크 404). 전역 에러 화면으로
// 보내면 그쪽 재시도 버튼도 캐시된 rejection 을 다시 던지므로, 로컬 표면에서
// 유일한 출구인 새로고침을 바로 제공한다.
class EditorChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          에디터를 불러오지 못했어요. 네트워크를 확인한 뒤 새로고침해 주세요.
        </p>
        <Button variant="outlined" onClick={() => window.location.reload()}>
          새로고침
        </Button>
      </div>
    );
  }
}

type Props = {
  initialTemplates: PgSigningTemplate[];
  /** 서버 프리로드 실패 — 빈 상태로 위장하지 않고 에러 표면 + 재시도를 보여준다. */
  loadFailed?: boolean;
};

export function ContractTemplateList({ initialTemplates, loadFailed = false }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [loadError, setLoadError] = useState(loadFailed);
  // null = 목록 / {} = 새 템플릿 / { initial } = 기존 템플릿 수정(프리페치 완료분).
  const [editorState, setEditorState] = useState<null | {
    initial?: ContractTemplateEditorInitial;
  }>(null);
  // 프리페치(상세 + PDF) 진행 중인 행 — 이중 클릭·동시 열기를 막는다.
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PgSigningTemplate | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // 로드 실패 뒤 재시도 — 성공하면 목록으로, 실패하면 에러 표면을 유지한다.
  const retryLoad = useCallback(async () => {
    try {
      const result = await listSigningTemplatesAction();
      if (!result.ok) return;
      setTemplates(result.templates);
      setLoadError(false);
    } catch {
      // 표면이 그대로 남아 있으므로 별도 안내 없이 재시도를 기다린다.
    }
  }, []);

  // 스노우싸인에는 템플릿 업데이트 API 가 없다 — 잘못 지우면 PDF 재업로드 +
  // 서명칸 재배치를 처음부터 다시 해야 하고, 이 템플릿을 골라 둔 견적의 연결도
  // 조용히 끊어진다. QuoteTemplateList 와 같은 확인창 원칙(성공·실패·throw
  // 어느 쪽이든 닫는다 — 열린 채 굳으면 빠져나갈 길이 없다).
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeletePending(true);
    try {
      const result = await deleteSigningTemplateAction({ templateId: id });
      if (!result.ok) {
        toast('삭제하지 못했어요', { type: 'error' });
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast('템플릿을 삭제했어요');
    } catch {
      // 액션이 reject(네트워크 오류 등)로 던지는 경로 — finally 가 없으면 확인창이
      // loading 인 채 영구히 열려(취소·바깥클릭 전부 막힘) 새로고침 말고는 출구가 없다.
      toast('삭제하지 못했어요', { type: 'error' });
    } finally {
      setDeletePending(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const startRename = (t: PgSigningTemplate) => {
    setRenamingId(t.id);
    setRenameValue(t.name);
    setRenameError(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
    setRenameError(null);
  };

  const submitRename = useCallback(
    async (id: string) => {
      const name = renameValue.trim();
      // 빈 이름을 조용히 무시하면 막다른 길 — 폼은 열어 두고 그 자리에서 이유를 말한다.
      if (!name) {
        setRenameError('이름을 입력해 주세요');
        return;
      }
      setRenamePending(true);
      try {
        const result = await renameSigningTemplateAction({ templateId: id, name });
        // 성공·실패 어느 쪽이든 인라인 입력 폼은 닫는다 — 실패 시 열어두면 사용자가
        // 빠져나갈 방법 없이 굳는다(삭제 확인창과 같은 원칙, QuoteTemplateList 참고).
        setRenamingId(null);
        if (!result.ok) {
          toast('이름을 바꾸지 못했어요', { type: 'error' });
          return;
        }
        setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
        toast('이름을 바꿨어요');
      } catch {
        setRenamingId(null);
        toast('이름을 바꾸지 못했어요', { type: 'error' });
      } finally {
        setRenamePending(false);
      }
    },
    [renameValue],
  );

  // 기존 템플릿 열기 — detail 액션(이름·서명칸)과 PDF 프록시 fetch 를 병렬로
  // 프리페치하고, **둘 다 성공했을 때만** 에디터를 마운트한다. 실패는 목록 위
  // 토스트로 끝난다(반쯤 열린 에디터의 로딩·에러 표면을 만들지 않는다).
  const openForEdit = useCallback(async (t: PgSigningTemplate) => {
    setEditLoadingId(t.id);
    // pdfjs 청크(~500KB, ssr:false 라 preload 없음)를 프리페치와 병렬로 내려받는다 —
    // 순서대로면 detail+PDF 를 다 받은 뒤에야 청크 다운로드가 시작되는 3단 폭포다.
    // import() 는 멱등·캐시라 이후 마운트는 즉시 해석된다(함수 안 동적 import 라
    // SSR 모듈 그래프에는 들어가지 않는다).
    void import('./ContractTemplateEditor');
    try {
      const [detail, pdfRes] = await Promise.all([
        getSigningTemplateDetailAction({ templateId: t.id }),
        fetch(`/api/signing/templates/${t.id}/document`),
      ]);
      if (!detail.ok) {
        toast(signingErrorMessage(detail.error, '템플릿을 불러오지 못했어요'), { type: 'error' });
        return;
      }
      if (!pdfRes.ok) {
        toast('계약서 PDF를 불러오지 못했어요', { type: 'error' });
        return;
      }
      const pdfBytes = await pdfRes.arrayBuffer();
      // provider 원본 파일명(프록시 헤더, URI 인코딩) — 있어야 에디터의 같은-PDF
      // 재선택 보존(이름 대조)이 성립한다. 없으면 템플릿 이름에서 만든 폴백.
      const headerName = pdfRes.headers.get('X-Template-Filename');
      let fileName = `${detail.name}.pdf`;
      if (headerName) {
        try {
          fileName = decodeURIComponent(headerName);
        } catch {
          // 깨진 인코딩은 폴백 이름을 쓴다.
        }
      }
      setEditorState({
        initial: {
          templateId: t.id,
          name: detail.name,
          fields: detail.fields,
          pdfBytes,
          fileName,
        },
      });
    } catch {
      toast('템플릿을 불러오지 못했어요', { type: 'error' });
    } finally {
      setEditLoadingId(null);
    }
  }, []);

  // 에디터가 넘겨주는 건 templateId뿐이라(이름 등 나머지 필드는 모른다) 여기서
  // placeholder 를 만들어 얹지 않고 서버 목록을 다시 불러온다 — 그래야 방금 저장한
  // 템플릿도 다른 항목과 동일하게 정확한 값으로 보인다.
  const handleSaved = useCallback(async () => {
    setEditorState(null);
    const result = await listSigningTemplatesAction();
    if (!result.ok) {
      toast('목록을 새로고침하지 못했어요. 새로고침해 주세요.', { type: 'error' });
      return;
    }
    setTemplates(result.templates);
  }, []);

  if (editorState) {
    return (
      <EditorChunkBoundary>
        <ContractTemplateEditor
          initial={editorState.initial}
          onCancel={() => setEditorState(null)}
          onSaved={handleSaved}
        />
      </EditorChunkBoundary>
    );
  }

  const isEmpty = templates.length === 0;

  return (
    <>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="템플릿을 삭제할까요?"
        description={`"${deleteTarget?.name ?? ''}" 템플릿이 영구히 삭제돼요. 이 템플릿을 골라 둔 견적의 연결도 함께 끊어져요.`}
        confirmLabel="삭제할게요"
        variant="danger"
        onConfirm={handleDelete}
        loading={deletePending}
      />

      <PageHeader
        title="계약서 템플릿"
        count={isEmpty ? undefined : templates.length}
        description="선정된 딜룸에서 바로 불러와 서명칸까지 채운 채로 발송할 계약서 서식을 미리 저장해 둬요."
        action={
          // 프리페치 중에는 화면을 바꾸는 모든 진입을 잠근다 — 수정 버튼만 잠그면
          // 늦게 도착한 setEditorState 가 방금 고른 새-템플릿 화면을 덮어쓴다.
          <Button
            type="button"
            size="sm"
            variant="outlined"
            icon={<PlusIcon />}
            disabled={editLoadingId !== null}
            onClick={() => setEditorState({})}
          >
            새 템플릿 만들기
          </Button>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-4">
        {loadError ? (
          // 로드 실패는 빈 상태가 아니다 — "없어요"로 위장하면 사용자는 템플릿이
          // 사라진 줄 안다. 실패를 말하고 재시도 경로를 준다.
          <EmptyState
            icon={<FileSignatureIcon />}
            title="목록을 불러오지 못했어요"
            description="잠시 후 다시 시도해 주세요."
            action={
              <Button type="button" size="sm" variant="outlined" onClick={() => void retryLoad()}>
                다시 불러오기
              </Button>
            }
          />
        ) : isEmpty ? (
          <EmptyState
            icon={<FileSignatureIcon />}
            title="아직 저장한 계약서 템플릿이 없어요"
            description="한 번 만들어 두면 딜룸에서 골라 서명칸까지 채운 채로 바로 보낼 수 있어요."
          />
        ) : (
          <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-4">
                <div className="min-w-0 space-y-0.5">
                  {renamingId === t.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitRename(t.id);
                      }}
                      className="space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          aria-label="템플릿 이름 변경"
                          value={renameValue}
                          onChange={(e) => {
                            setRenameValue(e.target.value);
                            setRenameError(null);
                          }}
                          autoFocus
                          maxLength={SIGNING_TEMPLATE_NAME_MAX}
                          className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-2 py-1 text-sm"
                        />
                        <Button type="submit" size="sm" variant="text" disabled={renamePending}>
                          저장
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="text"
                          disabled={renamePending}
                          onClick={cancelRename}
                        >
                          취소
                        </Button>
                      </div>
                      <FieldError error={renameError ?? undefined} />
                    </form>
                  ) : (
                    <>
                      <p className="truncate text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
                        {t.name}
                      </p>
                      <p className="md-numeric text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        <LocalDate iso={t.createdAt} /> 생성
                      </p>
                    </>
                  )}
                </div>
                {renamingId !== t.id && (
                  <div className="flex shrink-0 gap-1">
                    {/* 프리페치 중에는 모든 행의 수정을 잠근다 — 동시 열기는 마지막
                        완료가 앞선 완료를 덮어 어떤 템플릿이 열렸는지 모호해진다. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="text"
                      disabled={editLoadingId !== null}
                      onClick={() => void openForEdit(t)}
                    >
                      {editLoadingId === t.id ? '불러오는 중…' : '수정'}
                    </Button>
                    <Button type="button" size="sm" variant="text" onClick={() => startRename(t)}>
                      이름 변경
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="text"
                      color="error"
                      disabled={editLoadingId !== null}
                      onClick={() => setDeleteTarget(t)}
                    >
                      삭제
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
