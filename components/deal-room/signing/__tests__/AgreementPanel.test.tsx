import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgreementPanel } from '../AgreementPanel';
import {
  getAgreementAction,
  saveAgreementAction,
  sendAgreementAction,
} from '@/lib/server/actions/signing/agreementActions';
import type { SigningView } from '@/lib/types/signing';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/server/actions/signing/agreementActions', () => ({
  getAgreementAction: vi.fn(),
  saveAgreementAction: vi.fn(),
  sendAgreementAction: vi.fn(),
}));
const signing = {
  contract: { id: 'sc1', status: 'awaiting_pg_template' },
  participants: [],
} as unknown as SigningView;
const party = {
  company: '구매회사',
  bizNo: '1234567890',
  address: '서울',
  representative: '김대표',
};
const view = {
  ok: true as const,
  mode: 'agreement' as const,
  editable: true,
  revision: 1,
  contractId: 'sc1',
  rfpCode: 'P-0001',
  parties: { buyer: party, pg: { ...party, company: '결제회사' } },
  fees: [
    {
      label: '계좌이체',
      standard: '2.00%',
      discount: '0.20%p',
      value: '1.80%',
    },
  ],
  signers: {
    buyer: { name: '구매담당', email: 'buyer@example.com' },
    pg: { name: 'PG담당', email: 'pg@example.com' },
  },
  stamp: 'stamp1',
  sendReadiness: { buyer: true, pg: true },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAgreementAction).mockResolvedValue(view);
});
afterEach(() => vi.unstubAllGlobals());
it('발송 결과 확인 중에는 중복 요청을 막고 연결 오류를 화면에 남긴다', async () => {
  vi.mocked(getAgreementAction).mockResolvedValue({
    ...view,
    editable: false,
    stamp: 'recover',
  });
  let reject!: (error: Error) => void;
  vi.mocked(sendAgreementAction).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  render(
    <AgreementPanel signing={signing} side="pg">
      기존
    </AgreementPanel>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '발송 결과 확인하기' }));
  expect(screen.getByRole('button', { name: /발송 결과 확인|확인 중/ })).toBeDisabled();
  reject(new Error('offline'));
  expect(await screen.findByRole('alert')).toHaveTextContent('발송 결과를 확인하지 못했어요');
  expect(screen.getByRole('button', { name: '발송 결과 확인하기' })).toBeEnabled();
});
it('DB가 JSON 필드 순서를 바꿔 반환해도 같은 회사 정보면 미리보기와 발송 버튼을 표시한다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('%PDF-test', {
          headers: { 'Content-Type': 'application/pdf' },
        }),
    ),
  );
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:preview';
      }
      static revokeObjectURL() {}
    },
  );
  vi.mocked(saveAgreementAction).mockResolvedValue({ ok: true, revision: 2 });
  vi.mocked(getAgreementAction)
    .mockResolvedValueOnce({ ...view, revision: 0 })
    .mockResolvedValue({
      ...view,
      revision: 2,
      parties: { pg: view.parties.pg, buyer: view.parties.buyer },
    });
  render(
    <AgreementPanel signing={signing} side="pg">
      기존
    </AgreementPanel>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '합의서 작성하기' }));
  fireEvent.click(screen.getByRole('button', { name: '저장하고 미리보기' }));
  expect(await screen.findByTitle('발송할 합의서 PDF')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '양측에 서명 요청하기' })).toBeEnabled();
});

