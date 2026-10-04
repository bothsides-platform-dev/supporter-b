import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

import { WorkspaceAvatar } from '../WorkspaceAvatar';

afterEach(() => {
  cleanup();
});

describe('WorkspaceAvatar', () => {
  it('renders initials when logoUpdatedAt is null', () => {
    render(<WorkspaceAvatar name="서포트 B" workspaceId="ws-1" logoUpdatedAt={null} />);
    expect(screen.getByRole('img')).toHaveTextContent('B');
  });

  it('renders initials when there is no workspaceId', () => {
    render(<WorkspaceAvatar name="Acme Corp" logoUpdatedAt={null} />);
    expect(screen.getByRole('img')).toHaveTextContent('A');
  });

  it('renders img element when logoUpdatedAt is set and workspaceId is provided', () => {
    render(<WorkspaceAvatar name="서포트 B" workspaceId="ws-123" logoUpdatedAt="2026-06-21T00:00:00.000Z" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', `/api/workspace/ws-123/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
    expect(img).toHaveAttribute('alt', '서포트 B');
  });

  it('falls back to initials when img onError fires', () => {
    render(<WorkspaceAvatar name="서포트 B" workspaceId="ws-123" logoUpdatedAt="2026-06-21T00:00:00.000Z" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');

    fireEvent.error(img);

    // After error, initials should be shown instead
    const fallback = screen.getByRole('img');
    expect(fallback.tagName).not.toBe('IMG');
    expect(fallback).toHaveTextContent('B');
  });

  it('renders img with ?v cache-bust when logoUpdatedAt is set', () => {
    render(<WorkspaceAvatar name="서포트 B" workspaceId="ws-9" logoUpdatedAt="2026-06-21T00:00:00.000Z" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', `/api/workspace/ws-9/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
  });

  it('renders initials when logoUpdatedAt is null', () => {
    render(<WorkspaceAvatar name="Acme" workspaceId="ws-9" logoUpdatedAt={null} />);
    const el = screen.getByRole('img');
    expect(el.tagName).not.toBe('IMG');
  });

  it('re-renders img after logoUpdatedAt changes following an error fallback', () => {
    const { rerender } = render(<WorkspaceAvatar name="Acme" workspaceId="ws-9" logoUpdatedAt="2026-06-21T00:00:00.000Z" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').tagName).not.toBe('IMG');
    rerender(<WorkspaceAvatar name="Acme" workspaceId="ws-9" logoUpdatedAt="2026-06-22T00:00:00.000Z" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', `/api/workspace/ws-9/avatar?v=${Date.parse('2026-06-22T00:00:00.000Z')}`);
  });

  it('튜토리얼 PG는 logoUpdatedAt이 null이어도 정적 로고를 보여준다', () => {
    render(<WorkspaceAvatar name="토스페이먼츠" workspaceId="tutorial-pg-a" logoUpdatedAt={null} />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/images/pg-logos/toss.png');
    expect(img.className).toContain('w-auto');
  });

  // Value: protects=튜토리얼 PG 로고 로딩 실패 시 이니셜로 폴백; fails_when=정적 로고 분기의 onError 처리가 빠짐; why_new=기존 onError 테스트는 logoUpdatedAt 분기만 다룸; seam=none
  it('튜토리얼 PG 정적 로고 로딩이 실패하면 이니셜로 돌아간다', () => {
    render(<WorkspaceAvatar name="헥토파이낸셜" workspaceId="tutorial-pg-b" logoUpdatedAt={null} />);
    fireEvent.error(screen.getByRole('img'));
    const fallback = screen.getByRole('img');
    expect(fallback.tagName).toBe('DIV');
    expect(fallback).toHaveAttribute('aria-label', '헥토파이낸셜');
  });

  // Value: protects=상속 키 id 가 정적 로고로 오인되지 않음; fails_when=조회가 own-property 검사 없이 객체 인덱싱으로 돌아감; why_new=기존 테스트는 매핑된 id 만 다룸; seam=none
  it('constructor 같은 상속 키 workspaceId 는 정적 로고로 취급하지 않는다', () => {
    render(<WorkspaceAvatar name="Acme" workspaceId="constructor" logoUpdatedAt={null} />);
    expect(screen.getByRole('img').tagName).toBe('DIV');
  });
});
