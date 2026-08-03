'use client';

import { useCallback, useState } from 'react';
import { FileSignatureIcon, PlusIcon } from '@/components/icons';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { LocalDate } from '@/components/primitives/LocalTime';
import { PageHeader } from '@/components/shell/PageHeader';
import { toast } from '@/lib/toast';
import { deleteSigningTemplateAction } from '@/lib/server/actions/signing/deleteSigningTemplateAction';
import { renameSigningTemplateAction } from '@/lib/server/actions/signing/renameSigningTemplateAction';
import { listSigningTemplatesAction } from '@/lib/server/actions/signing/listSigningTemplatesAction';
import { ContractTemplateEditor } from './ContractTemplateEditor';
import type { PgSigningTemplate } from '@/lib/types/signing';

type Props = { initialTemplates: PgSigningTemplate[] };

export function ContractTemplateList({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleDelete = useCallback(async (id: string) => {
    const result = await deleteSigningTemplateAction({ templateId: id });
    if (!result.ok) {
      toast('삭제하지 못했어요', { type: 'error' });
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast('템플릿을 삭제했어요');
  }, []);

  const startRename = (t: PgSigningTemplate) => {
    setRenamingId(t.id);
    setRenameValue(t.name);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const submitRename = useCallback(
    async (id: string) => {
      const name = renameValue.trim();
      if (!name) return;
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
    },
    [renameValue],
  );

  // 에디터가 넘겨주는 건 templateId뿐이라(이름 등 나머지 필드는 모른다) 여기서
  // placeholder 를 만들어 얹지 않고 서버 목록을 다시 불러온다 — 그래야 방금 저장한
  // 템플릿도 다른 항목과 동일하게 정확한 값으로 보인다.
  const handleSaved = useCallback(async () => {
    setEditing(false);
    const result = await listSigningTemplatesAction();
    if (!result.ok) {
      toast('목록을 새로고침하지 못했어요. 새로고침해 주세요.', { type: 'error' });
      return;
    }
    setTemplates(result.templates);
  }, []);

  if (editing) {
    return <ContractTemplateEditor onCancel={() => setEditing(false)} onSaved={handleSaved} />;
  }

  const isEmpty = templates.length === 0;

  return (
    <>
      <PageHeader
        title="계약서 템플릿"
        count={isEmpty ? undefined : templates.length}
        description="선정된 딜룸에서 바로 불러와 서명칸까지 채운 채로 발송할 계약서 서식을 미리 저장해 둬요."
        action={
          <Button
            type="button"
            size="sm"
            variant="outlined"
            icon={<PlusIcon />}
            onClick={() => setEditing(true)}
          >
            새 템플릿 만들기
          </Button>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-4">
        {isEmpty ? (
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
                      className="flex items-center gap-2"
                    >
                      <input
                        aria-label="템플릿 이름 변경"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-2 py-1 text-sm"
                      />
                      <Button type="submit" size="sm" variant="text">
                        저장
                      </Button>
                      <Button type="button" size="sm" variant="text" onClick={cancelRename}>
                        취소
                      </Button>
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
                    <Button type="button" size="sm" variant="text" onClick={() => startRename(t)}>
                      이름 변경
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="text"
                      color="error"
                      onClick={() => void handleDelete(t.id)}
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
