const CLARITY_PROJECT_ID = 'xiq81e87yn';

/**
 * Microsoft Clarity 세션 리플레이/히트맵 태그 — 로컬 개발 세션이 통계를
 * 오염시키지 않도록 프로덕션에서만 로드한다(Sentry의 dev 게이트와 동일 패턴).
 * 프로젝트 ID는 어차피 클라이언트에 노출되는 공개값이라 env 배선 없이 상수로 둔다.
 */
export function Clarity() {
  if (process.env.NODE_ENV === 'development') return null;

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`,
      }}
    />
  );
}
