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
 fireEvent.click(screen.getByRole('button',{name:'책과 문구, 취미용품'}));
 expect(isIndustrySelectionValid(useRfpDraftStore.getState(),groups)).toBe(false);
 fireEvent.click(screen.getByRole('radio',{name:/서점과 도서/}));
 expect(useRfpDraftStore.getState().industryGroupId).toBe('book');
 fireEvent.click(screen.getByRole('button',{name:'전체 카테고리'}));
 expect(useRfpDraftStore.getState().industryGroupId).toBe('book');
 view.unmount(); render(<IndustrySelection groups={groups} />);
 expect(screen.getByRole('radio',{name:/서점과 도서/})).toBeChecked();
});

it('직접 입력을 선택하면 업종 이름 입력란에 포커스한다', () => {
 render(<IndustrySelection groups={groups} />);
 fireEvent.click(screen.getByRole('radio',{name:'업종을 직접 입력할게요'}));
 expect(screen.getByRole('textbox',{name:'업종 이름'})).toHaveFocus();
});

it('이미 선택된 직접 입력 항목을 다시 누르면 업종 이름으로 포커스한다', () => {
 useRfpDraftStore.setState({ industryMode:'custom', customIndustryName:'방문 돌봄' });
 render(<IndustrySelection groups={groups} />);
 fireEvent.click(screen.getByRole('radio',{name:'업종을 직접 입력할게요'}));
 expect(screen.getByRole('textbox',{name:'업종 이름'})).toHaveFocus();
});

it('저장된 직접 입력 방식으로 재진입해도 포커스를 빼앗지 않는다', () => {
 useRfpDraftStore.setState({ industryMode:'custom', customIndustryName:'방문 돌봄' });
 render(<IndustrySelection groups={groups} />);
 expect(screen.getByRole('textbox',{name:'업종 이름'})).not.toHaveFocus();
});

it('직접 입력 방식으로 재진입하면 남아 있는 등록 ID에 맞는 카테고리로 제한하지 않는다', () => {
 useRfpDraftStore.setState({ industryMode:'custom', industryGroupId:'book', customIndustryName:'직접 입력 업종' });
 render(<IndustrySelection groups={groups} />);
 expect(screen.getByRole('radio',{name:'업종을 직접 입력할게요'})).toBeChecked();
 expect(screen.getByRole('button',{name:'책과 문구, 취미용품'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'교육과 전문 서비스'})).toBeInTheDocument();
});

it('동의어 검색은 카테고리 밖에서도 찾고 초기화하면 탐색 위치를 복원한다', () => {
 render(<IndustrySelection groups={groups} />);
 fireEvent.click(screen.getByRole('button',{name:'책과 문구, 취미용품'}));
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'인강'}});
 expect(screen.getByRole('radio',{name:/온라인 교육/})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 expect(screen.getByRole('radio',{name:/서점과 도서/})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'전체 카테고리'}));
 fireEvent.click(screen.getByRole('button',{name:'기타 업종'}));
 expect(screen.getByRole('radio',{name:'방문 돌봄'})).toBeInTheDocument();
 expect(screen.queryByText(/MCC/)).not.toBeInTheDocument();
});

it('검색으로 다른 카테고리 업종을 골라 검색을 지우면 선택한 카테고리로 돌아온다', () => {
 render(<IndustrySelection groups={groups} />);
 fireEvent.click(screen.getByRole('button',{name:'책과 문구, 취미용품'}));
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'인강'}});
 fireEvent.click(screen.getByRole('radio',{name:/온라인 교육/}));
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 expect(screen.getByRole('radio',{name:/온라인 교육/})).toBeChecked();
});

it('직접 입력을 위해 검색어를 가져올 때 앞뒤 공백을 지우고 100자로 제한한다', () => {
 render(<IndustrySelection groups={groups} />);
 const query = `  ${'가'.repeat(101)}  `;
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:query}});
 fireEvent.click(screen.getByRole('radio',{name:'업종을 직접 입력할게요'}));
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
  expect(screen.getByRole('radio',{name:/서점과 도서/})).toBeInTheDocument();
 }
 fireEvent.change(search,{target:{value:'해당하지 않는 업종'}});
 expect(screen.getByRole('status')).toHaveTextContent('검색 결과가 없어요');
 expect(screen.getByRole('radio',{name:'업종을 직접 입력할게요'})).toBeInTheDocument();
});

