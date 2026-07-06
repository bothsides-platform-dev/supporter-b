// 팀 채팅 본문 렌더 — 멘션 토큰을 현재 이름의 강조 span 으로 치환.
// 본인 멘션(viewerUserId 일치)은 더 강한 강조. 텍스트 세그먼트는 부모의
// whitespace-pre-wrap 을 그대로 보존하도록 평문 문자열로 렌더한다.
import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { parseMentions } from '@/lib/utils/team-mentions';

type Props = {
  body: string;
  nameById: Map<string, string>;
  viewerUserId: string;
};

export function MentionText({ body, nameById, viewerUserId }: Props) {
  const segments = parseMentions(body);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <Fragment key={i}>{seg.text}</Fragment>;
        const isSelf = seg.type === 'mention' && seg.userId === viewerUserId;
        const label =
          seg.type === 'all'
            ? '@전체'
            : `@${nameById.get(seg.userId) ?? '(알 수 없음)'}`;
        return (
          <span
            key={i}
            data-self-mention={isSelf ? 'true' : 'false'}
            className={cn(
              'rounded-[var(--md-sys-shape-extra-small)] px-0.5 font-medium',
              isSelf
                ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                : 'text-[var(--md-sys-color-primary)]',
            )}
          >
            {label}
          </span>
        );
      })}
    </>
  );
}
