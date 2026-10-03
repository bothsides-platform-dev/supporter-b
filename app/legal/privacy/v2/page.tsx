import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보 처리방침',
  alternates: { canonical: '/legal/privacy/v2' },
};

export default function Page() {
  return (
    <article className="space-y-10 text-[length:var(--md-typescale-body-large-size)] leading-relaxed">
      <header className="space-y-4 border-b border-[var(--md-sys-color-outline-variant)] pb-8">
        <p className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">판본 <span className="md-numeric">v2</span> · 시행일 <time className="md-numeric" dateTime="2026-10-03">2026-10-03</time></p>
        <h1 className="text-[length:var(--md-typescale-headline-large-size)] font-semibold">개인정보 처리방침</h1>
      </header>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제1조 총칙</h2>
          <p>서포트비(이하 “회사”)는 서포트비 서비스 제공을 위하여 필요한 최소한의 개인정보를 수집·이용하며, 관련 법령에 따라 이를 안전하게 처리합니다.</p>
          <p>본 개인정보처리방침은 회사가 제공하는 서포트비 서비스 및 이에 부수하는 웹사이트, 애플리케이션, 상담, 결제, 마케팅, 고객지원 업무에 적용됩니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제2조 수집하는 개인정보 항목</h2>
          <p>회사는 다음의 개인정보를 수집할 수 있습니다.</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>회원가입 및 계정 생성 시: 이름, 이메일 주소, 비밀번호, 회사명, 부서, 직책, 휴대전화번호</li>
            <li>기업 인증 또는 결제 시: 사업자등록정보, 대표자명, 담당자 연락처, 결제정보, 세금계산서 발행 정보, 증빙서류</li>
            <li>서비스 이용 과정에서 자동 수집되는 정보: IP 주소, 접속일시, 로그인 기록, 브라우저/OS 정보, 기기정보, 서비스 이용기록, 쿠키, 오류 로그</li>
            <li>회원이 직접 입력하는 정보: 공고 작성 내용, 제안서 내용, 담당자 정보, 첨부파일, 질의응답, 협업 메모, 계약 관련 정보</li>
            <li>마케팅 수신 동의 시: 이메일 주소, 휴대전화번호, 회사명, 관심 서비스 분야</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제3조 개인정보의 이용 목적</h2>
          <p>회사는 수집한 개인정보를 다음 목적 범위 내에서 이용합니다.</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>회원 식별, 계정 생성 및 로그인 관리</li>
            <li>공고 등록, 제안서 제출, 비교·평가, 승인, 계약관리 등 서비스 제공</li>
            <li>고객 문의 응대, 공지 전달, 분쟁 처리 및 민원 대응</li>
            <li>결제 처리, 정산, 세금계산서 발행, 요금 청구</li>
            <li>서비스 개선, 보안 강화, 부정이용 방지, 통계 분석</li>
            <li>이벤트, 뉴스레터, 제품 업데이트 등 마케팅 정보 제공(별도 동의한 경우에 한함)</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제4조 개인정보의 수집 방법</h2>
          <p>회사는 다음 방법으로 개인정보를 수집합니다.</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>회원가입, 계정 설정, 서비스 이용 과정에서 이용자가 직접 입력하는 방법</li>
            <li>공고 등록, 제안서 제출, 메시지, 파일 업로드, 고객지원 문의 과정에서 수집하는 방법</li>
            <li>쿠키, 로그 분석 도구, 접속기록 저장 장치를 통해 자동 수집하는 방법</li>
            <li>결제대행사, 위탁사, 제휴사 등으로부터 적법한 절차에 따라 제공받는 방법</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제5조 쿠키의 사용</h2>
          <p>회사는 로그인 유지, 환경설정 저장, 이용 통계 분석, 서비스 최적화 등을 위하여 쿠키를 사용할 수 있습니다.</p>
          <p>이용자는 브라우저 설정을 통하여 쿠키 저장을 거부하거나 삭제할 수 있습니다. 다만, 이 경우 로그인 유지 또는 일부 기능 이용이 제한될 수 있습니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제6조 개인정보의 제3자 제공</h2>
          <p>회사는 이용자의 사전 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만 다음의 경우는 예외로 합니다.</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>이용자가 사전에 동의한 경우</li>
            <li>법령에 따라 제공 의무가 있는 경우</li>
            <li>수사기관, 법원, 감독기관 등이 적법한 절차에 따라 요청한 경우</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제7조 개인정보 처리의 위탁</h2>
          <p>회사는 서비스 운영을 위하여 다음 업무를 외부에 위탁할 수 있습니다: 클라우드 인프라 운영, 이메일·문자 발송, 결제 처리, 고객지원 시스템 운영, 로그 분석 및 보안 모니터링.</p>
          <p>회사는 위탁계약 체결 시 개인정보 보호 관련 법령에 따라 수탁자를 관리·감독합니다.</p>
          <p>실제 수탁사 목록은 서비스 운영 현황에 따라 별도로 공개하거나 본 방침에 반영합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제8조 개인정보의 국외 이전</h2>
          <p>회사는 클라우드, 분석, 이메일, 결제 또는 협업 도구 사용을 위하여 개인정보를 국외에 이전할 수 있습니다.</p>
          <p>이 경우 회사는 이전받는 자, 이전 국가, 이전 항목, 이전 목적, 보유기간 및 이전 방법을 관련 법령에 따라 별도로 고지하거나 본 방침에 반영합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제9조 개인정보의 보유 및 이용기간</h2>
          <p>회사는 개인정보의 수집 및 이용 목적이 달성되면 지체 없이 해당 정보를 파기합니다.</p>
          <p>다만, 관련 법령 또는 회사의 내부 방침에 따라 다음 정보는 일정 기간 보관할 수 있습니다.</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>계약 또는 청약철회에 관한 기록: 5년</li>
            <li>대금결제 및 재화·서비스 공급에 관한 기록: 5년</li>
            <li>소비자 불만 또는 분쟁처리에 관한 기록: 3년</li>
            <li>접속기록: 3개월</li>
            <li>부정이용 방지를 위한 기록: 최대 5년</li>
            <li>세법상 장부 및 증빙서류: 5년</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제10조 개인정보의 파기</h2>
          <p>종이 문서는 분쇄 또는 소각하여 파기합니다.</p>
          <p>전자적 파일은 복구가 불가능한 기술적 방법으로 삭제합니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제11조 개인정보의 안전성 확보조치</h2>
          <p>회사는 개인정보의 안전한 처리를 위하여 다음과 같은 조치를 취합니다.</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>접근권한의 최소화 및 권한관리</li>
            <li>비밀번호 암호화 및 전송구간 암호화</li>
            <li>접속기록의 보관 및 위·변조 방지</li>
            <li>보안프로그램 운영 및 취약점 점검</li>
            <li>개인정보 처리 인력에 대한 교육 및 내부 관리계획 수립</li>
          </ol>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제12조 정보주체의 권리와 행사방법</h2>
          <p>이용자는 언제든지 자신의 개인정보에 대하여 열람, 정정, 삭제, 처리정지, 동의철회를 요청할 수 있습니다.</p>
          <p>이용자의 권리 행사는 개인정보 보호책임자 또는 고객지원 채널을 통하여 할 수 있으며, 회사는 관련 법령에 따라 지체 없이 조치합니다.</p>
          <p>다른 법령에서 해당 개인정보가 보존 대상으로 명시된 경우에는 삭제가 제한될 수 있습니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제13조 아동의 개인정보</h2>
          <p>회사는 원칙적으로 만 14세 미만 아동을 대상으로 서비스를 제공하지 않으며, 해당 아동의 개인정보를 수집하지 않습니다.</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제14조 개인정보 보호책임자</h2>
          <p>부서명: 운영팀</p>
          <p>성명: 이성연</p>
          <p>연락처 : help@support-b.com</p>
          <p>주소: 서울시 광진구 자양번영로11길 14-5</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-semibold">제15조 개인정보처리방침의 변경</h2>
          <p>회사는 관련 법령, 서비스 변경, 보안정책 변경 등에 따라 본 방침을 수정할 수 있습니다.</p>
          <p>중요한 변경이 있는 경우 시행일 이전에 서비스 내 공지, 이메일 또는 기타 합리적인 방법으로 안내합니다.</p>
        </section>
    </article>
  );
}
