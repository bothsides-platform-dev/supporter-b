import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HTTPError } from 'ky'
import type { NormalizedOptions, ResponsePromise } from 'ky'

vi.mock('@/lib/http', () => ({
  http: { post: vi.fn() },
}))
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')))

import { http } from '@/lib/http'
import { RfpAttachmentDropzone } from '../RfpAttachmentDropzone'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('RfpAttachmentDropzone 파일 업로드', () => {
  it('파일 선택 시 http.post로 업로드 성공', async () => {
    const user = userEvent.setup()
    vi.mocked(http.post).mockReturnValue({
      json: vi.fn().mockResolvedValue({ id: 'att-1', name: 'doc.pdf', size: 2048 }),
    } as unknown as ResponsePromise)

    render(<RfpAttachmentDropzone value={[]} onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['content'], 'doc.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/api/files/upload',
        expect.objectContaining({ body: expect.any(FormData) }),
      ),
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
      new Request('http://localhost/api/files/upload'),
      {} as unknown as NormalizedOptions,
    )
    vi.mocked(http.post).mockReturnValue({
      json: vi.fn().mockRejectedValue(error415),
    } as unknown as ResponsePromise)

    render(<RfpAttachmentDropzone value={[]} onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['x'], 'file.png', { type: 'image/png' }))

    await waitFor(() =>
      expect(screen.getByTitle('지원되지 않는 파일 형식입니다 (PDF/PNG/JPEG만 허용)')).toBeInTheDocument(),
    )
  })
})