it('PG는 회사 정보만 편집하고 선정 수수료는 읽기 전용으로 본다', async () => {
  render(
    <AgreementPanel signing={signing} side="pg">
      <div>기존 PDF 업로드</div>
    </AgreementPanel>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '이어서 작성하기' }));
  expect(screen.getByLabelText('구매사 상호')).toHaveValue('구매회사');
  expect(screen.getAllByText('1.80%').length).toBeGreaterThan(0);
  expect(screen.queryByDisplayValue('1.80')).not.toBeInTheDocument();
  expect(screen.queryByText('기존 PDF 업로드')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('구매사 상호'), {
    target: { value: '바꾼 회사' },
  });
  vi.mocked(saveAgreementAction).mockResolvedValue({
    ok: false,
    error: 'AGREEMENT_CHANGED',
  });
  fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('바뀌었어요');
  expect(screen.getByLabelText('구매사 상호')).toHaveValue('바꾼 회사');
  expect(screen.getByRole('button', { name: '양측에 서명 요청하기' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '최신 정보 다시 불러오기' }));
  expect(await screen.findByText('입력한 내용을 최신 저장본으로 바꿀까요?')).toBeInTheDocument();
  vi.mocked(getAgreementAction).mockResolvedValue({
    ...view,
    revision: 3,
    parties: {
      ...view.parties,
      buyer: { ...party, company: '동료가 저장한 회사' },
    },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장본 불러오기' }));
  expect(await screen.findByDisplayValue('동료가 저장한 회사')).toBeInTheDocument();
});
it('구매사의 발송 전 화면에는 회사 정보 편집과 서명 요청 버튼이 없다', async () => {
  vi.mocked(getAgreementAction).mockResolvedValue({
    ...view,
    editable: false,
    parties: undefined,
    signers: undefined,
    stamp: undefined,
  });
  render(
    <AgreementPanel signing={signing} side="buyer">
      <div>기존 PDF 업로드</div>
    </AgreementPanel>,
  );
  expect(await screen.findByText('PG사가 합의서를 준비하고 있어요')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '이어서 작성하기' })).not.toBeInTheDocument();
});
it('레거시 계약은 기존 관리 화면을 유지한다', async () => {
  vi.mocked(getAgreementAction).mockResolvedValue({ ok: true, mode: 'legacy' });
  render(
    <AgreementPanel signing={signing} side="pg">
      <div>기존 계약 관리</div>
    </AgreementPanel>,
  );
  await waitFor(() => expect(screen.getByText('기존 계약 관리')).toBeInTheDocument());
});
it('StrictMode에서도 저장을 완료하고 다음 미리보기를 진행할 수 있다', async () => {
  vi.mocked(getAgreementAction).mockResolvedValue({ ...view, revision: 0 });
  vi.mocked(saveAgreementAction).mockResolvedValue({ ok: true, revision: 2 });
  render(
    <StrictMode>
      <AgreementPanel signing={signing} side="pg">
        기존
      </AgreementPanel>
    </StrictMode>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '합의서 작성하기' }));
  vi.mocked(getAgreementAction).mockResolvedValue({ ...view, revision: 2 });
  fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
  expect(await screen.findByText('회사 정보를 저장했어요.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '저장하고 미리보기' })).toBeEnabled();
});

async function openEditor() {
  render(
    <AgreementPanel signing={signing} side="pg">
      기존
    </AgreementPanel>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '이어서 작성하기' }));
}

function mockPdf() {
  const fetchPdf = vi.fn(
    async () =>
      new Response('%PDF-test', {
        headers: { 'Content-Type': 'application/pdf' },
      }),
  );
  vi.stubGlobal('fetch', fetchPdf);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:preview';
      }
      static revokeObjectURL() {}
    },
  );
  vi.mocked(saveAgreementAction).mockResolvedValue({ ok: true, revision: 2 });
  return fetchPdf;
}

const previewButton = () =>
  screen.getByRole('button', {
    name: /미리보기 확인하기|저장하고 미리보기|미리보기 다시 만들기/,
  });

it('확인한 PDF는 변경 없는 임시 저장으로 사라지지 않는다', async () => {
  mockPdf();
  await openEditor();
  fireEvent.click(previewButton());
  expect(await screen.findByTitle('발송할 합의서 PDF')).toBeInTheDocument();
  const saves = vi.mocked(saveAgreementAction).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
  expect(screen.getByTitle('발송할 합의서 PDF')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '양측에 서명 요청하기' })).toBeEnabled();
  expect(saveAgreementAction).toHaveBeenCalledTimes(saves);
});

