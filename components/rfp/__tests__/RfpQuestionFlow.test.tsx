import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpQuestionFlow } from '../RfpQuestionFlow';
import { RfpCreateWizard } from '../RfpCreateWizard';
import { RfpStep2Content } from '../RfpStep2Content';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock('@/lib/server/actions/rfp', () => ({ createRfpAction: vi.fn(), verifyDraftFilesAction: vi.fn() }));
vi.mock('../RfpAttachmentDropzone', () => ({ RfpAttachmentDropzone: () => <div>첨부 파일</div> }));

describe('실제 견적 질문 흐름', () => {
  beforeEach(() => { useRfpDraftStore.getState().reset(); });
  it('검증 실패마다 입력으로 초점을 돌리고 오류를 입력 설명으로 연결한다', async () => {
    const user = userEvent.setup();
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: '사업 운영 홈페이지' });
    for (let attempt = 0; attempt < 2; attempt++) {
      await user.click(screen.getByRole('button', { name: '다음' }));
      expect(input).toHaveFocus();
      expect(input).toHaveAccessibleDescription('홈페이지 주소를 입력해주세요');
    }
    await user.type(input, 'example.com');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(input).not.toHaveAccessibleDescription();
  });

  it('홈페이지 입력은 URL 키보드와 자동 대문자·맞춤법 해제를 제공한다', () => {
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: '사업 운영 홈페이지' });
    expect(input).toHaveAttribute('inputmode', 'url');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });

  it.each(['cash', 'price', 'sales'])('필수 선택 %s 오류에서 선택지로 초점을 옮기고 오류를 읽을 수 있다', async (contentQuestion) => {
    useRfpDraftStore.setState({ contentQuestion });
    const user = userEvent.setup();
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    const choice = screen.getAllByRole(contentQuestion === 'sales' ? 'checkbox' : 'radio')[0];
    expect(choice).toHaveFocus();
    expect(choice).toHaveAttribute('aria-invalid', 'true');
    expect(choice).toHaveAccessibleDescription(/답변을 선택/);
    await user.click(choice);
    expect(choice).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([['title', '제목'], ['products', '주요 판매 상품']])('%s 오류를 입력 설명으로 연결한다', async (contentQuestion, name) => {
    useRfpDraftStore.setState({ contentQuestion });
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '다음' }));
    const input = screen.getByRole('textbox', { name });
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription(/입력/);
  });

  it('업종을 고르지 않은 경우 검색 입력으로 초점을 옮기고 오류를 직접 입력란에도 연결한다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'industry' });
    const user = userEvent.setup();
    render(<RfpQuestionFlow industryGroups={[{ id: 'group-1', name: '의류', pgWorkspaceIds: [] }]} onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('searchbox', { name: '업종 검색' })).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: '업종을 직접 입력할게요' }));
    const customInput = screen.getByRole('textbox', { name: '업종 이름' });
    expect(customInput).toHaveAttribute('aria-invalid', 'true');
    expect(customInput).toHaveAccessibleDescription(/업종 이름/);
  });

  it('마지막 질문에서 이전 필수 답변을 발견하면 해당 입력으로 이동한다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'attachments' });
    const user = userEvent.setup();
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '내용 확인하기' }));
    const website = screen.getByRole('textbox', { name: '사업 운영 홈페이지' });
    expect(website).toHaveFocus();
    expect(website).toHaveAccessibleDescription(/홈페이지 주소/);
  });

  it('서버에서 거부한 홈페이지는 오류를 다시 읽을 수 있도록 연결한다', async () => {
    useRfpDraftStore.setState({ websiteUrl: 'https://example.com' });
    render(<RfpQuestionFlow websiteRejected="https://example.com" onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const website = screen.getByRole('textbox', { name: '사업 운영 홈페이지' });
    await userEvent.setup().click(screen.getByRole('button', { name: '다음' }));
    expect(website).toHaveFocus();
    expect(website).toHaveAccessibleDescription(/올바른 도메인 주소/);
  });

  it('형식이 잘못된 홈페이지도 오류 설명을 연결하고 진행을 막는다', async () => {
    useRfpDraftStore.setState({ websiteUrl: 'not a domain' });
    const onNext = vi.fn();
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={onNext} onQuestionChange={vi.fn()} />);
    const website = screen.getByRole('textbox', { name: '사업 운영 홈페이지' });
    await userEvent.setup().click(screen.getByRole('button', { name: '다음' }));
    expect(website).toHaveFocus();
    expect(website).toHaveAccessibleDescription(/올바른 도메인 주소/);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('모든 필수 답변이 유효하면 마지막 확인에서 다음 단계로 이동한다', async () => {
    useRfpDraftStore.setState({
      contentQuestion: 'attachments', websiteUrl: 'https://example.com', industryMode: 'custom',
      customIndustryName: '의류', mainProducts: '의류', contractType: 'new', title: '견적 요청',
      requiredPaymentMethods: ['card'],
      productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
    });
    const onNext = vi.fn();
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={onNext} onQuestionChange={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '내용 확인하기' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('결제수단 질문에는 선택 안내를 제목 아래에 한 번만 표시한다', () => {
    useRfpDraftStore.setState({ contentQuestion: 'payment' });
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const heading = screen.getByRole('heading', { name: '어떤 결제수단의 견적을 받을까요?' });
    expect(heading.parentElement).toHaveTextContent('여러 개 선택할 수 있어요');
    expect(screen.queryByText('견적 받을 결제수단')).not.toBeInTheDocument();
    expect(screen.queryByText('필수')).not.toBeInTheDocument();
    const group = screen.getByRole('group', { name: heading.textContent! });
    expect(group).toHaveAccessibleDescription('여러 개 선택할 수 있어요');
  });

  it('선택형 필수 질문 오류에서는 aria-pressed 선택지로 초점을 옮긴다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'contract' });
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('button', { name: '신규 계약' })).toHaveFocus();
  });
  it('질문 위에 단계 라벨을 띄우지 않고 진행률은 하단 작성 이동 영역에 둔다', () => {
    useRfpDraftStore.setState({ contentQuestion: 'solution' });
    render(<RfpCreateWizard pgList={[]} step={2} />);
    const header = screen.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' }).parentElement!;
    expect(header).not.toHaveTextContent('견적 내용');
    expect(header).not.toHaveTextContent('(선택)');
    const actions = screen.getByRole('group', { name: '작성 이동' });
    expect(within(actions).getByLabelText('질문 진행률')).toHaveTextContent('2 / ');
  });
  it('실제 작성에서는 사업자 확인 위에 단계 제목 줄을 두지 않는다', () => {
    render(<RfpCreateWizard pgList={[]} />);
    expect(screen.queryByText(/01 — /)).not.toBeInTheDocument();
  });
  it('첫 화면에도 이전·다음이 보이고 Enter로 견적 내용에 진입한다', async () => {
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} />);
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })).toBeInTheDocument();
    const actions = screen.getByRole('group', { name: '작성 이동' });
    expect(within(actions).getByRole('button', { name: '이전' })).toBeInTheDocument();
    expect(actions.contains(screen.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' }))).toBe(false);
  });
  it('사업자 확인에서 한글 조합·키 반복 Enter는 다음 단계로 이동하지 않는다', () => {
    render(<RfpCreateWizard pgList={[]} />);
    const focused = document.activeElement!;
    fireEvent.keyDown(focused, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(focused, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(focused, { key: 'Enter', repeat: true });
    fireEvent.keyDown(focused, { key: 'Enter', shiftKey: true });
    expect(screen.queryByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
  });
  it('현재 질문만 표시하며 다음 클릭 시 그 질문만 검증하고 이전 답을 보존한다', async () => {
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} step={2} />);
    expect(screen.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '사업 운영 홈페이지' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('의류')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('alert')).toHaveTextContent('홈페이지');
    await user.type(screen.getByRole('textbox'), 'example.com');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByRole('textbox')).toHaveValue('https://example.com');
  });
  it('질문이 바뀌면 모바일에서도 질문 제목이 보이도록 스크롤한다', async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    useRfpDraftStore.setState({ websiteUrl: 'https://example.com' });
    const user = userEvent.setup();
    render(<RfpCreateWizard pgList={[]} step={2} />);
    scrollIntoView.mockClear();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' })).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });
  it('질문 제목과 진행률은 답변 스크롤 영역 밖에 남는다', () => {
    render(<RfpCreateWizard pgList={[]} step={2} />);
    const answers = screen.getByTestId('rfp-question-scroll');
    expect(answers.contains(screen.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' }))).toBe(false);
    expect(answers.contains(screen.getByLabelText('질문 진행률'))).toBe(false);
    expect(answers.contains(screen.getByRole('textbox', { name: '사업 운영 홈페이지' }))).toBe(true);
  });

  it('Enter로 현재 질문을 검증해 이동하고 Shift+Enter로 이전 질문으로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const website = screen.getByRole('textbox', { name: '사업 운영 홈페이지' });
    website.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('홈페이지');
    await user.type(website, 'example.com');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' })).toBeInTheDocument();
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(screen.getByRole('textbox', { name: '사업 운영 홈페이지' })).toHaveValue('https://example.com');
  });

  it('서버가 거부한 홈페이지는 도메인만 다시 입력해도 Enter로 통과하지 않는다', async () => {
    const user = userEvent.setup();
    render(<RfpQuestionFlow websiteRejected="https://example.com" onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const website = screen.getByRole('textbox', { name: '사업 운영 홈페이지' });
    await user.type(website, 'example.com');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })).toBeInTheDocument();
    expect(website).toHaveValue('https://example.com');
  });

  it('여러 줄 입력에서 Enter와 Shift+Enter는 줄바꿈 동작을 유지한다', () => {
    useRfpDraftStore.setState({ contentQuestion: 'memo' });
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(screen.getByRole('heading')).toHaveTextContent('더 전달할 내용');
  });

  it('단일행 입력의 한글 조합·반복·수식 키 Enter는 이동시키지 않는다', () => {
    useRfpDraftStore.setState({ websiteUrl: 'https://example.com' });
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: '사업 운영 홈페이지' });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Enter', altKey: true });
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(screen.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })).toBeInTheDocument();
  });

  it('다음 버튼에 포커스한 Enter는 기본 버튼 동작으로 한 질문만 이동한다', async () => {
    useRfpDraftStore.setState({ websiteUrl: 'https://example.com' });
    render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    screen.getByRole('button', { name: '다음' }).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' })).toBeInTheDocument();
  });
});

