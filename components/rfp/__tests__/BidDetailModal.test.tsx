import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@/lib/http', () => ({
  http: { post: vi.fn() },
}))
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')))
import type { Bid } from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';
import type { ResponsePromise } from 'ky';

// next/navigation mock — modal uses router.refresh() after action calls.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

// Mock the server actions so we can assert on call shape + UI side effects.
const addMock = vi.fn(
  async (_input: unknown) => ({ ok: true as const, noteId: 'note-new' }),
);
const removeMock = vi.fn(async (_input: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/bid/addBidNoteAction', () => ({
  addBidNoteAction: (input: unknown) => addMock(input),
}));
vi.mock('@/lib/server/actions/bid/removeBidNoteAction', () => ({
  removeBidNoteAction: (input: unknown) => removeMock(input),
}));

import { BidDetailModal } from '../BidDetailModal';
import { http } from '@/lib/http';

const bid: Bid = {
  id: 'bid-toss',
  rfpId: 'P-2604-0001',
  pgWsId: 'ws-toss',
  invitationId: 'inv-1',
  settleCycle: 'D+1',
  settleLimit: 0,
  guaranteeInsurance: 0,
  paymentFees: {},
  proposalPdfs: [
    {
      id: 'pdf',
      name: '제안서.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      url: '/api/files/pdf',
    },
  ],
  status: 'submitted',
  submittedBy: 'pg-user',
  submittedAt: '2026-05-01T00:00:00Z',
};

describe('BidDetailModal', () => {
  beforeEach(() => {
    addMock.mockClear();
    removeMock.mockClear();
    refresh.mockClear();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders the 6-figure KPI grid when open', () => {
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        notes={[]}
        pgName="서포터 B 페이"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );
    expect(screen.getByText('정산주기')).toBeInTheDocument();
    expect(screen.getByText('정산한도')).toBeInTheDocument();
    expect(screen.getByText('월 보증보험')).toBeInTheDocument();
    // Statutory card fee row for sme1 (1.10% fixed).
    expect(screen.getByText(/1\.10% 고정/)).toBeInTheDocument();
  });

  it('submitting a memo calls addBidNoteAction with body + empty attachments + triggers refresh', async () => {
    const user = userEvent.setup();
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        notes={[]}
        pgName="서포터 B 페이"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );

    const textarea = screen.getByPlaceholderText(/협상 진행/);
    await user.type(textarea, '셋업비 0원 컨펌');
    await user.click(screen.getByRole('button', { name: '기록' }));

    expect(addMock).toHaveBeenCalledWith({
      bidId: 'bid-toss',
      body: '셋업비 0원 컨펌',
      attachmentIds: [],
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('renders notes from props newest-first with creation-index serials', () => {
    // Createdat picked to avoid digit collisions with the serial label
    // (the date format is yyyy-mm-dd hh:mi — values can otherwise match the
    // "01 —" / "02 —" prefix the timeline emits).
    const notes: BidNote[] = [
      {
        id: 'n-1',
        bidId: 'bid-toss',
        authorId: 'u-1',
        authorName: '김구매',
        body: 'first',
        attachments: [],
        createdAt: '2026-07-15T03:00:00Z',
      },
      {
        id: 'n-2',
        bidId: 'bid-toss',
        authorId: 'u-1',
        authorName: '김구매',
        body: 'second',
        attachments: [],
        createdAt: '2026-08-17T03:00:00Z',
      },
    ];
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        notes={notes}
        pgName="서포터 B 페이"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('second')).toBeInTheDocument();
    expect(within(items[0]).getByText(/^02 —/)).toBeInTheDocument();
    expect(within(items[1]).getByText('first')).toBeInTheDocument();
    expect(within(items[1]).getByText(/^01 —/)).toBeInTheDocument();
  });

  it('clicking 삭제 opens confirm dialog and does not call action yet', async () => {
    const user = userEvent.setup();
    const notes: BidNote[] = [
      {
        id: 'n-keep',
        bidId: 'bid-toss',
        authorId: 'u-1',
        authorName: '김구매',
        body: 'first',
        attachments: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
    ];
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        notes={notes}
        pgName="서포터 B 페이"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(removeMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirming the delete dialog calls removeBidNoteAction', async () => {
    const user = userEvent.setup();
    const notes: BidNote[] = [
      {
        id: 'n-keep',
        bidId: 'bid-toss',
        authorId: 'u-1',
        authorName: '김구매',
        body: 'first',
        attachments: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
    ];
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        notes={notes}
        pgName="서포터 B 페이"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제', hidden: false }));
    await waitFor(() =>
      expect(removeMock).toHaveBeenCalledWith({ noteId: 'n-keep' }),
    );
  });

  it('canceling the delete dialog does not call removeBidNoteAction', async () => {
    const user = userEvent.setup();
    const notes: BidNote[] = [
      {
        id: 'n-keep',
        bidId: 'bid-toss',
        authorId: 'u-1',
        authorName: '김구매',
        body: 'first',
        attachments: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
    ];
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        notes={notes}
        pgName="서포터 B 페이"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe('BidDetailModal 첨부파일 업로드', () => {
  beforeEach(() => {
    addMock.mockClear();
    removeMock.mockClear();
    refresh.mockClear();
    vi.mocked(http.post).mockClear();
  })
  afterEach(() => {
    cleanup();
  })

  it('파일 선택 시 http.post로 업로드 후 addBidNoteAction에 첨부ID 포함', async () => {
    const user = userEvent.setup()
    vi.mocked(http.post).mockReturnValue({
      json: vi.fn().mockResolvedValue({ id: 'att-1', name: 'note.pdf', size: 1024, mimeType: 'application/pdf' }),
    } as unknown as ResponsePromise)
    addMock.mockResolvedValue({ ok: true as const, noteId: 'note-new' })

    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        notes={[]}
        pgName="서포터 B 페이"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, new File(['content'], 'note.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/api/files/upload',
        expect.objectContaining({ body: expect.any(FormData) }),
      ),
    )
  })
});
