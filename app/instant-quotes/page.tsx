import Link from 'next/link';
import { notFound } from 'next/navigation';
import { instantViewer } from '@/lib/server/instant-viewer';
import { instantDb } from '@/lib/server/services/instant-quotes';
import { instantInbox } from '@/lib/server/repositories/drizzle/instant-inbox';
import { volumeText } from '@/lib/rfp/instant-quote';
export default async function Page() {
  const v = await instantViewer().catch(() => null);
  if (!v) notFound();
  const rows = await instantInbox(await instantDb(), v.actor, v.pg);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <h1 className="text-2xl font-semibold">
        {v.pg ? '받은 PG 가입 신청' : '내 PG 가입 신청'}
      </h1>
      {rows.length === 0 && <p>아직 신청이 없어요.</p>}
      {rows.map((r) => (
        <article key={r.id} className="space-y-1 border-b py-4">
          <Link
            className="font-semibold underline"
            href={'/instant-quotes/' + r.id}
          >
            {v.pg ? r.company : r.pgName} · {r.code}
          </Link>
          <p>{volumeText(r.input)}</p>
          <p>
            {r.closed
              ? '종료'
              : r.decision === 'approved'
                ? '가입 승인'
                : r.decision === 'declined'
                  ? '가입 거절'
                  : '가입 진행 중'}
          </p>
        </article>
      ))}
      {!v.pg && <Link href="/quote-start">견적 조회하기</Link>}
    </main>
  );
}
