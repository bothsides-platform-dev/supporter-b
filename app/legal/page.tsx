import Link from 'next/link';

export default function LegalPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-[length:var(--md-typescale-headline-large-size)] font-semibold">법적 고지</h1>
      <p>문서별 내용을 확인할 수 있어요.</p>
      <ul className="space-y-4 text-[var(--md-sys-color-primary)]">
        <li><Link href="/legal/terms" className="underline">이용약관</Link></li>
        <li><Link href="/legal/privacy" className="underline">개인정보 처리방침</Link></li>
        <li><Link href="/legal/marketing" className="underline">마케팅 수신 동의</Link></li>
      </ul>
    </div>
  );
}
