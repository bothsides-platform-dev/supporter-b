import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HTTPError } from 'ky'
import type { NormalizedOptions } from 'ky'

const uploadAttachment = vi.fn()
vi.mock('@/lib/attachments/upload-client', () => ({
  uploadAttachment: (...a: unknown[]) => uploadAttachment(...a),
}))

import { RfpAttachmentDropzone } from '../RfpAttachmentDropzone'
import { DRAFT_OWNER_ID } from '@/lib/server/storage/constants'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
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
