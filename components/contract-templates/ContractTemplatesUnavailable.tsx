import { EmptyState } from '@/components/primitives/EmptyState';
import { FileSignatureIcon } from '@/components/icons';

/**
 * 계약서 템플릿 kill switch(CONTRACT_TEMPLATES_ENABLED=false) 동안 /contract-templates
 * 직접 진입 시 보여주는 준비중 화면. 저장된 템플릿은 노출하지 않는다.
 */
export function ContractTemplatesUnavailable() {
  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <EmptyState
        icon={<FileSignatureIcon size={32} />}
        title="계약서 템플릿을 잠시 닫았어요"
        description="저장해 둔 템플릿은 그대로 있어요. 곧 다시 열릴 예정이에요."
      />
    </div>
  );
}
