import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이용약관',
  alternates: { canonical: '/legal/terms' },
};

export default function Page() {
  return (
    <article className="space-y-10 text-[length:var(--md-typescale-body-large-size)] leading-relaxed">
      <header className="space-y-4 border-b border-[var(--md-sys-color-outline-variant)] pb-8">
        <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">시행일 <time className="md-numeric" dateTime="2026-10-03">2026-10-03</time></p>
        <h1 className="text-[length:var(--md-typescale-headline-large-size)] font-semibold">이용약관</h1>
      </header>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제1조 목적</h2>
          <p>이 약관은 서포트비(이하 “회사”)가 제공하는 서포트비 서비스(이하 “서비스”)의 이용과 관련하여 회사와 회원의 권리, 의무, 책임사항 및 서비스 이용조건과 절차를 정함을 목적으로 합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제2조 정의</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>“회원”이란 본 약관에 동의하고 회사와 서비스 이용계약을 체결한 개인사업자, 법인사업자 또는 그 소속 임직원·대리인을 말합니다.</li>
            <li>“구매회원”이란 서비스 내에서 상품 또는 서비스의 견적 요청, 입찰 요청, RFP·RFQ 등록, 비교평가, 계약관리 등을 수행하는 회원을 말합니다.</li>
            <li>“공급회원”이란 서비스 내에서 견적서, 제안서, 입찰 제안, 수행 계획, 계약조건 등을 제출하는 회원을 말합니다.</li>
            <li>“팀 멤버”란 회원 소속 임직원 또는 적법한 권한을 위임받은 자로서 회원을 위하여 서비스를 이용하는 개인을 말하며, 그 행위의 법적 효과는 원칙적으로 해당 회원에게 귀속됩니다.</li>
            <li>“계정”이란 회사가 서비스 이용을 위하여 회원 또는 팀 멤버에게 부여한 로그인 계정을 말합니다.</li>
            <li>“공고”란 구매회원이 서비스에 등록하는 견적 요청, 입찰 요청, RFP, RFQ, 제안 요청 또는 기타 조달 관련 문서를 말합니다.</li>
            <li>“제안서”란 공급회원이 공고에 따라 제출하는 가격, 범위, 수행 방법, 일정, SLA, 유지보수, 계약조건 등 일체의 제안 자료를 말합니다.</li>
            <li>“데이터”란 회원이 서비스에 입력, 업로드, 작성, 전송, 저장하는 문서, 파일, 메시지, 평가표, 메모, 계약이력, 로그 등 일체의 정보를 말합니다.</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제3조 서비스의 내용</h2>
          <p>회사는 회원에게 다음 각 호의 서비스를 제공할 수 있습니다.</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>B2B 상품·서비스 공고 등록 및 관리 기능</li>
            <li>공급회원 탐색, 초청, 제안서 제출 및 비교 기능</li>
            <li>RFP·RFQ 작성, 질의응답, 평가, 승인, 계약 진행 관리 기능</li>
            <li>협업 메모, 알림, 대시보드, 통계, 권한관리 등 SaaS 기능</li>
            <li>기타 회사가 정하는 부가 서비스 및 유료 기능</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제4조 이용계약의 성립</h2>
          <p>회원이 회원가입 과정에서 회사가 요구하는 정보를 입력하고 본 약관 및 개인정보처리방침에 동의함으로써 서비스 이용계약이 성립합니다.</p>
          <p>회사는 회원의 유형, 사용 목적, 플랜, 결제 상태, 업종 특성 또는 법령상 제한에 따라 서비스 제공 범위와 기능을 달리 정할 수 있습니다.</p>
          <p>무료 플랜 또는 체험 버전에는 기능, 사용량, 저장 기간, 데이터 보존 기간에 제한이 있을 수 있습니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제5조 계정 및 권한 관리</h2>
          <p>회원은 정확하고 최신의 정보를 제공해야 하며, 계정 정보가 변경된 경우 지체 없이 수정하여야 합니다.</p>
          <p>회원은 계정 및 비밀번호를 안전하게 관리할 책임이 있으며, 이를 제3자에게 공유하거나 대여하여서는 안 됩니다.</p>
          <p>팀 멤버 초대, 권한 부여 및 철회에 대한 책임은 회원에게 있습니다.</p>
          <p>계정의 무단 사용 또는 보안상 문제가 발생한 경우 회원은 즉시 회사에 알려야 합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제6조 데이터 및 권리귀속</h2>
          <p>회원이 서비스에 등록하거나 업로드한 데이터의 권리는 원칙적으로 해당 회원에게 있습니다.</p>
          <p>회사는 서비스 제공, 유지보수, 보안 대응, 백업, 장애 복구, 기능 개선, 통계 분석을 위하여 필요한 범위 내에서 데이터를 저장·처리할 수 있습니다.</p>
          <p>회사가 제공하는 소프트웨어, 비교 로직, 인터페이스, 화면 구성, 데이터 구조, 상표, 문서, 콘텐츠 등에 관한 지식재산권은 회사에 귀속됩니다.</p>
          <p>회원은 회사의 사전 서면 동의 없이 서비스 또는 접근권한을 이용하여 경쟁 서비스 구축, 기능 복제, 데이터 구조 모방, 학습용 데이터 추출 등을 하여서는 안 됩니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제7조 회원의 의무 및 금지행위</h2>
          <p>회원은 관련 법령, 본 약관, 회사의 운영정책 및 안내사항을 준수하여야 합니다.</p>
          <p>회원은 다음 각 호의 행위를 하여서는 안 됩니다.</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>허위 정보 또는 타인의 정보를 도용하여 가입하거나 공고를 등록하는 행위</li>
            <li>제안서, 공고, 계약자료, 상대방 정보 등을 목적 외로 사용하거나 외부에 무단 유출하는 행위</li>
            <li>바이러스, 악성코드, 비정상적 트래픽 유발 등 서비스 운영을 방해하는 행위</li>
            <li>법령 또는 공서양속에 반하는 공고, 제안, 메시지, 파일을 등록·전송하는 행위</li>
            <li>회사 또는 제3자의 권리를 침해하거나 분쟁을 유발하는 행위</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제8조 요금, 결제 및 성공보수</h2>
          <p>서비스는 무료 플랜, 유료 플랜, 사용량 기반 서비스, 성공보수형 서비스 또는 이들을 결합한 방식으로 운영될 수 있습니다.</p>
          <p>구체적인 요금, 결제주기, 자동갱신 여부, 사용량 기준, 성공보수 산정 기준은 서비스 화면, 견적서, 별도 계약 또는 안내 페이지에 따릅니다.</p>
          <p>정기결제 상품은 회원이 해지하기 전까지 동일한 결제수단으로 자동 결제될 수 있습니다.</p>
          <p>성공보수형 서비스의 경우 거래 성사, 공급회원 선정, 계약 체결, 기타 회사가 정한 기준 충족 시 수수료가 발생할 수 있습니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제9조 환불</h2>
          <p>환불은 관련 법령, 별도 계약 및 회사의 환불정책에 따릅니다.</p>
          <p>이미 서비스 이용이 개시되었거나, 맞춤형 셋업, 문서 작성 지원, 비교평가, 공급사 매칭, 컨설팅 등 개별 제공이 완료된 경우 환불이 제한될 수 있습니다.</p>
          <p>연간결제, 선구매형, 할인형 상품의 환불은 할인 전 정상가 기준 차감, 사용분 차감 또는 별도 위약금 기준이 적용될 수 있습니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제10조 서비스의 변경 및 중단</h2>
          <p>회사는 서비스의 품질 향상, 기능 개선, 보안 강화, 법령 준수 또는 운영상 필요에 따라 서비스의 일부 또는 전부를 변경할 수 있습니다.</p>
          <p>회사는 시스템 점검, 설비 장애, 통신장애, 천재지변, 외부 서비스 장애, 법령상 요구 등 부득이한 사유가 있는 경우 서비스의 전부 또는 일부를 일시 중단할 수 있습니다.</p>
          <p>회사는 중요한 변경이 있는 경우 사전에 공지사항, 이메일, 서비스 내 알림 등 합리적인 방법으로 안내합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제11조 제3자 서비스 연동</h2>
          <p>회원은 이메일, 클라우드 저장소, 결제 서비스, CRM, 메신저, 전자서명, 분석도구 등 제3자 서비스를 연동하여 사용할 수 있습니다.</p>
          <p>회사는 제3자 서비스 자체의 제공 중단, 정책 변경, 보안 문제, 데이터 손실 또는 장애에 대하여 책임을 지지 않습니다.</p>
          <p>회원은 제3자 서비스 이용에 필요한 권리, 라이선스, 동의 및 계약을 스스로 확보하여야 합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제12조 기밀유지</h2>
          <p>회원은 서비스 이용 과정에서 알게 된 상대방 회원의 공고 내용, 제안 내용, 가격, 계약조건, 기술자료, 담당자 정보 등 비공개 정보를 법령 또는 상대방의 명시적 동의 없이 제3자에게 공개하거나 목적 외로 사용하여서는 안 됩니다.</p>
          <p>본 조의 의무는 이용계약 종료 후에도 관련 법령 또는 별도 계약이 허용하는 범위 내에서 유효합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제13조 책임제한</h2>
          <p>회사는 회원 상호 간 체결되는 계약의 성립, 이행, 품질, 납기, 하자, 대금지급, 손해배상 등 거래 결과를 직접 보증하지 않습니다.</p>
          <p>회사는 회원이 입력한 정보의 정확성, 제안의 진실성, 계약 상대방의 지급능력 또는 수행능력을 보증하지 않습니다.</p>
          <p>회사는 천재지변, 통신망 장애, 외부 플랫폼 장애, 회원의 귀책사유 등 회사의 합리적 통제를 벗어난 사유로 인한 손해에 대하여 책임을 지지 않습니다.</p>
          <p>회사의 고의 또는 중대한 과실이 없는 한 회사의 손해배상 책임은 해당 회원이 최근 12개월간 회사에 실제 지급한 이용대금 총액을 한도로 합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제14조 이용제한 및 계약해지</h2>
          <p>회원은 언제든지 서비스 내 기능 또는 고객센터를 통해 이용계약의 해지를 신청할 수 있습니다.</p>
          <p>회사는 회원이 본 약관 또는 법령을 위반하거나, 서비스의 정상 운영을 방해하거나, 회사 또는 제3자에게 중대한 손해를 초래할 우려가 있는 경우 사전 통지 후 또는 긴급한 경우 사후 통지로 이용을 제한하거나 계약을 해지할 수 있습니다.</p>
          <p>계약 해지 후에도 관련 법령상 보존 의무가 있는 정보는 해당 기간 동안 보관됩니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제15조 약관의 변경</h2>
          <p>회사는 관련 법령의 변경, 서비스 정책 변경 또는 사업상 필요에 따라 본 약관을 개정할 수 있습니다.</p>
          <p>회사는 약관을 개정할 경우 시행일과 개정사유를 명시하여 시행일 이전에 공지합니다.</p>
          <p>회원이 개정 약관 시행일까지 명시적으로 거부 의사를 표시하지 않고 서비스를 계속 이용하는 경우, 개정 약관에 동의한 것으로 봅니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제16조 준거법 및 관할</h2>
          <p>본 약관은 대한민국 법령에 따릅니다.</p>
          <p>서비스와 관련하여 회사와 회원 사이에 분쟁이 발생한 경우, 민사소송법상 관할법원 또는 회사 본점 소재지 관할법원을 제1심 관할법원으로 합니다.</p>
        </section>
    </article>
  );
}
