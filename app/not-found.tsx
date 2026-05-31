import { ErrorPageLayout } from '@/components/shell/ErrorPageLayout';

export default function NotFound() {
  return (
    <ErrorPageLayout
      code="404"
      title="페이지를 찾을 수 없어요"
      description="링크가 잘못됐거나 페이지가 삭제됐을 수 있어요. 아래 버튼을 눌러 계속해요."
      primaryAction={{ label: '홈으로 돌아가기', href: '/' }}
      secondaryAction={{ label: '이전 페이지', back: true }}
    />
  );
}