it('미리보기 탭에서 필수값 오류가 나면 입력 탭의 첫 오류로 이동한다', async () => {
  vi.mocked(getAgreementAction).mockResolvedValue({
    ...view,
    parties: { ...view.parties, buyer: { ...party, address: '' } },
  });
  await openEditor();
  fireEvent.click(screen.getByRole('button', { name: '합의서 미리보기' }));
  fireEvent.click(previewButton());
  await waitFor(() => expect(screen.getByLabelText('구매사 주소')).toHaveFocus());
  expect(screen.getByLabelText('구매사 주소')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('button', { name: '정보 입력' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('구매사 주소');
  expect(screen.queryByRole('button', { name: '최신 정보 다시 불러오기' })).not.toBeInTheDocument();
  expect(saveAgreementAction).not.toHaveBeenCalled();
});

it('연결 오류는 입력을 보존한 저장 재시도를 제공하고 최신본 덮어쓰기를 권하지 않는다', async () => {
  vi.mocked(saveAgreementAction)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ok: true, revision: 2 });
  await openEditor();
  fireEvent.change(screen.getByLabelText('구매사 주소'), {
    target: { value: '바꾼 주소' },
  });
  fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: '최신 정보 다시 불러오기' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('구매사 주소')).toHaveValue('바꾼 주소');
  vi.mocked(getAgreementAction).mockResolvedValue({
    ...view,
    revision: 2,
    parties: { ...view.parties, buyer: { ...party, address: '바꾼 주소' } },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장 다시 시도하기' }));
  expect(await screen.findByText('회사 정보를 저장했어요.')).toBeInTheDocument();
  expect(screen.getByLabelText('구매사 주소')).toHaveValue('바꾼 주소');
});

it('PDF 실패 후 재시도는 저장된 판본을 다시 저장하지 않고 PDF만 생성한다', async () => {
  const fetchPdf = mockPdf();
  fetchPdf.mockResolvedValueOnce(new Response('잠시 후 다시 확인해 주세요.', { status: 429 }));
  await openEditor();
  fireEvent.click(previewButton());
  await screen.findByRole('alert');
  const saves = vi.mocked(saveAgreementAction).mock.calls.length;
  expect(screen.queryByRole('button', { name: '최신 정보 다시 불러오기' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '미리보기 다시 시도하기' }));
  expect(await screen.findByTitle('발송할 합의서 PDF')).toBeInTheDocument();
  expect(saveAgreementAction).toHaveBeenCalledTimes(saves);
});

it('저장은 성공했지만 재조회가 실패하면 다시 저장하지 않고 상태를 재조회한다', async () => {
  vi.mocked(saveAgreementAction).mockResolvedValue({ ok: true, revision: 2 });
  await openEditor();
  fireEvent.change(screen.getByLabelText('구매사 주소'), {
    target: { value: '저장한 주소' },
  });
  vi.mocked(getAgreementAction).mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
  await screen.findByRole('alert');
  vi.mocked(getAgreementAction).mockResolvedValue({
    ...view,
    revision: 2,
    parties: { ...view.parties, buyer: { ...party, address: '저장한 주소' } },
  });
  fireEvent.click(screen.getByRole('button', { name: '최신 상태 확인하기' }));
  expect(await screen.findByText('최신 서명 준비 상태를 확인했어요.')).toBeInTheDocument();
  expect(screen.getByLabelText('구매사 주소')).toHaveValue('저장한 주소');
  expect(saveAgreementAction).toHaveBeenCalledTimes(1);
});

it('구매사 인증 미준비를 먼저 알리고 준비 상태 재조회가 작성 내용을 지우지 않는다', async () => {
  mockPdf();
  vi.mocked(getAgreementAction).mockResolvedValue({
    ...view,
    sendReadiness: { buyer: false, pg: true },
  });
  await openEditor();
  expect(screen.getByText(/구매사 담당자에게.*인증/)).toBeInTheDocument();
  fireEvent.click(previewButton());
  await screen.findByTitle('발송할 합의서 PDF');
  expect(screen.getByRole('button', { name: '양측에 서명 요청하기' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('구매사 주소'), {
    target: { value: '보존할 주소' },
  });
  vi.mocked(getAgreementAction).mockResolvedValue({
    ...view,
    stamp: 'after-phone',
  });
  fireEvent.click(screen.getByRole('button', { name: '서명 준비 상태 확인' }));
  await waitFor(() =>
    expect(screen.queryByText(/구매사 담당자에게.*인증/)).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText('구매사 주소')).toHaveValue('보존할 주소');
  expect(screen.queryByTitle('발송할 합의서 PDF')).not.toBeInTheDocument();
});

it('최종 재검증의 인증 오류는 합의서에서 사용할 수 없는 업로드를 안내하지 않는다', async () => {
  mockPdf();
  vi.mocked(sendAgreementAction).mockResolvedValue({
    ok: false,
    error: 'BUYER_PHONE_REQUIRED',
  });
  await openEditor();
  fireEvent.click(previewButton());
  await screen.findByTitle('발송할 합의서 PDF');
  fireEvent.click(screen.getByRole('button', { name: '양측에 서명 요청하기' }));
  fireEvent.click(screen.getByRole('button', { name: '서명 요청하기' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('구매사');
  expect(alert).not.toHaveTextContent('직접 올려');
  expect(screen.queryByRole('button', { name: '최신 정보 다시 불러오기' })).not.toBeInTheDocument();
});

it('저장하는 동안 저장 버튼에서 진행을 알린다', async () => {
  vi.mocked(saveAgreementAction).mockReturnValue(new Promise(() => {}));
  await openEditor();
  fireEvent.change(screen.getByLabelText('구매사 주소'), {
    target: { value: '바꾼 주소' },
  });
  fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
  expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: /저장하고 미리보기|미리보기 확인하기/ }),
  ).toBeDisabled();
});

it('PDF를 만드는 동안 미리보기 버튼과 영역에서 진행을 알린다', async () => {
  mockPdf().mockReturnValue(new Promise(() => {}));
  await openEditor();
  fireEvent.click(previewButton());
  expect(await screen.findByRole('button', { name: '미리보기 만드는 중…' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('합의서 PDF를 만들고 있어요');
});

it('저장한 초안은 이어서 열어 기존 회사 정보를 편집한다', async () => {
  render(<AgreementPanel signing={signing} side="pg">기존</AgreementPanel>);
  fireEvent.click(await screen.findByRole('button', { name: '이어서 작성하기' }));
  expect(screen.getByLabelText('구매사 상호')).toHaveValue('구매회사');
});
