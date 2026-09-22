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
    .mockResolvedValueOnce(view)
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
  fireEvent.click(await screen.findByRole('button', { name: '이어서 작성하기' }));
  fireEvent.click(screen.getByRole('button', { name: '미리보기 확인하기' }));
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
  vi.mocked(saveAgreementAction).mockResolvedValue({ ok: true, revision: 2 });
  render(
    <StrictMode>
      <AgreementPanel signing={signing} side="pg">
        기존
      </AgreementPanel>
    </StrictMode>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '이어서 작성하기' }));
  fireEvent.click(screen.getByRole('button', { name: '임시 저장' }));
  expect(await screen.findByText('회사 정보를 저장했어요.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '미리보기 확인하기' })).toBeEnabled();
});

it('저장한 초안은 이어서 열어 기존 회사 정보를 편집한다', async () => {
  render(<AgreementPanel signing={signing} side="pg">기존</AgreementPanel>);
  fireEvent.click(await screen.findByRole('button', { name: '이어서 작성하기' }));
  expect(screen.getByLabelText('구매사 상호')).toHaveValue('구매회사');
});