describe('계약 유형 선택 표시', () => {
  beforeEach(() => useRfpDraftStore.getState().reset());

  it('체크 그림 없이 선택과 다시 해제 상태를 표시한다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content question="contract" onBack={vi.fn()} onNext={vi.fn()} />);
    const button = screen.getByRole('button', { name: '신규 계약' });

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('svg')).toBeNull();
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.querySelector('svg')).toBeNull();
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('svg')).toBeNull();
  });
});

describe('필수 업종 선택', () => {
  const groups = [
    { id: '65b84ea0-cfce-4f7f-b60d-3bfd065a1f11', name: '의류', pgWorkspaceIds: [] },
    { id: '65b84ea0-cfce-4f7f-b60d-3bfd065a1f12', name: '교육', pgWorkspaceIds: [] },
  ];
  beforeEach(() => { useRfpDraftStore.getState().reset(); refresh.mockClear(); });

  it('업종 질문 안내는 고정 헤더에 한 번만 표시한다', () => {
    useRfpDraftStore.setState({ contentQuestion: 'industry' });
    render(<RfpQuestionFlow industryGroups={groups} onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    const heading = screen.getByRole('heading', { name: '어떤 업종에 해당하나요?' });
    const guidance = '판매하는 상품이나 서비스에 가장 가까운 업종 하나를 선택해요. 찾는 업종이 없으면 직접 입력할 수 있어요.';
    expect(heading.parentElement).toHaveTextContent(guidance);
    expect(screen.getAllByText(guidance)).toHaveLength(1);
  });

  it('업종 이름을 선택해 ID를 저장하고 앞뒤 이동에서도 선택을 유지한다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'industry' });
    const user = userEvent.setup();
    render(<RfpQuestionFlow industryGroups={groups} onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('alert')).toHaveTextContent('업종');
    await user.click(screen.getByRole('button', { name: '기타 업종' }));
    await user.click(screen.getByRole('radio', { name: '교육' }));
    expect(useRfpDraftStore.getState().industryGroupId).toBe(groups[1].id);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('어떤 상품');
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByRole('radio', { name: '교육' })).toBeChecked();
  });

  it('빈 목록에서는 직접 입력하고 앞뒤 이동과 초안 복원 후에도 내용을 유지한다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'industry' });
    const user = userEvent.setup();
    render(<RfpQuestionFlow industryGroups={[]} onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: '업종 이름' }), '반려동물 방문 돌봄');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('어떤 상품');
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByRole('textbox', { name: '업종 이름' })).toHaveValue('반려동물 방문 돌봄');
    const saved = JSON.parse(localStorage.getItem('support-b-rfp-draft')!);
    expect(saved.state).toMatchObject({ industryMode: 'custom', customIndustryName: '반려동물 방문 돌봄' });
    await act(async () => {
      useRfpDraftStore.getState().reset();
      localStorage.setItem('support-b-rfp-draft', JSON.stringify(saved));
      await useRfpDraftStore.persist.rehydrate();
    });
    expect(screen.getByRole('textbox', { name: '업종 이름' })).toHaveValue('반려동물 방문 돌봄');
  });

  it('검색 결과가 없어도 직접 입력을 선택하고 검색어를 가져오며 방식 전환 시 내용을 보존한다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'industry' });
    const user = userEvent.setup();
    render(<RfpQuestionFlow industryGroups={groups} onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await user.type(screen.getByRole('searchbox', { name: '업종 검색' }), '방문 돌봄');
    expect(screen.queryByRole('radio', { name: '교육' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '업종을 직접 입력할게요' }));
    expect(screen.getByRole('textbox', { name: '업종 이름' })).toHaveValue('방문 돌봄');
    await user.click(screen.getByRole('button', { name: '검색 초기화' }));
    await user.click(screen.getByRole('button', { name: '기타 업종' }));
    await user.click(screen.getByRole('radio', { name: '교육' }));
    expect(screen.queryByRole('textbox', { name: '업종 이름' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '업종을 직접 입력할게요' }));
    expect(screen.getByRole('textbox', { name: '업종 이름' })).toHaveValue('방문 돌봄');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('어떤 상품');
  });

  it('직접 입력 공백과 100자 초과 초안은 다음으로 진행할 수 없다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'industry', industryMode: 'custom', customIndustryName: '가'.repeat(101) });
    const user = userEvent.setup();
    render(<RfpQuestionFlow industryGroups={groups} onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: '업종 이름' }));
    await user.type(screen.getByRole('textbox', { name: '업종 이름' }), '   ');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('어떤 업종');
  });

  it('업종을 건너뛴 기존 초안은 마지막 질문에서 업종 선택으로 돌아온다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'attachments', websiteUrl: 'https://example.com', title: '견적 요청', mainProducts: '의류', contractType: 'new', requiredPaymentMethods: ['card'], productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] } });
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<RfpQuestionFlow industryGroups={[]} onBack={vi.fn()} onNext={onNext} onQuestionChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '내용 확인하기' }));
    expect(screen.getByRole('heading')).toHaveTextContent('어떤 업종');
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('판매 정보 질문과 조건 분기', () => {
  beforeEach(() => useRfpDraftStore.getState().reset());
  const renderFlow = () => render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
  it('선택 질문을 건너뛰면 이전 답을 제거하고 필수 환금성 질문은 아니요로도 진행한다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'sellers', productInfo: { hasMarketplaceSellers: true } });
    const user = userEvent.setup(); renderFlow();
    await user.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(useRfpDraftStore.getState().productInfo.hasMarketplaceSellers).toBeUndefined();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '아니요' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('가장 비싼 상품');
    expect(useRfpDraftStore.getState().productInfo.cashConvertible).toBe(false);
  });
  it('판매 방식은 해당 없음과 다른 방식을 함께 저장하지 않는다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'sales' });
    const user = userEvent.setup(); renderFlow();
    await user.click(screen.getByRole('checkbox', { name: '해당 없음' }));
    await user.click(screen.getByRole('checkbox', { name: '구독형 판매' }));
    expect(useRfpDraftStore.getState().productInfo.salesMethods).toEqual(['subscription']);
    await user.click(screen.getByRole('checkbox', { name: '해당 없음' }));
    expect(useRfpDraftStore.getState().productInfo.salesMethods).toEqual(['none']);
  });
  it('신규 계약은 과거 거래액 질문을 생략하고 갱신은 필수 거래액 질문을 연다', async () => {
    useRfpDraftStore.setState({ contentQuestion: 'payment', contractType: 'new', requiredPaymentMethods: ['card'] });
    const user = userEvent.setup(); const view = renderFlow();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('제목');
    view.unmount();
    useRfpDraftStore.setState({ contentQuestion: 'payment', contractType: 'renewal' });
    renderFlow();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading')).toHaveTextContent('전년도 PG 거래액');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('alert')).toHaveTextContent('거래액');
  });
});
