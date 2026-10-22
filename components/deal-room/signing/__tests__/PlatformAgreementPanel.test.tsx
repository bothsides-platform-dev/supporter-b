import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/server/actions/signing/platformAgreementActions", () => ({
  loadPlatformAgreementAction: vi.fn(),
  savePlatformAgreementAction: vi.fn(),
  sendPlatformAgreementAction: vi.fn(),
}));
import {
  loadPlatformAgreementAction,
  savePlatformAgreementAction,
  sendPlatformAgreementAction,
} from "@/lib/server/actions/signing/platformAgreementActions";
import { PlatformAgreementPanel } from "../PlatformAgreementPanel";
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function retryFixture() {
  const party = { company: '구매회사', bizNo: '1234567890', address: '서울', representative: '대표' };
  const view = { ok: true, editable: true, contractId: 'c', revision: 1, stamp: 'current', canSign: true,
    parties: { buyer: party, platform: { ...party, company: '주식회사 노온' } },
    signer: { name: '담당자', email: 'buyer@test.com' }, snapshot: { agreement: { pgName: '선정 PG' }, feeRows: [] } };
  vi.mocked(loadPlatformAgreementAction).mockResolvedValue(view as never);
  vi.mocked(savePlatformAgreementAction).mockResolvedValue({ ok: true, revision: 2 });
  const BaseURL = URL;
  vi.stubGlobal('URL', class extends BaseURL {
    static createObjectURL() { return 'blob:test-agreement'; }
    static revokeObjectURL() {}
  });
  // Node 22의 Response는 jsdom Blob을 받지 못하므로, 이 화면이 읽는 응답만 모의한다.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['%PDF-test']) })));
  render(<PlatformAgreementPanel signing={{ contract: { id: 'c', kind: 'platform_buyer', status: 'awaiting_pg_template' }, participants: [] } as never} />);
  return view;
}
it("노온 정보는 고정 표시하고 구매사 정보 저장 후 미리보기를 확인해야 서명을 요청한다", async () => {
  const party = {
    company: "회사",
    bizNo: "1234567890",
    address: "서울",
    representative: "대표",
  };
  const view = {
    ok: true,
    editable: true,
    contractId: "c",
    revision: 0,
    stamp: "stamp",
    canSign: true,
    parties: { buyer: party, platform: { ...party, company: "주식회사 노온" } },
    signer: { name: "담당", email: "buyer@test.com" },
    snapshot: { agreement: { pgName: "선정 PG" }, feeRows: [] },
  };
  vi.mocked(loadPlatformAgreementAction).mockResolvedValue(view as never);
  vi.mocked(savePlatformAgreementAction).mockResolvedValue({
    ok: true,
    revision: 1,
  });
  render(
    <PlatformAgreementPanel
      signing={
        {
          contract: {
            id: "c",
            kind: "platform_buyer",
            status: "awaiting_pg_template",
          },
          participants: [],
        } as never
      }
    />,
  );
  expect(await screen.findByText("주식회사 노온")).toBeTruthy();
  expect(screen.getAllByRole("textbox")).toHaveLength(4);
  expect(screen.getByRole("button", { name: "서명 요청하기" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
  await waitFor(() =>
    expect(savePlatformAgreementAction).toHaveBeenCalledWith(
      expect.objectContaining({ parties: { buyer: party } }),
    ),
  );
  expect(sendPlatformAgreementAction).not.toHaveBeenCalled();
});

// Value: protects=failed saves preserve input and let buyers retry before preview/send;
// fails_when=failed save locks the form, drops edits, or enables sending;
// why_new=the existing panel case only checks a successful initial save;
// seam=none; no_claim=real browser navigation or provider acceptance.
it('저장 네트워크 실패 후 입력을 유지하고 다시 저장·미리볼 수 있다', async () => {
  retryFixture();
  const company = await screen.findByLabelText('구매사 상호');
  fireEvent.change(company, { target: { value: '다시 저장할 회사' } });
  vi.mocked(savePlatformAgreementAction).mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: '저장하고 미리보기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('저장 결과를 확인하지 못했어요');
  expect(company).toHaveValue('다시 저장할 회사');
  expect(screen.getByRole('button', { name: '서명 요청하기' })).toBeDisabled();
  expect(sendPlatformAgreementAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '저장하고 미리보기' }));
  expect(await screen.findByTitle('날인된 합의서 PDF')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: '서명 요청하기' })).toBeEnabled();
  expect(savePlatformAgreementAction).toHaveBeenCalledTimes(2);
  expect(sendPlatformAgreementAction).not.toHaveBeenCalled();
});

// Value: protects=lost send response switches to explicit recovery without duplicate send;
// fails_when=busy submit remains enabled or failed send automatically dispatches again;
// why_new=service recovery tests do not exercise the buyer panel's error/reload controls;
// seam=none; no_claim=provider-side idempotency or live signature completion.
it('발송 응답 유실 후에는 중복 요청 없이 발송 결과 확인으로 복구한다', async () => {
  const view = retryFixture();
  await screen.findByLabelText('구매사 상호');
  fireEvent.click(screen.getByRole('button', { name: '저장하고 미리보기' }));
  await screen.findByTitle('날인된 합의서 PDF');
  let rejectSend!: (reason: Error) => void;
  vi.mocked(sendPlatformAgreementAction).mockImplementationOnce(() => new Promise((_, reject) => { rejectSend = reject; }));
  fireEvent.click(screen.getByRole('button', { name: '서명 요청하기' }));
  const buttons = await screen.findAllByRole('button', { name: '서명 요청하기' });
  fireEvent.click(buttons[buttons.length - 1]);
  await waitFor(() => expect(sendPlatformAgreementAction).toHaveBeenCalledTimes(1));
  const sendButton = screen.getByRole('button', { name: '서명 요청하기' });
  expect(sendButton).toBeDisabled();
  fireEvent.click(sendButton);
  expect(sendPlatformAgreementAction).toHaveBeenCalledTimes(1);
  vi.mocked(loadPlatformAgreementAction).mockResolvedValue({ ...view, editable: false, stamp: 'recover', canSign: false } as never);
  rejectSend(new Error('response lost'));
  expect(await screen.findByRole('alert')).toHaveTextContent('발송 결과를 확인하지 못했어요');
  const recover = await screen.findByRole('button', { name: '발송 결과 확인하기' });
  expect(screen.queryByRole('button', { name: '서명 요청하기' })).toBeNull();
  expect(sendPlatformAgreementAction).toHaveBeenCalledTimes(1);
  vi.mocked(sendPlatformAgreementAction).mockResolvedValueOnce({ ok: true });
  fireEvent.click(recover);
  await waitFor(() => expect(sendPlatformAgreementAction).toHaveBeenCalledTimes(2));
  expect(sendPlatformAgreementAction).toHaveBeenLastCalledWith({ contractId: 'c', stamp: 'recover' });
  expect(await screen.findByRole('status')).toHaveTextContent('서명 요청 이메일을 확인해 주세요');
});
