/** 설정 화면에서만 공유하는 폭·타이포·정보 행 규칙. */
const settingsPageClass = 'mx-auto w-full px-4 py-6 md:px-8 md:py-8';

export const settingsProfilePageClass = `${settingsPageClass} max-w-[960px]`;
export const settingsWidePageClass = `${settingsPageClass} max-w-[1120px]`;

export const settingsTitleClass =
  'text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]';

export const settingsDetailRowClass =
  'grid grid-cols-1 gap-y-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-start sm:gap-x-4';

export const settingsDetailLabelClass =
  'md-label-small text-[var(--md-sys-color-on-surface-variant)]';

export const settingsDetailValueClass =
  'min-w-0 text-[14px] text-[var(--md-sys-color-on-surface)] [overflow-wrap:anywhere]';
