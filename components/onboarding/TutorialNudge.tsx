// dismissed 상태(환영 모달을 '나중에 하기'로 닫은) 유저용 홈 재유도 배너 — 가벼운 한 줄
// 카드. 닫기(X) 버튼 없음: 튜토리얼을 완료하면 shouldShowResumeNudge가 false가 되어
// 자연히 사라진다.
import Link from 'next/link';
import { ChevronRightIcon } from '@/components/icons';

export function TutorialNudge() {
  return (
    <Link
      href="/tutorial"
      className="flex items-center justify-between gap-2 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-4 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface)] transition-colors hover:bg-[var(--md-sys-color-surface-container-high)]"
    >
      <span>3분 만에 서비스를 둘러보세요</span>
      <ChevronRightIcon size={16} className="text-[var(--md-sys-color-on-surface-variant)]" />
    </Link>
  );
}
