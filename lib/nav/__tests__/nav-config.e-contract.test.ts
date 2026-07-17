import { describe, it, expect } from 'vitest';
import {
  getNavConfig,
  getNavCommands,
  getChordMap,
  getBreadcrumbSegments,
} from '../nav-config';

describe('nav-config — e-contract gate (opts.eContract)', () => {
  it('eContract 미지정(기본 off) 이면 buyer/pg 모두 전자계약 진입점이 없다', () => {
    expect(getNavConfig('buyer').top.map((i) => i.id)).not.toContain('contracts');
    expect(getNavConfig('pg').top.map((i) => i.id)).not.toContain('contracts');
    expect(getNavConfig('pg').top.map((i) => i.id)).not.toContain('contract-templates');
  });

  it('eContract:false 도 동일하게 진입점이 없다', () => {
    expect(getNavConfig('buyer', { eContract: false }).top.map((i) => i.id)).not.toContain(
      'contracts',
    );
  });

  it('eContract:true 면 buyer top 에 전자계약(G K, /contracts) 이 추가된다', () => {
    const top = getNavConfig('buyer', { eContract: true }).top;
    const item = top.find((i) => i.id === 'contracts');
    expect(item?.label).toBe('전자계약');
    expect(item?.href).toBe('/contracts');
    expect(item?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'k' });
  });

  it('eContract:true 면 pg top 에 전자계약 + 계약 템플릿(G E, /contract-templates) 이 추가된다', () => {
    const top = getNavConfig('pg', { eContract: true }).top;
    const contracts = top.find((i) => i.id === 'contracts');
    const templates = top.find((i) => i.id === 'contract-templates');
    expect(contracts?.href).toBe('/contracts');
    expect(templates?.label).toBe('계약 템플릿');
    expect(templates?.href).toBe('/contract-templates');
    expect(templates?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'e' });
  });

  it('buyer 는 계약 템플릿을 갖지 않는다(eContract:true 여도)', () => {
    const top = getNavConfig('buyer', { eContract: true }).top;
    expect(top.some((i) => i.id === 'contract-templates')).toBe(false);
  });

  it('getNavCommands 도 opts 를 그대로 위임한다', () => {
    expect(getNavCommands('buyer').map((c) => c.href)).not.toContain('/contracts');
    expect(getNavCommands('buyer', { eContract: true }).map((c) => c.href)).toContain(
      '/contracts',
    );
    expect(getNavCommands('pg', { eContract: true }).map((c) => c.href)).toContain(
      '/contract-templates',
    );
  });

  it('getChordMap 도 opts 를 그대로 위임한다 (g k → /contracts, g e → /contract-templates)', () => {
    expect(getChordMap('buyer')).not.toHaveProperty('k');
    expect(getChordMap('buyer', { eContract: true })).toMatchObject({ k: '/contracts' });
    expect(getChordMap('pg', { eContract: true })).toMatchObject({
      k: '/contracts',
      e: '/contract-templates',
    });
  });

  it('eContract:true 에도 chord 키 충돌이 없다 (collision guard)', () => {
    for (const ws of ['buyer', 'pg'] as const) {
      const { top, sections } = getNavConfig(ws, { eContract: true });
      const keys: string[] = [];
      for (const item of [...top, ...sections]) {
        if (item.shortcut?.kind === 'chord') keys.push(item.shortcut.key);
      }
      for (const section of sections) {
        for (const link of section.links ?? []) {
          if (link.shortcut?.kind === 'chord') keys.push(link.shortcut.key);
        }
        for (const s of section.statuses ?? []) {
          if (s.shortcut?.kind === 'chord') keys.push(s.shortcut.key);
        }
      }
      expect(keys.length).toBe(new Set(keys).size);
    }
  });

  it('getBreadcrumbSegments 는 게이트와 무관하게 항상 경로를 인식한다', () => {
    expect(getBreadcrumbSegments('/contracts')).toEqual([{ label: '전자계약' }]);
    expect(getBreadcrumbSegments('/contracts/new')).toEqual([
      { label: '전자계약', href: '/contracts' },
      { label: '계약서 보내기' },
    ]);
    expect(getBreadcrumbSegments('/contract-templates')).toEqual([{ label: '계약 템플릿' }]);
    // 동적 [id] 는 기존 전례(예: /rfp/[id])처럼 미등록 — unknown path
    expect(getBreadcrumbSegments('/contracts/abc-123')).toEqual([]);
  });
});
