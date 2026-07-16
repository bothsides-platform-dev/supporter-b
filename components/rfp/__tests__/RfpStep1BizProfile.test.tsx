// components/rfp/__tests__/RfpStep1BizProfile.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep1BizProfile } from '../RfpStep1BizProfile';

const mockBizProfile = { bizNo: '123-45-67890', taxType: 'general' as const, status: 'active' as const };

describe('RfpStep1BizProfile', () => {
  it('bizProfile 있으면 사업자번호를 표시한다', () => {
    render(
      <RfpStep1BizProfile
        bizProfile={mockBizProfile}
        workspaceName="테스트몰"
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText('123-45-67890')).toBeInTheDocument();
  });

  it('guest 모드면 "가입 후 연동" 안내를 표시한다', () => {
    render(<RfpStep1BizProfile guest onNext={vi.fn()} />);
    expect(screen.getByText(/가입 후 사업자 정보가 자동으로 연동/)).toBeInTheDocument();
  });

  it('guest여도 bizProfile이 주어지면 등록된 사업자 테이블을 표시한다 (랜딩 데모)', () => {
    render(
      <RfpStep1BizProfile guest bizProfile={mockBizProfile} workspaceName="서포트비" onNext={vi.fn()} />,
    );
    expect(screen.getByText('123-45-67890')).toBeInTheDocument();
    expect(screen.getByText('서포트비')).toBeInTheDocument();
    expect(screen.queryByText(/가입 후 사업자 정보가 자동으로 연동/)).not.toBeInTheDocument();
  });

  it('bizProfile 없으면 "사업자번호 미입력" 안내를 표시한다', () => {
    render(<RfpStep1BizProfile onNext={vi.fn()} />);
    expect(screen.getByText(/사업자번호 없이 작성 중/)).toBeInTheDocument();
  });

  it('다음 버튼 클릭 시 onNext가 호출된다', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<RfpStep1BizProfile bizProfile={mockBizProfile} workspaceName="테스트몰" onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
