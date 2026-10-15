import { beforeEach, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IndustrySelection } from '../IndustrySelection';
import { RfpStep2Content } from '../RfpStep2Content';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => useRfpDraftStore.getState().reset());
it('keeps the selected public industry visible while browsing another category or searching', () => {
  const groups = [{ id: 'book', name: '서적 판매', mccCode: '5942' }, { id: 'learn', name: '원격 교육', mccCode: '8241' }];
  render(<IndustrySelection groups={groups} presentation="public" />);
  fireEvent.click(screen.getByRole('button', { name: '책과 문구, 취미용품' }));
  fireEvent.click(screen.getByRole('radio', { name: /서점과 도서/ }));
  fireEvent.click(screen.getByRole('button', { name: '전체 카테고리' }));
  fireEvent.click(screen.getByRole('button', { name: '교육과 전문 서비스' }));
  expect(screen.getByRole('status')).toHaveTextContent('선택한 업종: 서점과 도서');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '인강' } });
  expect(screen.getByRole('status')).toHaveTextContent('선택한 업종: 서점과 도서');
  expect(useRfpDraftStore.getState().industryGroupId).toBe('book');
});
it('explains public contract choices while retaining toggle behavior and accessible names', () => {
  render(<RfpStep2Content question="contract" presentation="public" onBack={() => {}} onNext={() => {}} />);
  expect(screen.getByText('PG와 처음 계약해요')).toBeInTheDocument();
  expect(screen.getByText('기존 PG 계약을 갱신해요')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '신규 계약' }));
  expect(useRfpDraftStore.getState().contractType).toBe('new');
  fireEvent.click(screen.getByRole('button', { name: '신규 계약' }));
  expect(useRfpDraftStore.getState().contractType).toBeNull();
});
it('uses named numeric fields and Korean period units while preserving canonical stored values', () => {
  render(<RfpStep2Content question="delivery" presentation="public" onBack={() => {}} onNext={() => {}} />);
  const input = screen.getByRole('textbox', { name: '배송 및 서비스 기간' });
  const unit = screen.getByRole('combobox', { name: '배송 및 서비스 기간 단위' });
  expect(input.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.change(input, { target: { value: '3' } });
  expect(useRfpDraftStore.getState().deliveryServicePeriod).toBe('D+3');
  fireEvent.change(screen.getByRole('combobox', { name: '배송 및 서비스 기간 단위' }), { target: { value: 'W' } });
  expect(useRfpDraftStore.getState().deliveryServicePeriod).toBe('W+3');
  expect(screen.getByRole('option', { name: '주' })).toBeInTheDocument();
});
