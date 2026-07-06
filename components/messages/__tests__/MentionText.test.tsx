import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MentionText } from '../MentionText';
import { serializeMention, ALL_TOKEN } from '@/lib/utils/team-mentions';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const names = new Map([[U1, '김민수'], [U2, '이영희']]);

describe('MentionText', () => {
  it('멘션 토큰을 @이름 으로 강조 렌더', () => {
    render(<MentionText body={`${serializeMention(U1)} 확인`} nameById={names} viewerUserId={U2} />);
    expect(screen.getByText('@김민수')).toBeInTheDocument();
    expect(screen.getByText(/확인/)).toBeInTheDocument();
  });

  it('본인 멘션은 data-self-mention 으로 표시', () => {
    render(<MentionText body={serializeMention(U2)} nameById={names} viewerUserId={U2} />);
    const el = screen.getByText('@이영희');
    expect(el).toHaveAttribute('data-self-mention', 'true');
  });

  it('타인 멘션은 data-self-mention=false', () => {
    render(<MentionText body={serializeMention(U1)} nameById={names} viewerUserId={U2} />);
    expect(screen.getByText('@김민수')).toHaveAttribute('data-self-mention', 'false');
  });

  it('@all 은 @전체 로 렌더', () => {
    render(<MentionText body={ALL_TOKEN} nameById={names} viewerUserId={U2} />);
    expect(screen.getByText('@전체')).toBeInTheDocument();
  });

  it('알 수 없는 멤버는 fallback', () => {
    render(<MentionText body={serializeMention(U1)} nameById={new Map()} viewerUserId={U2} />);
    expect(screen.getByText('@(알 수 없음)')).toBeInTheDocument();
  });
});
