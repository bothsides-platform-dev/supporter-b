import { describe, it, expect } from 'vitest';
import {
  getWorkspaceInitials,
  getWorkspaceColor,
  WORKSPACE_AVATAR_COLORS,
} from '@/lib/utils/workspace-avatar';

describe('getWorkspaceInitials', () => {
  it('단어 1개 → 첫 글자', () => {
    expect(getWorkspaceInitials('토스페이먼츠')).toBe('토');
  });
  it('단어 2개 → 각 첫 글자', () => {
    expect(getWorkspaceInitials('토스 페이먼츠')).toBe('토페');
  });
  it('영어 대문자 변환', () => {
    expect(getWorkspaceInitials('abc pay')).toBe('AP');
  });
  it('영어 단어 2개 → 두 이니셜', () => {
    expect(getWorkspaceInitials('ABC Pay')).toBe('AP');
  });
  it('공백 없는 영어 단어 → 첫 글자만', () => {
    expect(getWorkspaceInitials('NHN페이코')).toBe('N');
  });
  it('(주) 접두어 제거', () => {
    expect(getWorkspaceInitials('(주)토스페이먼츠')).toBe('토');
  });
  it('(유) 접두어 제거', () => {
    expect(getWorkspaceInitials('(유)나이스페이먼츠')).toBe('나');
  });
  it('(합) 접두어 제거', () => {
    expect(getWorkspaceInitials('(합)테스트')).toBe('테');
  });
  it('(사) 접두어 제거', () => {
    expect(getWorkspaceInitials('(사)테스트')).toBe('테');
  });
  it('(재) 접두어 제거', () => {
    expect(getWorkspaceInitials('(재)테스트')).toBe('테');
  });
  it('접두어 뒤 공백 처리', () => {
    expect(getWorkspaceInitials('(주) 토스페이먼츠')).toBe('토');
  });
  it('빈 문자열 → ?', () => {
    expect(getWorkspaceInitials('')).toBe('?');
  });
  it('공백만 → ?', () => {
    expect(getWorkspaceInitials('   ')).toBe('?');
  });
  it('접두어만 → ?', () => {
    expect(getWorkspaceInitials('(주)')).toBe('?');
  });
});

describe('getWorkspaceColor', () => {
  it('WORKSPACE_AVATAR_COLORS 배열 내 항목 반환', () => {
    const color = getWorkspaceColor('토스페이먼츠');
    expect(WORKSPACE_AVATAR_COLORS).toContain(color);
  });
  it('동일 이름은 항상 동일 색상', () => {
    expect(getWorkspaceColor('토스')).toBe(getWorkspaceColor('토스'));
  });
  it('빈 문자열도 크래시 없음', () => {
    expect(() => getWorkspaceColor('')).not.toThrow();
  });
  it('반환값이 bg/fg 키를 가짐', () => {
    const color = getWorkspaceColor('카카오페이');
    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('fg');
  });
});
