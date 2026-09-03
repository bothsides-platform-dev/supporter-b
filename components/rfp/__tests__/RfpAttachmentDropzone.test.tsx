import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HTTPError } from 'ky'
import type { NormalizedOptions } from 'ky'

const uploadAttachment = vi.fn()
const toastMock = vi.fn()
const httpDelete = vi.fn()
const closeToast = vi.fn()
vi.mock('@/lib/attachments/upload-client', () => ({
  uploadAttachment: (...a: unknown[]) => uploadAttachment(...a),
}))
vi.mock('@/lib/toast', () => ({
  toast: (...a: unknown[]) => toastMock(...a),
  toastManager: { close: (...a: unknown[]) => closeToast(...a) },
}))
vi.mock('@/lib/http', () => ({
  http: { delete: (...a: unknown[]) => httpDelete(...a) },
}))

import { RfpAttachmentDropzone } from '../RfpAttachmentDropzone'
import { DRAFT_OWNER_ID } from '@/lib/server/storage/constants'

beforeEach(() => {
  toastMock.mockReturnValue('delete-toast')
  httpDelete.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  toastMock.mockReset()
  httpDelete.mockReset()
  closeToast.mockReset()
})

describe('RfpAttachmentDropzone 파일 업로드', () => {
  // 회귀: v0.4.12.0 이 `outline` 을 텍스트에서 걷어내면서 지시문과 힌트가 같은
  // 톤·크기(`md-label-small` + on-surface-variant)로 붙어 위계가 사라졌다.
  // DESIGN.md §2 — 보조 텍스트 아래 위계는 색이 아니라 타입스케일로 만든다.
  it('첨부 지시문과 용량 힌트는 크기·톤이 서로 다르다', () => {
    render(<RfpAttachmentDropzone value={[]} onChange={vi.fn()} />)

    const instruction = screen.getByText('파일을 끌어다 놓거나 클릭하여 첨부')
    const hint = screen.getByText(/PDF \/ PNG \/ JPEG/)

    expect(instruction).toHaveClass('md-label-large')
    expect(instruction).toHaveClass('text-[var(--md-sys-color-on-surface)]')
    expect(hint).toHaveClass('md-label-small')
    expect(hint).toHaveClass('text-[var(--md-sys-color-on-surface-variant)]')
    expect(
      instruction.className,
      '지시문과 힌트가 같은 표기로 다시 붙었다',
    ).not.toBe(hint.className)
  })

  it('ready 파일은 눈에 띄는 휴지통 삭제 버튼으로 제거한다', async () => {
    const onChange = vi.fn()
    render(
      <RfpAttachmentDropzone
        value={[{ id: 'att-1', name: 'doc.pdf', size: 2048 }]}
        onChange={onChange}
      />,
    )

    const button = screen.getByRole('button', { name: 'doc.pdf 삭제' })
    expect(button).toHaveClass('h-8')
    expect(button.querySelector('svg')).not.toBeNull()

    await userEvent.click(button)
    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument()
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]))
  })

  it('업로드 중인 파일의 삭제 버튼은 비활성화한다', async () => {
    uploadAttachment.mockReturnValue(new Promise(() => {}))
    render(<RfpAttachmentDropzone value={[]} onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'pending.pdf', { type: 'application/pdf' }))

    expect(await screen.findByRole('button', { name: 'pending.pdf 삭제' })).toBeDisabled()
  })

  it('삭제 토스트의 되돌리기로 파일을 원래 순서에 복원한다', async () => {
    render(
      <RfpAttachmentDropzone
        value={[
          { id: 'att-1', name: 'first.pdf', size: 1 },
          { id: 'att-2', name: 'second.pdf', size: 2 },
        ]}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'first.pdf 삭제' }))
    const options = toastMock.mock.calls[0][1]
    act(() => options.action.onClick())
    act(() => options.onClose())

    expect(screen.getAllByText(/\.pdf$/).map((node) => node.textContent)).toEqual([
      'first.pdf',
      'second.pdf',
    ])
    expect(httpDelete).not.toHaveBeenCalled()
  })

  it('연속 삭제는 하나의 토스트에서 모두 원래 순서로 되돌린다', async () => {
    render(
      <RfpAttachmentDropzone
        value={[
          { id: 'att-1', name: 'first.pdf', size: 1 },
          { id: 'att-2', name: 'second.pdf', size: 2 },
          { id: 'att-3', name: 'third.pdf', size: 3 },
        ]}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'first.pdf 삭제' }))
    await userEvent.click(screen.getByRole('button', { name: 'second.pdf 삭제' }))
    await userEvent.click(screen.getByRole('button', { name: 'third.pdf 삭제' }))

    expect(toastMock.mock.calls[1][1].id).toBe('delete-toast')
    expect(toastMock.mock.calls[2][1].id).toBe('delete-toast')
    act(() => toastMock.mock.calls[2][1].action.onClick())

    expect(screen.getAllByText(/\.pdf$/).map((node) => node.textContent)).toEqual([
      'first.pdf',
      'second.pdf',
      'third.pdf',
    ])
  })

  it('삭제를 되돌릴 수 있는 동안에는 최대 개수 슬롯을 예약한다', async () => {
    render(
      <RfpAttachmentDropzone
        value={Array.from({ length: 5 }, (_, index) => ({
          id: `att-${index}`,
          name: `${index}.pdf`,
          size: index + 1,
        }))}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '0.pdf 삭제' }))

    expect(screen.queryByText('파일을 끌어다 놓거나 클릭하여 첨부')).not.toBeInTheDocument()
  })

  it('되돌리지 않고 토스트가 닫히면 서버에서 ready 파일을 삭제한다', async () => {
    render(
      <RfpAttachmentDropzone
        value={[{ id: 'att-1', name: 'doc.pdf', size: 1 }]}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'doc.pdf 삭제' }))
    expect(toastMock).toHaveBeenCalledWith(
      '파일을 삭제했어요',
      expect.objectContaining({ timeout: 5000 }),
    )
    await act(async () => toastMock.mock.calls[0][1].onClose())

    expect(httpDelete).toHaveBeenCalledWith('/api/files/att-1')
  })

  it('sampleMode 삭제는 토스트가 닫혀도 서버를 호출하지 않는다', async () => {
    render(
      <RfpAttachmentDropzone
        value={[{ id: 'sample-1', name: 'sample.pdf', size: 1 }]}
        onChange={vi.fn()}
        sampleMode
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'sample.pdf 삭제' }))
    await act(async () => toastMock.mock.calls[0][1].onClose())

    expect(httpDelete).not.toHaveBeenCalled()
  })

  it('컴포넌트가 사라질 때 삭제 토스트를 닫아 정리한다', async () => {
    const { unmount } = render(
      <RfpAttachmentDropzone
        value={[{ id: 'att-1', name: 'doc.pdf', size: 1 }]}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'doc.pdf 삭제' }))
    unmount()

    expect(closeToast).toHaveBeenCalledWith('delete-toast')
  })

  it('파일 선택 시 uploadAttachment로 업로드 성공', async () => {
    const user = userEvent.setup()
    uploadAttachment.mockResolvedValue({ id: 'att-1', name: 'doc.pdf', size: 2048, mimeType: 'application/pdf' })

    render(<RfpAttachmentDropzone value={[]} onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['content'], 'doc.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(uploadAttachment).toHaveBeenCalledWith(expect.any(File), {
        ownerKind: 'rfp',
        ownerId: DRAFT_OWNER_ID,
      }),
    )
  })

  // 회귀: 숨김 파일 input이 `sr-only`(=position:absolute)를 쓰면, 긴 폼 안에서
  // absolute 박스가 스크롤 컨테이너를 빠져나가 document 높이를 늘려 위저드 하단에
  // 빈 스크롤 영역을 만든다. 보이지 않고 ref.click()로만 트리거되므로 `hidden`
  // (display:none)이어야 한다.
  it('숨김 파일 input은 sr-only가 아니라 hidden 이어야 한다', () => {
    render(<RfpAttachmentDropzone value={[]} onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.classList.contains('hidden')).toBe(true)
    expect(input.classList.contains('sr-only')).toBe(false)
  })

  it('415 응답 시 형식 오류 메시지 표시', async () => {
    const user = userEvent.setup()
    const error415 = new HTTPError(
      new Response('', { status: 415 }),
      new Request('http://localhost/api/files/att/complete'),
      {} as unknown as NormalizedOptions,
    )
    uploadAttachment.mockRejectedValue(error415)

    render(<RfpAttachmentDropzone value={[]} onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['x'], 'file.png', { type: 'image/png' }))

    await waitFor(() =>
      expect(screen.getByTitle('지원되지 않는 파일 형식입니다 (PDF/PNG/JPEG만 허용)')).toBeInTheDocument(),
    )
  })

  it('sampleMode에서는 업로드 호출 없이 즉시 ready 행으로 추가한다 (튜토리얼 샌드박스)', async () => {
    const onChange = vi.fn();
    render(<RfpAttachmentDropzone value={[]} onChange={onChange} sampleMode />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['x'], 'sample.pdf', { type: 'application/pdf' }));

    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(screen.getByText('sample.pdf')).toBeInTheDocument();
    expect(screen.queryByText('UPLOADING…')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'sample.pdf', status: 'ready' }),
      ]),
    );
  })
})
