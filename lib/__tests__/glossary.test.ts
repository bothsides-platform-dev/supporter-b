import { describe, it, expect } from 'vitest';
import { GLOSSARY, getGlossaryEntry } from '@/lib/glossary';

describe('getGlossaryEntry', () => {
  it('returns the entry for a known term', () => {
    const entry = getGlossaryEntry('정산주기');
    expect(entry).toBeDefined();
    expect(entry?.label.length).toBeGreaterThan(0);
    expect(entry?.description.length).toBeGreaterThan(0);
  });

  it('returns undefined for an unknown term', () => {
    expect(getGlossaryEntry('존재하지않는키')).toBeUndefined();
  });
});

describe('GLOSSARY', () => {
  it('has a non-empty label and description for every entry', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.label.trim().length, `label for ${key}`).toBeGreaterThan(0);
      expect(
        entry.description.trim().length,
        `description for ${key}`,
      ).toBeGreaterThan(0);
    }
  });

  it('covers the core financial terms', () => {
    for (const key of ['정산주기', '정산한도', '보증보험', '수수료율']) {
      expect(getGlossaryEntry(key), `missing ${key}`).toBeDefined();
    }
  });
});
