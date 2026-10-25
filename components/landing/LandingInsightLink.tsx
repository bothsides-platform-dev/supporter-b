import { ArrowUpRight } from 'lucide-react';
import styles from './LandingHeader.module.css';
import { DOCS_URL } from '@/lib/site-config';

// 외부 인사이트(docs) 링크 — 헤더의 로고 옆(PC)과 모바일 메뉴 맨 아래가 공유한다.
// 섹션 앵커와 구분되도록 ↗ 아이콘과 도메인 툴팁으로 다른 사이트로 이동함을 알린다(같은 탭 이동).
const DOCS_HOST = new URL(DOCS_URL).host;

export function LandingInsightLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <a
      href={DOCS_URL}
      title={DOCS_HOST}
      className={`${styles.link} ${styles.insight}${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      인사이트
      <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  );
}
