import { siteConfig } from '@/lib/site-config';
import { ThemeToggle } from '@/components/shell/ThemeToggle';

const { operator } = siteConfig;

// 항목 사이 세로 구분선 — 글자가 아니라 보더라 `outline` 토큰 글자색 금지 규칙과
// 무관하고 스크린리더가 `|` 를 읽지 않는다. 모든 항목(직속 div) 앞에 선을 긋고 행을
// 선 폭(mx-2 + 1px = 17px)만큼 왼쪽으로 당겨 `CLIP` 래퍼로 자른다 — 줄바꿈이 일어나도
// 각 줄 맨 앞의 선만 잘려 나가 좁은 화면에서 줄이 `|` 로 시작하지 않는다. 항목은 flex 라
// 긴 값(주소)이 접혀도 이어지는 줄이 잘리는 영역으로 새지 않는다.
const SEPARATED_ROW =
  "-ml-[17px] flex flex-wrap items-center gap-y-1 [&>div]:flex [&>div]:min-w-0 [&>div]:items-center [&>div]:before:mx-2 [&>div]:before:shrink-0 [&>div]:before:h-3 [&>div]:before:border-l [&>div]:before:border-[var(--md-sys-color-outline-variant)] [&>div]:before:content-['']";

// 자르는 경계를 4px 바깥으로 물려(p-1 -m-1) 줄 첫 링크의 키보드 포커스 윤곽선이
// 잘리지 않게 한다. 구분선은 -9px 에 있어 여전히 잘린다.
const CLIP = 'overflow-hidden p-1 -m-1';

const LINK_CLASS = 'opacity-80 transition-opacity duration-150 hover:opacity-100';

const LEGAL_LINKS = [
  // 개인정보 보호법상 처리방침은 다른 고지와 구분되게 표시한다.
  { label: '개인정보 처리방침', href: '/legal/privacy', emphasize: true },
  { label: '서비스 이용약관', href: '/legal/terms' },
  { label: '마케팅 수신 동의', href: '/legal/marketing' },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      className="w-full border-t border-[var(--md-sys-color-outline-variant)]"
      style={{ backgroundColor: 'var(--md-sys-color-surface)' }}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 font-sans text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        {/* 전자상거래법 제10조·시행령 제11조의4 운영자 표시 항목 */}
        <div
          data-testid="footer-business-info"
          className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className={`flex min-w-0 flex-col gap-1 ${CLIP}`}>
            <p>{siteConfig.name}는 {operator.name}가 운영하는 PG 비교 견적 서비스입니다.</p>
            <dl className={SEPARATED_ROW}>
              <div><dt className="mr-1 shrink-0">상호 </dt><dd>{operator.name}</dd></div>
              <div><dt className="mr-1 shrink-0">대표자 </dt><dd>{operator.representative}</dd></div>
              <div><dt className="mr-1 shrink-0">사업자등록번호 </dt><dd className="md-numeric whitespace-nowrap">{operator.businessRegistrationNumber}</dd></div>
              <div><dt className="mr-1 shrink-0">사업장 주소 </dt><dd className="min-w-0 break-words">{operator.address}</dd></div>
            </dl>
            <dl className={SEPARATED_ROW}>
              <div>
                <dt className="mr-1 shrink-0">이메일 </dt>
                <dd className="min-w-0 break-all">
                  <a href={`mailto:${operator.email}`} className={LINK_CLASS}>{operator.email}</a>
                </dd>
              </div>
              <div><dt className="mr-1 shrink-0">호스팅서비스 제공자 </dt><dd>{operator.hostingProvider}</dd></div>
            </dl>
          </div>
          {/* 긴 정보 열 옆에서 아이콘 버튼이 찌그러지지 않게 */}
          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-8 mb-6 border-t border-[var(--md-sys-color-outline-variant)]" />

        <div className="flex flex-col gap-2">
          <span>
            © <span className="md-numeric">{year}</span> {operator.name} All rights reserved.
          </span>
          <div className={CLIP}>
            <nav aria-label="법적 고지" className={SEPARATED_ROW}>
              {LEGAL_LINKS.map((link) => (
                <div key={link.href}>
                  <a href={link.href} className={LINK_CLASS}>
                    {link.emphasize ? (
                      <strong className="font-semibold text-[var(--md-sys-color-on-surface)]">{link.label}</strong>
                    ) : (
                      link.label
                    )}
                  </a>
                </div>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
