// 서명 템플릿(전자서명) — PG 전용 독립 페이지.
// auth/redirect 가드 + 워크스페이스 링크 템플릿 로드 후 SigningTemplateManager(client)에 위임.
// org 스코핑: findByWorkspace 로 이 워크스페이스 링크분만 내려준다(타 PG 템플릿 비노출).
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getPgSigningTemplateRepo } from '@/lib/server/repositories/factory';
import { PageEnter } from '@/components/primitives/PageEnter';
import { SigningTemplateManager } from '@/components/signing-templates/SigningTemplateManager';

export const dynamic = 'force-dynamic';

export default async function SigningTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/signing-templates');
  }
  if (session.user.workspaceType !== 'pg') {
    redirect('/home');
  }

  const templates = await (await getPgSigningTemplateRepo()).findByWorkspace(
    session.user.workspaceId,
  );

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8">
      <SigningTemplateManager initialTemplates={templates} />
    </PageEnter>
  );
}
