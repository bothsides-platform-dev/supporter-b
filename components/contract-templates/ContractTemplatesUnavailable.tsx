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
        title="장기계약 부속합의서로 서명을 요청해요"
        description="선정된 견적의 계약 탭에서 회사 정보를 채워 주세요. 기존에 보낸 계약과 저장된 템플릿은 그대로 보관돼요."
      />
    </div>
  );
}
