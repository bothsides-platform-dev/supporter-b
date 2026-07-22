// AgreementCheckboxes — 가입 동의 3종(이용약관·개인정보 처리방침·마케팅).
// 약관 링크는 외부 Notion 문서라 target="_blank" 로 새 탭에서 열린다.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { AgreementCheckboxes } from '../AgreementCheckboxes';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';

afterEach(() => cleanup());

const OFF = { terms: false, privacy: false, marketing: false };

describe('AgreementCheckboxes', () => {
  it('약관·개인정보 링크가 새 탭으로 열린다는 사실을 설명으로 싣는다', () => {
    render(<AgreementCheckboxes value={OFF} onChange={vi.fn()} />);

    const terms = screen.getByRole('link', { name: '이용약관' });
    const privacy = screen.getByRole('link', { name: '개인정보 처리방침' });

    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAccessibleDescription(NEW_TAB_NOTICE);
    }
  });

  it('고지가 체크박스의 접근성 이름을 오염시키지 않는다', () => {
    // 링크가 체크박스 <label> 안에 있어, 링크 텍스트는 체크박스 이름에도 합쳐진다.
    // 고지를 그냥 sr-only 텍스트로 넣으면 '이용약관 새 탭에서 열려요 동의' 가 돼
    // 동의 문장이 끊긴다 — aria-hidden + aria-describedby 로 이름에서 뺀 이유.
    render(<AgreementCheckboxes value={OFF} onChange={vi.fn()} />);

    for (const name of [/이용약관 동의/, /개인정보 처리방침 동의/]) {
      // 이름이 '<문서명> 동의' 로 이어져야 한다 — 사이에 고지가 끼면 이 정규식이 깨진다.
      expect(screen.getByRole('checkbox', { name })).not.toHaveAccessibleName(
        new RegExp(NEW_TAB_NOTICE),
      );
    }
  });

  it('고지는 시각적으로 숨긴다', () => {
    render(<AgreementCheckboxes value={OFF} onChange={vi.fn()} />);
    const notices = screen.getAllByText(NEW_TAB_NOTICE);
    expect(notices).toHaveLength(2);
    for (const el of notices) expect(el).toHaveClass('sr-only');
  });
});
