import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// base-ui Menu/Dialog need these in jsdom.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// Server actions are 'use server' — mock them so the drawer drives the UI
// without a DB or session.
const sendChatMessageAction = vi.fn();
const listTemplatesAction = vi.fn();
const saveTemplateAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: (...args: unknown[]) => sendChatMessageAction(...args),
}));
vi.mock('@/lib/server/actions/chat/listTemplatesAction', () => ({
  listTemplatesAction: (...args: unknown[]) => listTemplatesAction(...args),
}));
vi.mock('@/lib/server/actions/chat/saveTemplateAction', () => ({
  saveTemplateAction: (...args: unknown[]) => saveTemplateAction(...args),
}));

// File upload goes through the shared ky `http` client — mock the upload so the
// drawer collects an attachment id without hitting /api/files/upload.
const httpPost = vi.fn();
vi.mock('@/lib/http', () => ({
  http: { post: (...args: unknown[]) => httpPost(...args) },
}));

afterEach(() => cleanup());
beforeEach(() => {
  sendChatMessageAction.mockReset().mockResolvedValue({ ok: true, conversationId: 'c1', messageId: 'm1' });
  listTemplatesAction.mockReset().mockResolvedValue({ ok: true, templates: [] });
  saveTemplateAction.mockReset().mockResolvedValue({ ok: true, templateId: 't1' });
  httpPost.mockReset();
});

import { MessageComposeButton } from '../MessageComposeButton';

const counterparty = { name: '(주)샘플테크', type: 'buyer' as const, workspaceId: 'ws-buyer-1' };
// Embed sites pass the RFP *uuid* in `code` (RfpBriefPanel: rfpContext.code = rfp.id).
const rfpContext = {
  code: '11111111-1111-1111-1111-111111111111',
  title: '온라인몰 결제대행 선정',
};

async function openComposeDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '(주)샘플테크 프로필' }));
  await user.click(await screen.findByRole('menuitem', { name: '채팅보내기' }));
}

describe('MessageComposeButton (rich compose drawer)', () => {
  it('프로필 클릭 → 채팅보내기 메뉴 → 컴포즈 드로어(받는사람 + RFP 컨텍스트)', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);

    expect(screen.queryByRole('button', { name: '메시지 보내기' })).not.toBeInTheDocument();

    await openComposeDrawer(user);

    expect(screen.getByPlaceholderText('상대에게 보낼 메시지를 입력하세요')).toBeInTheDocument();
    expect(screen.getByText('온라인몰 결제대행 선정', { exact: false })).toBeInTheDocument();
    // No 구현중 dialog anymore.
    expect(screen.queryByText('구현중입니다')).not.toBeInTheDocument();
  });

  it('드로어 열릴 때 저장된 템플릿을 불러오고, 선택하면 본문에 삽입한다', async () => {
    listTemplatesAction.mockResolvedValue({
      ok: true,
      templates: [
        {
          id: 't-1',
          workspaceId: 'ws-buyer-1',
          title: '인사 템플릿',
          body: '안녕하세요, 제안 잘 받았습니다.',
          createdBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);
    await openComposeDrawer(user);

    await waitFor(() => expect(listTemplatesAction).toHaveBeenCalled());

    // Open the template loader and pick the template.
    await user.click(screen.getByRole('button', { name: '저장된 템플릿 불러오기' }));
    await user.click(await screen.findByRole('menuitem', { name: /인사 템플릿/ }));

    const textarea = screen.getByPlaceholderText(
      '상대에게 보낼 메시지를 입력하세요',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toContain('안녕하세요, 제안 잘 받았습니다.');
  });

  it('"템플릿으로 저장" 클릭 시 현재 본문으로 saveTemplateAction을 호출한다', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);
    await openComposeDrawer(user);

    const textarea = screen.getByPlaceholderText('상대에게 보낼 메시지를 입력하세요');
    await user.type(textarea, '템플릿 본문입니다');
    await user.click(screen.getByRole('button', { name: '템플릿으로 저장' }));

    await waitFor(() =>
      expect(saveTemplateAction).toHaveBeenCalledWith(
        expect.objectContaining({ body: '템플릿 본문입니다' }),
      ),
    );
  });

  it('전송 시 sendChatMessageAction을 본문 + rfpId 태그와 함께 호출한다', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);
    await openComposeDrawer(user);

    await user.type(
      screen.getByPlaceholderText('상대에게 보낼 메시지를 입력하세요'),
      '보낼 메시지 본문',
    );
    await user.click(screen.getByRole('button', { name: '바로 전송' }));

    await waitFor(() =>
      expect(sendChatMessageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          counterpartyWorkspaceId: 'ws-buyer-1',
          body: '보낼 메시지 본문',
          rfpId: '11111111-1111-1111-1111-111111111111',
        }),
      ),
    );
  });

  it('f.type이 빈 문자열인 PDF 파일도 확장자 기반으로 첨부 칩에 노출된다', async () => {
    httpPost.mockReturnValue({
      json: () => Promise.resolve({ id: 'att-empty-mime', name: '보고서.pdf', size: 2048 }),
    });
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);
    await openComposeDrawer(user);

    // type: '' simulates a browser/OS that doesn't report a MIME for PDF files
    const file = new File([new Uint8Array([1, 2, 3])], '보고서.pdf', { type: '' });
    const input = screen.getByLabelText('파일 첨부', { selector: 'input[type="file"]' });
    await user.upload(input, file);

    // Chip must appear — currently silently dropped because ACCEPTED_MIMES.has('') === false
    expect(await screen.findByText('보고서.pdf')).toBeInTheDocument();
    await waitFor(() => expect(httpPost).toHaveBeenCalled());
  });

  it('첨부 추가 → 칩 노출 → 전송 시 attachmentIds 포함, 제거하면 빠진다', async () => {
    httpPost.mockReturnValue({
      json: () => Promise.resolve({ id: 'att-1', name: '제안서.pdf', size: 1234 }),
    });
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);
    await openComposeDrawer(user);

    const file = new File([new Uint8Array([1, 2, 3])], '제안서.pdf', {
      type: 'application/pdf',
    });
    const input = screen.getByLabelText('파일 첨부', { selector: 'input[type="file"]' });
    await user.upload(input, file);

    // Chip shows the uploaded file.
    expect(await screen.findByText('제안서.pdf')).toBeInTheDocument();
    await waitFor(() => expect(httpPost).toHaveBeenCalled());

    // Send carries the attachment id.
    await user.click(screen.getByRole('button', { name: '바로 전송' }));
    await waitFor(() =>
      expect(sendChatMessageAction).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ['att-1'] }),
      ),
    );

    // Reopen and remove the chip → no attachmentIds on the next send.
    cleanup();
    sendChatMessageAction.mockClear();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);
    await openComposeDrawer(user);
    await user.upload(
      screen.getByLabelText('파일 첨부', { selector: 'input[type="file"]' }),
      file,
    );
    const chip = await screen.findByText('제안서.pdf');
    const chipRow = chip.closest('[data-slot="attachment-chip"]') as HTMLElement;
    await user.click(within(chipRow).getByRole('button', { name: /제거/ }));
    await waitFor(() => expect(screen.queryByText('제안서.pdf')).not.toBeInTheDocument());

    await user.type(
      screen.getByPlaceholderText('상대에게 보낼 메시지를 입력하세요'),
      '본문만',
    );
    await user.click(screen.getByRole('button', { name: '바로 전송' }));
    await waitFor(() =>
      expect(sendChatMessageAction).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: [] }),
      ),
    );
  });

});
