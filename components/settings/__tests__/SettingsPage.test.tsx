import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPage } from '../SettingsPage';

describe('SettingsPage', () => {
  it('uses the shared page header and keeps children in the padded body', () => {
    render(
      <SettingsPage title="프로필 설정">
        <p>프로필 정보</p>
      </SettingsPage>,
    );

    expect(screen.getByRole('heading', { level: 1, name: '프로필 설정' })).toBeInTheDocument();
    expect(screen.getByTestId('page-header-row')).toBeInTheDocument();
    expect(screen.queryByTestId('page-header-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-header-row').parentElement).toHaveClass('shrink-0');

    const body = screen.getByText('프로필 정보').parentElement;
    expect(body).toHaveClass('min-h-0', 'min-w-0', 'flex-1', 'overflow-y-auto');
    expect(body).toHaveClass('space-y-8', 'px-6', 'py-6');
  });

  it('places page actions in the shared header', () => {
    render(
      <SettingsPage title="멤버 관리" action={<button type="button">멤버 초대</button>}>
        <p>멤버 목록</p>
      </SettingsPage>,
    );

    const headerAction = screen.getByTestId('page-header-action');
    expect(headerAction).toContainElement(screen.getByRole('button', { name: '멤버 초대' }));
    expect(screen.getByText('멤버 목록').parentElement).not.toBe(headerAction);
  });
});
