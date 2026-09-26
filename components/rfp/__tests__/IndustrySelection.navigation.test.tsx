import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IndustrySelection } from '../IndustrySelection';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { isIndustrySelectionValid } from '@/lib/rfp/industry-selection';
const groups = [{id:'book',name:'서적 판매',mccCode:'5942',pgWorkspaceIds:[]},{id:'learn',name:'원격 교육',mccCode:'8241',pgWorkspaceIds:[]},{id:'other',name:'방문 돌봄',mccCode:'9999',pgWorkspaceIds:[]}];
beforeEach(() => useRfpDraftStore.getState().reset());
afterEach(cleanup);
it('카테고리는 선택을 완료하지 않고 업종 선택 후 재진입하면 해당 카테고리를 복원한다', () => {
 const view = render(<IndustrySelection groups={groups} />);
 fireEvent.click(screen.getByRole('button',{name:'책·문구·취미'}));
 expect(isIndustrySelectionValid(useRfpDraftStore.getState(),groups)).toBe(false);
 fireEvent.click(screen.getByRole('radio',{name:/책·도서/}));
 expect(useRfpDraftStore.getState().industryGroupId).toBe('book');
 fireEvent.click(screen.getByRole('button',{name:'전체 카테고리'}));
 expect(useRfpDraftStore.getState().industryGroupId).toBe('book');
 view.unmount(); render(<IndustrySelection groups={groups} />);
 expect(screen.getByRole('radio',{name:/책·도서/})).toBeChecked();
});

it('직접 입력 방식으로 재진입하면 남아 있는 등록 ID에 맞는 카테고리로 제한하지 않는다', () => {
 useRfpDraftStore.setState({ industryMode:'custom', industryGroupId:'book', customIndustryName:'직접 입력 업종' });
 render(<IndustrySelection groups={groups} />);
 expect(screen.getByRole('radio',{name:'찾는 업종이 없어요 · 직접 입력'})).toBeChecked();
 expect(screen.getByRole('button',{name:'책·문구·취미'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'교육·전문 서비스'})).toBeInTheDocument();
});

it('동의어 검색은 카테고리 밖에서도 찾고 초기화하면 탐색 위치를 복원한다', () => {
 render(<IndustrySelection groups={groups} />);
 fireEvent.click(screen.getByRole('button',{name:'책·문구·취미'}));
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'인강'}});
 expect(screen.getByRole('radio',{name:/온라인 교육/})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 expect(screen.getByRole('radio',{name:/책·도서/})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'전체 카테고리'}));
 fireEvent.click(screen.getByRole('button',{name:'기타 업종'}));
 expect(screen.getByRole('radio',{name:'방문 돌봄'})).toBeInTheDocument();
 expect(screen.queryByText(/MCC/)).not.toBeInTheDocument();
});

it('검색으로 다른 카테고리 업종을 골라 검색을 지우면 선택한 카테고리로 돌아온다', () => {
 render(<IndustrySelection groups={groups} />);
 fireEvent.click(screen.getByRole('button',{name:'책·문구·취미'}));
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'인강'}});
 fireEvent.click(screen.getByRole('radio',{name:/온라인 교육/}));
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 expect(screen.getByRole('radio',{name:/온라인 교육/})).toBeChecked();
});

it('직접 입력을 위해 검색어를 가져올 때 앞뒤 공백을 지우고 100자로 제한한다', () => {
 render(<IndustrySelection groups={groups} />);
 const query = `  ${'가'.repeat(101)}  `;
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:query}});
 fireEvent.click(screen.getByRole('radio',{name:'찾는 업종이 없어요 · 직접 입력'}));
 expect(screen.getByRole('textbox',{name:'업종 이름'})).toHaveValue('가'.repeat(100));
 expect(isIndustrySelectionValid(useRfpDraftStore.getState(),groups)).toBe(true);
});

it('분류표에 없는 코드는 저장된 이름으로 기타 업종에서 고를 수 있다', () => {
 const unknown = [{id:'unknown',name:'특수 장비 대여',mccCode:'9999',pgWorkspaceIds:[]}];
 render(<IndustrySelection groups={unknown} />);
 fireEvent.click(screen.getByRole('button',{name:'기타 업종'}));
 expect(screen.getByRole('radio',{name:'특수 장비 대여'})).toBeInTheDocument();
});

it('기존 이름·예시·MCC 코드로 전체 업종을 검색하고 결과가 없으면 직접 입력을 안내한다', () => {
 const groups = [{id:'book',name:'서적 판매',mccCode:'5942',pgWorkspaceIds:[]}];
 render(<IndustrySelection groups={groups} />);
 const search = screen.getByRole('searchbox');
 for (const query of ['서적 판매', '종이책', '5942']) {
  fireEvent.change(search,{target:{value:query}});
  expect(screen.getByRole('radio',{name:/책·도서/})).toBeInTheDocument();
 }
 fireEvent.change(search,{target:{value:'해당하지 않는 업종'}});
 expect(screen.getByRole('status')).toHaveTextContent('검색 결과가 없어요');
 expect(screen.getByRole('radio',{name:'찾는 업종이 없어요 · 직접 입력'})).toBeInTheDocument();
});

it('공백만 입력한 검색은 전체 업종 검색으로 취급하지 않고 초기화할 수 있다', () => {
 render(<IndustrySelection groups={[groups[0]]} />);
 const search = screen.getByRole('searchbox');
 fireEvent.change(search,{target:{value:'   '}});
 expect(screen.getByRole('button',{name:'책·문구·취미'})).toBeInTheDocument();
 expect(screen.queryByRole('radio',{name:/책·도서/})).not.toBeInTheDocument();
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 expect(search).toHaveValue('');
});

it('관리자에 등록된 업종이 없는 카테고리는 숨긴다', () => {
 const bookOnly = [{id:'book',name:'서적 판매',mccCode:'5942',pgWorkspaceIds:[]}];
 render(<IndustrySelection groups={bookOnly} />);
 expect(screen.getByRole('button',{name:'책·문구·취미'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'기타 업종'})).not.toBeInTheDocument();
});