it('공백만 입력한 검색은 전체 업종 검색으로 취급하지 않고 초기화할 수 있다', () => {
 render(<IndustrySelection groups={[groups[0]]} />);
 const search = screen.getByRole('searchbox');
 fireEvent.change(search,{target:{value:'   '}});
 expect(screen.getByRole('button',{name:'책과 문구, 취미용품'})).toBeInTheDocument();
 expect(screen.queryByRole('radio',{name:/서점과 도서/})).not.toBeInTheDocument();
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'검색 초기화'}));
 expect(search).toHaveValue('');
});

it('관리자에 등록된 업종이 없는 카테고리는 숨긴다', () => {
 const bookOnly = [{id:'book',name:'서적 판매',mccCode:'5942',pgWorkspaceIds:[]}];
 render(<IndustrySelection groups={bookOnly} />);
 expect(screen.getByRole('button',{name:'책과 문구, 취미용품'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'기타 업종'})).not.toBeInTheDocument();
});

it('오타가 있어도 업종을 찾고 정확히 맞는 업종을 먼저 보여준다', () => {
 const typoGroups = [{id:'typo',name:'여성뷱 수선',mccCode:'9999',pgWorkspaceIds:[]},{id:'exact',name:'여성복 판매',mccCode:'9999',pgWorkspaceIds:[]}];
 render(<IndustrySelection groups={typoGroups} />);
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'여성복'}});
 expect(screen.getAllByRole('radio').map(radio => radio.closest('label')?.textContent)).toEqual(['여성복 판매','여성뷱 수선','업종을 직접 입력할게요']);
 // Value: protects=the similar-industry hint keys on the best (first) match only; fails_when=the hint checks any
 // match (e.g. matches.some(m => m.typo)) so an exact hit plus a typo hit shows it; why_new=hint cases used one group; seam=none
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('오타로만 찾은 검색어는 직접 입력 업종 이름으로 가져오지 않는다', () => {
 render(<IndustrySelection groups={[{id:'exact',name:'여성복 의류 판매',mccCode:'9999',pgWorkspaceIds:[]}]} />);
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'여성뷱'}});
 fireEvent.click(screen.getByRole('radio',{name:'업종을 직접 입력할게요'}));
 expect(screen.getByRole('textbox',{name:'업종 이름'})).toHaveValue('');
});

it('정확히 맞은 검색어만 직접 입력 업종 이름으로 가져온다', () => {
 const group = {id:'exact',name:'여성복 의류 판매',mccCode:'9999',pgWorkspaceIds:[]};
 for (const [query, expected] of [['dutjdqhr',''],['ㅇㄹ',''],['여성보',''],['여성복','여성복']]) {
  useRfpDraftStore.getState().reset();
  const view = render(<IndustrySelection groups={[group]} />);
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:query}});
  fireEvent.click(screen.getByRole('radio',{name:'업종을 직접 입력할게요'}));
  expect(screen.getByRole('textbox',{name:'업종 이름'}), query).toHaveValue(expected);
  view.unmount();
 }
});

it('한글로 바꿀 수 없는 영문을 입력해도 화면이 멈추지 않는다', () => {
 render(<IndustrySelection groups={groups} />);
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'hotel'}});
 expect(screen.getByRole('status')).toHaveTextContent('검색 결과가 없어요');
});

it('정확히 맞는 업종 없이 비슷한 업종만 찾으면 그렇다고 알려준다', () => {
 render(<IndustrySelection groups={[{id:'exact',name:'여성복 의류 판매',mccCode:'9999',pgWorkspaceIds:[]}]} />);
 const search = screen.getByRole('searchbox');
 fireEvent.change(search,{target:{value:'여성뷱'}});
 expect(screen.getByRole('status')).toHaveTextContent('검색어와 비슷한 업종을 찾았어요. 아래에서 맞는 업종을 골라요.');
 fireEvent.change(search,{target:{value:'판매 여성뷱'}});
 expect(screen.getByRole('status')).toHaveTextContent('검색어와 비슷한 업종을 찾았어요.');
 // Value: protects=the hint appears only when some term needed a jamo typo; fails_when=the hint keys on the summed
 // score so two intentional score-1 terms (ㅇㄹ dmlfb) trigger it; why_new=earlier cases used one term; seam=none
 for (const value of ['의류', 'ㅇㄹ', 'dmlfb', 'dmlf', '의ㄹ', 'ㅇㄹ dmlfb']) {
  fireEvent.change(search,{target:{value}});
  expect(screen.getByRole('radio',{name:'여성복 의류 판매'})).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
 }
});
