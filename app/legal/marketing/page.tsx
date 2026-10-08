import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '마케팅 수신 동의',
  alternates: { canonical: '/legal/marketing' },
};

export default function Page() {
  return (
    <article className="space-y-10 text-[length:var(--md-typescale-body-large-size)] leading-relaxed">
      <header className="space-y-4 border-b border-[var(--md-sys-color-outline-variant)] pb-8">
        <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">시행일 <time className="md-numeric" dateTime="2026-10-03">2026-10-03</time></p>
        <h1 className="text-[length:var(--md-typescale-headline-large-size)] font-semibold">마케팅 수신 동의</h1>
      </header>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제1조 수신 목적과 채널</h2>
          <p>서포트비는 마케팅 수신에 동의한 회원에게 이메일로 서비스 소식, 이벤트, 혜택 및 뉴스레터 등 광고성 정보를 보낼 수 있습니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제2조 이용하는 정보와 기간</h2>
          <p>마케팅 정보 제공을 위해 가입 시 등록한 이메일 주소를 이용합니다.</p>
          <p>마케팅 목적의 이용 기간은 동의 철회 또는 회원 탈퇴 시까지입니다. 가입 시 동의 여부에 관한 기록의 보관은 개인정보 처리방침에 따릅니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제3조 동의 거부</h2>
          <p>마케팅 수신 동의는 선택 사항입니다. 동의하지 않아도 회원가입과 서비스 이용이 가능합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제4조 동의 철회</h2>
          <p>마케팅 수신 동의는 고객지원 이메일 contact@support-b.com으로 철회를 요청할 수 있습니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제5조 서비스 이용 안내</h2>
          <p>계정 보안, 견적 진행, 계약 및 서비스 운영에 필요한 안내는 마케팅 수신 동의와 별도로 전달될 수 있습니다.</p>
        </section>
    </article>
  );
}
