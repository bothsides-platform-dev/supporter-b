// components/rfp/__tests__/RfpStep2Content.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep2Content } from '../RfpStep2Content';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { WEBSITE_URL_ERROR } from '@/lib/validation/website-url';

// RfpAttachmentDropzone은 fetch 없이 테스트하기 위해 mock
vi.mock('../RfpAttachmentDropzone', () => ({
  RfpAttachmentDropzone: () => <div data-testid="dropzone" />,
}));

function resetStore() {
  useRfpDraftStore.setState({
    title: '',
    websiteUrl: '',
    contractType: null,
    mainProducts: '',
    annualPgVolume: '',
    currentFeeRate: '',
    currentSettlementLimit: '',
    currentGuaranteeInsurance: '',
    currentSettlementCycle: '',
    deliveryServicePeriod: '',
    currentSolution: '',
    currentSolutionDetail: '',
    memo: '',
    rfpFiles: [],
    currentFeeVisibleToPg: true,
    requiredPaymentMethods: [],
    customPaymentMethods: [],
  });
}

describe('RfpStep2Content', () => {
  beforeEach(resetStore);

  it('제목이 비어있어도 다음 버튼은 비활성화되지 않는다 (순서 무관 입력)', () => {
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다음' })).not.toBeDisabled();
  });

  it('제목이 비어있어도 다음 버튼 클릭 시 onNext가 호출된다', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<RfpStep2Content onBack={vi.fn()} onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('이전 버튼 클릭 시 onBack이 호출된다', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<RfpStep2Content onBack={onBack} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('솔루션 버튼 클릭 시 store에 반영된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '카페24' }));
    expect(useRfpDraftStore.getState().currentSolution).toBe('cafe24');
  });

  it('기타 솔루션 선택 시 상세 입력 필드가 표시된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '기타' }));
    expect(screen.getByPlaceholderText('솔루션 이름')).toBeInTheDocument();
  });

  it('자체 개발 선택 시 상세 입력 필드가 렌더되지 않는다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '자체 개발' }));
    expect(screen.queryByPlaceholderText('독립몰 이름')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('솔루션 이름')).not.toBeInTheDocument();
  });

  it('기타에 상세값을 입력한 후 자체 개발로 전환하면 상세값이 삭제된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '기타' }));
    await user.type(screen.getByPlaceholderText('솔루션 이름'), 'ABC몰');
    await user.click(screen.getByRole('button', { name: '자체 개발' }));
    expect(useRfpDraftStore.getState().currentSolutionDetail).toBe('');
  });

  it('현재 정산주기 입력 시 숫자만 입력되어 D+N 형식으로 저장된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    // numeric textbox rejects non-digits; default unit is D, so '2' → 'D+2'
    await user.type(screen.getByPlaceholderText('1'), 'W2');
    expect(useRfpDraftStore.getState().currentSettlementCycle).toBe('D+2');
  });

  it('현재 정산주기 — W 단위 선택 후 숫자 입력 시 W+N 형식으로 저장된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    const [cycleSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(cycleSelect, 'W');
    await user.type(screen.getByPlaceholderText('1'), '3');
    expect(useRfpDraftStore.getState().currentSettlementCycle).toBe('W+3');
  });

  it('배송 및 서비스 기간 입력 시 숫자만 입력되어 D+N 형식으로 저장된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('3'), 'D5');
    expect(useRfpDraftStore.getState().deliveryServicePeriod).toBe('D+5');
  });

  it('배송 및 서비스 기간 — M 단위 선택 후 숫자 입력 시 M+N 형식으로 저장된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    const [, periodSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(periodSelect, 'M');
    await user.type(screen.getByPlaceholderText('3'), '2');
    expect(useRfpDraftStore.getState().deliveryServicePeriod).toBe('M+2');
  });

  describe('현재 카드 수수료 — 숫자+% 제한', () => {
    it('숫자만 raw 문자열로 저장되고 글자는 차단된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      const input = screen.getByPlaceholderText('3.4') as HTMLInputElement;
      await user.type(input, '3.4%abc');
      expect(input.value).toBe('3.4');
      expect(useRfpDraftStore.getState().currentFeeRate).toBe('3.4');
    });

    it('100 을 초과하는 값은 입력되지 않는다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      const input = screen.getByPlaceholderText('3.4') as HTMLInputElement;
      await user.type(input, '150');
      expect(useRfpDraftStore.getState().currentFeeRate).not.toBe('150');
    });

    it('정확히 100 은 허용된다 (상한 포함 경계)', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      const input = screen.getByPlaceholderText('3.4') as HTMLInputElement;
      await user.type(input, '100');
      expect(useRfpDraftStore.getState().currentFeeRate).toBe('100');
    });
  });

  describe('현재 월 정산한도/보증보험 — 원화 CurrencyInput', () => {
    it('정산한도는 천단위 콤마로 표시되고 raw digit로 저장된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.type(screen.getByPlaceholderText('100,000,000'), '100000000');
      expect(screen.getByDisplayValue('100,000,000')).toBeInTheDocument();
      expect(useRfpDraftStore.getState().currentSettlementLimit).toBe('100000000');
    });

    it('보증보험에 글자를 입력하면 차단된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      const input = screen.getByPlaceholderText('30,000,000') as HTMLInputElement;
      await user.type(input, '30000000원');
      expect(input.value).toBe('30,000,000');
      expect(useRfpDraftStore.getState().currentGuaranteeInsurance).toBe('30000000');
    });
  });

  describe('홈페이지 도메인 유효성', () => {
    const homepagePlaceholder = 'example.com';

    it('빈 값이면 에러를 표시하지 않는다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(homepagePlaceholder)).toHaveAttribute(
        'aria-invalid',
        'false',
      );
    });

    it('도메인 형식이 아닌 값을 입력하면 실시간 에러를 표시한다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.type(screen.getByPlaceholderText(homepagePlaceholder), 'abc');
      expect(screen.getByRole('alert')).toHaveTextContent(WEBSITE_URL_ERROR);
      expect(screen.getByPlaceholderText(homepagePlaceholder)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('유효한 도메인을 입력하면 에러를 표시하지 않는다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.type(
        screen.getByPlaceholderText(homepagePlaceholder),
        'https://x.com',
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(homepagePlaceholder)).toHaveAttribute(
        'aria-invalid',
        'false',
      );
    });

    it('스킴 없는 도메인 입력 후 포커스를 떠나면 https://가 자동으로 붙는다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.type(screen.getByPlaceholderText(homepagePlaceholder), 'example.com');
      await user.tab();
      expect(useRfpDraftStore.getState().websiteUrl).toBe('https://example.com');
      expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
    });

    it('이미 https://가 있는 값은 포커스 이탈 후 그대로 유지된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.type(screen.getByPlaceholderText(homepagePlaceholder), 'https://example.com');
      await user.tab();
      expect(useRfpDraftStore.getState().websiteUrl).toBe('https://example.com');
    });
  });

  describe('제목 인라인 에러 (attempted)', () => {
    it('다음 클릭 전에는 제목이 비어있어도 에러 메시지가 표시되지 않는다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByText('제목을 입력해주세요')).not.toBeInTheDocument();
    });

    it('다음 클릭 후 제목 미입력 시 에러 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '다음' }));
      expect(screen.getByText('제목을 입력해주세요')).toBeInTheDocument();
    });

    it('다음 클릭 후 제목을 입력하면 에러 메시지가 사라진다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '다음' }));
      await user.type(screen.getByPlaceholderText(/서포트쇼핑몰/), '테스트 견적건');
      expect(screen.queryByText('제목을 입력해주세요')).not.toBeInTheDocument();
    });

    it('showFieldErrors=true 이면 다음 클릭 없이도 제목 미입력 에러가 표시된다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.getByText('제목을 입력해주세요')).toBeInTheDocument();
    });

    it('showFieldErrors=true 이어도 제목이 채워지면 에러가 표시되지 않는다', () => {
      useRfpDraftStore.setState({ title: '테스트 견적건' });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.queryByText('제목을 입력해주세요')).not.toBeInTheDocument();
    });
  });

  describe('결제수단 인라인 에러 (attempted)', () => {
    const PAYMENT_ERROR = '결제수단을 1개 이상 선택해주세요';

    it('다음 클릭 전에는 결제수단이 비어있어도 에러 메시지가 표시되지 않는다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByText(PAYMENT_ERROR)).not.toBeInTheDocument();
    });

    it('다음 클릭 후 결제수단 미선택 시 에러 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '다음' }));
      expect(screen.getByText(PAYMENT_ERROR)).toBeInTheDocument();
    });

    it('showFieldErrors=true 이면 다음 클릭 없이도 결제수단 미선택 에러가 표시된다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.getByText(PAYMENT_ERROR)).toBeInTheDocument();
    });

    it('showFieldErrors=true 이어도 결제수단이 선택되면 에러가 표시되지 않는다', () => {
      useRfpDraftStore.setState({ requiredPaymentMethods: ['card'] });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.queryByText(PAYMENT_ERROR)).not.toBeInTheDocument();
    });

    it('커스텀 결제수단만 있어도 에러가 표시되지 않는다', () => {
      useRfpDraftStore.setState({ customPaymentMethods: [{ label: '포인트결제' }] });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.queryByText(PAYMENT_ERROR)).not.toBeInTheDocument();
    });
  });

  describe('전년도 연간 PG 총 거래액 — CurrencyInput', () => {
    it('숫자를 입력하면 천단위 콤마로 표시된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      // placeholder "10억"으로 전년도 거래액 필드 특정
      const input = screen.getByPlaceholderText('10억');
      await user.type(input, '10000000');
      // CurrencyInput(NumericFormat)이면 10,000,000 으로 표시됨
      expect(screen.getByDisplayValue('10,000,000')).toBeInTheDocument();
    });

    it('입력값이 store에 raw digit 문자열로 저장된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      const input = screen.getByPlaceholderText('10억');
      await user.type(input, '50000000');
      // CurrencyInput onValueChange → values.value (raw digit)
      expect(useRfpDraftStore.getState().annualPgVolume).toBe('50000000');
    });
  });

  describe('현재 카드 수수료 PG 공개 토글', () => {
    const cbName = '현재 카드 수수료를 PG사에 공개하기';

    it('기본값은 공개(checked)다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.getByRole('checkbox', { name: cbName })).toBeChecked();
    });

    it('체크 해제 시 store currentFeeVisibleToPg가 false가 된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('checkbox', { name: cbName }));
      expect(useRfpDraftStore.getState().currentFeeVisibleToPg).toBe(false);
    });

    it('다시 체크 시 store currentFeeVisibleToPg가 true로 복귀한다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      const cb = screen.getByRole('checkbox', { name: cbName });
      await user.click(cb);
      await user.click(cb);
      expect(useRfpDraftStore.getState().currentFeeVisibleToPg).toBe(true);
    });
  });

  describe('RfpStep2Content 제목 마커', () => {
    it('제목 비어있으면 "필수", 입력하면 "입력 완료"로 전환', async () => {
      const user = userEvent.setup();
      useRfpDraftStore.getState().reset();
      render(<RfpStep2Content onBack={() => {}} onNext={() => {}} />);
      // 제목 마커 초기 상태
      expect(screen.getAllByText('필수').length).toBeGreaterThan(0);

      const titleInput = screen.getByPlaceholderText('2026 서포트쇼핑몰 결제 인프라 견적 요청');
      await user.type(titleInput, '견적 요청');

      expect(screen.getAllByText('입력 완료').length).toBeGreaterThan(0);
    });
  });

  describe('견적 유형 토글', () => {
    it('"신규 계약" 버튼 클릭 시 store contractType 이 new 로 업데이트된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '신규 계약' }));
      expect(useRfpDraftStore.getState().contractType).toBe('new');
    });

    it('"갱신 계약" 버튼 클릭 시 store contractType 이 renewal 로 업데이트된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '갱신 계약' }));
      expect(useRfpDraftStore.getState().contractType).toBe('renewal');
    });

    it('선택된 버튼을 다시 클릭하면 contractType 이 null 로 복귀한다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '신규 계약' }));
      await user.click(screen.getByRole('button', { name: '신규 계약' }));
      expect(useRfpDraftStore.getState().contractType).toBeNull();
    });
  });

  describe('견적 유형 인라인 에러 (attempted)', () => {
    const ERR = '견적 유형을 선택해주세요';

    it('다음 클릭 전에는 견적 유형 미선택 에러가 표시되지 않는다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByText(ERR)).not.toBeInTheDocument();
    });

    it('다음 클릭 후 견적 유형 미선택 시 에러 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '다음' }));
      expect(screen.getByText(ERR)).toBeInTheDocument();
    });

    it('showFieldErrors=true 이어도 견적 유형을 선택하면 에러가 표시되지 않는다', () => {
      useRfpDraftStore.setState({ contractType: 'new' });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.queryByText(ERR)).not.toBeInTheDocument();
    });
  });

  describe('주요 판매 상품 인라인 에러 (attempted)', () => {
    const ERR = '주요 판매 상품을 입력해주세요';

    it('다음 클릭 전에는 주요 판매 상품 미입력 에러가 표시되지 않는다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByText(ERR)).not.toBeInTheDocument();
    });

    it('showFieldErrors=true 이면 주요 판매 상품 미입력 에러가 표시된다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.getByText(ERR)).toBeInTheDocument();
    });

    it('showFieldErrors=true 이어도 주요 판매 상품을 입력하면 에러가 표시되지 않는다', () => {
      useRfpDraftStore.setState({ mainProducts: '의류' });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.queryByText(ERR)).not.toBeInTheDocument();
    });
  });

  describe('연간 PG 총 거래액 인라인 에러 (attempted)', () => {
    const ERR = '전년도 연간 PG 총 거래액을 입력해주세요';

    it('다음 클릭 전에는 거래액 미입력 에러가 표시되지 않는다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByText(ERR)).not.toBeInTheDocument();
    });

    it('showFieldErrors=true 이면 거래액 미입력 에러가 표시된다', () => {
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.getByText(ERR)).toBeInTheDocument();
    });

    it('showFieldErrors=true 이어도 거래액을 입력하면 에러가 표시되지 않는다', () => {
      useRfpDraftStore.setState({ annualPgVolume: '1000000000' });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.queryByText(ERR)).not.toBeInTheDocument();
    });
  });

  describe('신규 계약: 존재할 수 없는 PG 이력 필드 숨김', () => {
    const HIDDEN_LABELS = [
      '전년도 연간 PG 총 거래액',
      '현재 카드 수수료',
      '현재 월 정산한도',
      '현재 보증보험',
      '현재 정산주기',
    ];

    it("contractType='new' 이면 5개 PG 이력 필드가 렌더되지 않는다", () => {
      useRfpDraftStore.setState({ contractType: 'new' });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      for (const label of HIDDEN_LABELS) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
      // PG 공개 체크박스도 함께 사라진다
      expect(
        screen.queryByRole('checkbox', { name: '현재 카드 수수료를 PG사에 공개하기' }),
      ).not.toBeInTheDocument();
    });

    it("contractType='renewal' 이면 5개 PG 이력 필드가 렌더된다", () => {
      useRfpDraftStore.setState({ contractType: 'renewal' });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      for (const label of HIDDEN_LABELS) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('배송 및 서비스 기간·현재 운영 솔루션은 신규 계약에서도 유지된다', () => {
      useRfpDraftStore.setState({ contractType: 'new' });
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.getByText('배송 및 서비스 기간')).toBeInTheDocument();
      expect(screen.getByText('현재 운영 솔루션 유무')).toBeInTheDocument();
    });

    it("신규 계약이면 다음 클릭 후에도 거래액 미입력 에러가 표시되지 않는다", async () => {
      useRfpDraftStore.setState({ contractType: 'new' });
      const user = userEvent.setup();
      render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '다음' }));
      expect(
        screen.queryByText('전년도 연간 PG 총 거래액을 입력해주세요'),
      ).not.toBeInTheDocument();
    });
  });

  describe('서버 거부 홈페이지 (websiteRejected)', () => {
    it('websiteRejected 가 현재 store URL 과 같으면 마커가 error 상태이고 에러 메시지가 표시된다', () => {
      useRfpDraftStore.setState({ websiteUrl: 'foo.invalidtld' });
      render(
        <RfpStep2Content
          onBack={vi.fn()}
          onNext={vi.fn()}
          websiteRejected="foo.invalidtld"
        />,
      );
      // 마커 error → "필수" 텍스트
      expect(screen.getAllByText('필수').length).toBeGreaterThan(0);
      // 에러 메시지 표시
      expect(screen.getByRole('alert')).toHaveTextContent(WEBSITE_URL_ERROR);
    });

    it('store URL 을 다른 값으로 바꾸면 거부 상태가 자동 해제된다', async () => {
      useRfpDraftStore.setState({ websiteUrl: 'foo.invalidtld' });
      const user = userEvent.setup();
      render(
        <RfpStep2Content
          onBack={vi.fn()}
          onNext={vi.fn()}
          websiteRejected="foo.invalidtld"
        />,
      );
      // 초기: error
      expect(screen.getAllByText('필수').length).toBeGreaterThan(0);

      // 입력을 바꿔서 store URL != websiteRejected
      const input = screen.getByPlaceholderText('example.com');
      await user.clear(input);
      await user.type(input, 'example.com');
      // 자동 해제 → 마커가 "입력 완료" 로 복귀
      expect(screen.getAllByText('입력 완료').length).toBeGreaterThan(0);
    });
  });

  it('다음 버튼에 튜토리얼 코치마크 앵커가 있다', () => {
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다음' })).toHaveAttribute(
      'data-coachmark',
      'tutorial-wizard-next-2',
    );
  });
});
