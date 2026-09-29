import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
import { MatchingCandidates, MIN_MATCHING_LOADING_MS, RfpMatchingSelection } from "../RfpMatchingSelection";
import { RfpStep4Review } from "../RfpStep4Review";
import { RfpCreateWizard } from "../RfpCreateWizard";

vi.mock('@/lib/server/actions/rfp', () => ({ createRfpAction: vi.fn(), verifyDraftFilesAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mocks = vi.hoisted(() => ({ business: vi.fn(), recommend: vi.fn() }));
vi.mock("@/lib/server/actions/rfp/matching", () => ({
  matchingBusinessAction: mocks.business,
  recommendPgAction: mocks.recommend,
}));
const result = {
  ok: true,
  recommendation: {
    risk: "gray",
    industryName: "강의",
    candidates: [
      {
        pgWorkspaceId: "pg-1",
        name: "Alpha",
        reason: "강의 서비스 추가 검토",
        feeMin: 0.8,
        feeMax: 0.9,
        feeNote: "부가세 별도",
      },
      {
        pgWorkspaceId: "pg-2",
        name: "Beta",
        reason: "교육 분야 상담",
        feeMin: null,
        feeMax: null,
        feeNote: "",
      },
    ],
  },
};
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
function renderReview(onBack = vi.fn()) {
  return render(
    <RfpStep4Review
      matching
      persistentActions
      pgList={[]}
      industryGroups={[{ id: "industry-1", name: "교육 서비스", pgWorkspaceIds: [] }]}
      onBack={onBack}
      onSubmit={vi.fn()}
      submitting={false}
      serverError=""
    />,
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  mocks.business
    .mockReset()
    .mockResolvedValue({ ok: true, hasBusinessProfile: true });
  mocks.recommend.mockReset().mockResolvedValue(result);
  useRfpDraftStore.getState().reset();
  useRfpDraftStore.getState().setField("industryGroupId", "industry-1");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("맞춤 PG 추천 로딩", () => {
  it("예상 수수료가 모두 없으면 표시한 요율 안내를 숨긴다", () => {
    render(<MatchingCandidates recommendation={{ ...result.recommendation, risk: "gray", candidates: result.recommendation.candidates.map(pg => ({ ...pg, feeMin: null, feeMax: null })) }} selected="" onSelect={vi.fn()} />);
    expect(screen.queryByText(/표시한 요율은 예상 조건/)).not.toBeInTheDocument();
  });

  it("빠른 응답도 10초 동안 선택 업종과 다음 결정을 안내한 뒤 한 PG만 선택할 수 있다", async () => {
    expect(MIN_MATCHING_LOADING_MS).toBe(10_000);
    renderReview();
    await advance(0);
    expect(
      screen.getByRole("heading", { name: "교육 서비스에 맞는 PG사를 찾고 있어요" }),
    ).toBeInTheDocument();
    expect(screen.getByText("아직 상담 요청을 보내지 않았어요. 추천 결과를 보고 PG사 한 곳을 고를 수 있어요.")).toBeVisible();
    expect(screen.getByText("사업자 정보 등록 여부와 선택한 교육 서비스의 상담 조건을 확인하고 있어요.")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText("견적 마감일")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "상담 요청하기" })).toBeDisabled();
    await advance(1000);
    expect(screen.getByLabelText("사업자 정보 등록 여부 완료")).toBeInTheDocument();
    await advance(1000);
    expect(screen.queryByText("추천 결과는 다음 화면에서 확인해요")).not.toBeInTheDocument();
    expect(screen.getByAltText("토스페이먼츠")).toBeInTheDocument();
    expect(screen.getByAltText("KG이니시스")).toBeInTheDocument();
    expect(screen.getByAltText("NHN KCP")).toBeInTheDocument();
    expect(screen.getByText("잠시 후 실제 추천 결과를 보여드릴게요.")).toBeVisible();
    expect(screen.queryByText(/PG 로고는 예시예요/)).not.toBeInTheDocument();
    await advance(2700);
    expect(screen.getByRole("heading", { name: "교육 서비스의 추천 PG사를 확인했어요" })).toBeInTheDocument();
    expect(screen.getByLabelText("추천 PG사 준비 완료")).toBeInTheDocument();
    await advance(5299);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await advance(1);
    expect(screen.getByText("견적 마감일")).toBeVisible();
    expect(screen.getByText(/표시한 요율은 예상 조건/)).toBeVisible();
    expect(screen.queryByText("견적에서 안내해요")).not.toBeInTheDocument();
    const alpha = screen.getByRole("radio", { name: /Alpha/ }).closest("label")!;
    const beta = screen.getByRole("radio", { name: /Beta/ }).closest("label")!;
    expect(within(alpha).getByText(/영세 기준 예상 수수료/)).toHaveTextContent("0.8% ~ 0.9%");
    expect(within(beta).queryByText(/영세 기준 예상 수수료/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "상담 요청하기" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Alpha/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Beta/ }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toEqual([
      { id: "pg-2", displayName: "Beta", logoUpdatedAt: null },
    ]);
    expect(screen.getByRole("button", { name: "상담 요청하기" })).toBeEnabled();
  });

  it("사업자 조회가 느리면 시간이 지나도 확인 완료로 표시하지 않는다", async () => {
    let finish!: (value: unknown) => void;
    mocks.business.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderReview();
    await advance(10000);
    expect(
      screen.queryByLabelText("사업자 정보 등록 여부 완료"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await act(async () => finish({ ok: true, hasBusinessProfile: true }));
    expect(screen.getByRole("radio", { name: /Alpha/ })).toBeInTheDocument();
  });

  it("추천 조회가 늦으면 완료와 상담 요청을 숨긴 채 기다린다", async () => {
    let finish!: (value: unknown) => void;
    mocks.recommend.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderReview();
    await advance(10000);
    expect(screen.getByLabelText("사업자 정보 등록 여부 완료")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("업종별 상담 조건 확인 완료"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "상담 요청하기" })).toBeDisabled();
    await act(async () => finish(result));
    expect(screen.getByRole("radio", { name: /Alpha/ })).toBeInTheDocument();
  });

  it("네트워크 오류는 10초를 기다리지 않고 안내하며 재시도하면 연출을 새로 시작한다", async () => {
    mocks.recommend.mockRejectedValueOnce(new Error("network"));
    renderReview();
    await advance(0);
    expect(screen.getByRole("alert")).toHaveTextContent("연결이 잠시 끊겼어요");
    expect(screen.getByRole("button", { name: "상담 요청하기" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인해요" }));
    await advance(9999);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await advance(1);
    expect(screen.getByRole("radio", { name: /Alpha/ })).toBeInTheDocument();
  });

  it("업종 변경 시 이전 결과와 선택을 즉시 비우고 새 업종을 기다린다", async () => {
    renderReview();
    await advance(10000);
    fireEvent.click(screen.getByRole("radio", { name: /Alpha/ }));
    mocks.recommend.mockResolvedValue({
      ...result,
      recommendation: {
        ...result.recommendation,
        candidates: [
          { ...result.recommendation.candidates[1], name: "새 업종 PG" },
        ],
      },
    });
    act(() =>
      useRfpDraftStore.getState().setField("industryGroupId", "industry-2"),
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toEqual([]);
    await advance(10000);
    expect(
      screen.getByRole("radio", { name: /새 업종 PG/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /Alpha/ }),
    ).not.toBeInTheDocument();
  });

  it("이전 업종의 늦은 응답은 새 결과를 덮어쓰지 않는다", async () => {
    let finish!: (value: unknown) => void;
    mocks.recommend.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderReview();
    await advance(0);
    mocks.recommend.mockResolvedValue({
      ...result,
      recommendation: {
        ...result.recommendation,
        candidates: [
          { ...result.recommendation.candidates[1], name: "새 업종 PG" },
        ],
      },
    });
    act(() =>
      useRfpDraftStore.getState().setField("industryGroupId", "industry-2"),
    );
    await advance(10000);
    await act(async () => finish(result));
    expect(
      screen.getByRole("radio", { name: /새 업종 PG/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /Alpha/ }),
    ).not.toBeInTheDocument();
  });

  it("업종 변경 전에 끝난 사업자 조회는 이전 업종 추천을 시작하지 않는다", async () => {
    let finishBusiness!: (value: unknown) => void;
    mocks.business.mockImplementationOnce(
      () => new Promise((resolve) => { finishBusiness = resolve; }),
    );
    renderReview();
    await advance(0);

    act(() => useRfpDraftStore.getState().setField("industryGroupId", "industry-2"));
    await advance(10000);
    await act(async () => finishBusiness({ ok: true, hasBusinessProfile: true }));

    expect(mocks.recommend).toHaveBeenCalledTimes(1);
    expect(mocks.recommend).toHaveBeenCalledWith("industry-2");
    expect(screen.getByRole("radio", { name: /Alpha/ })).toBeInTheDocument();
  });

  it("로딩 중 이전으로 돌아갈 수 있고 언마운트하면 타이머를 정리한다", async () => {
    const onBack = vi.fn();
    const view = renderReview(onBack);
    await advance(0);
    fireEvent.click(
      screen.getByRole("button", { name: "이전" }),
    );
    expect(onBack).toHaveBeenCalledOnce();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("사업자 조회 중 화면을 나가면 늦은 응답으로 추천 조회를 시작하지 않는다", async () => {
    let finishBusiness!: (value: unknown) => void;
    mocks.business.mockImplementationOnce(
      () => new Promise((resolve) => { finishBusiness = resolve; }),
    );
    const view = renderReview();
    await advance(0);
    view.unmount();

    await act(async () => finishBusiness({ ok: true, hasBusinessProfile: true }));

    expect(mocks.recommend).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["black", "unconfigured", "white"] as const)(
    "후보가 없는 %s 업종은 문의 안내만 제공하고 상담 요청을 막는다",
    async (risk) => {
      mocks.recommend.mockResolvedValue({
        ok: true,
        recommendation: { risk, industryName: "업종", candidates: [] },
      });
      renderReview();
      await advance(10000);
      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "운영팀에 문의해요" }),
      ).toHaveAttribute("href", "mailto:help@support-b.com");
      expect(
        screen.getByRole("button", { name: "상담 요청하기" }),
      ).toBeDisabled();
    },
  );

  it.each(["business", "recommend"] as const)(
    "%s 오류는 즉시 표시하고 이전으로 돌아갈 수 있다",
    async (action) => {
      mocks[action].mockResolvedValue({
        ok: false,
        error: "MATCHING_REQUIRED",
      });
      renderReview();
      await advance(0);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "이전" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("견적 마감일")).not.toBeInTheDocument();
    },
  );

  it("알 수 없는 조회 오류는 일반적인 재시도 안내로 표시한다", async () => {
    mocks.business.mockResolvedValue({ ok: false, error: "FUTURE_ERROR" });
    renderReview();
    await advance(0);

    expect(screen.getByRole("alert")).toHaveTextContent("추천 정보를 불러오지 못했어요.");
    expect(screen.getByRole("button", { name: "다시 확인해요" })).toBeInTheDocument();
  });

  it("등록된 사업자 정보가 없으면 확인 성공으로 꾸미지 않는다", async () => {
    mocks.business.mockResolvedValue({ ok: true, hasBusinessProfile: false });
    render(<RfpMatchingSelection />);
    expect(screen.getByRole("heading", { name: "업종에 맞는 PG사를 찾고 있어요" })).toBeInTheDocument();
    await advance(1000);
    expect(screen.getByText("등록된 정보 없음")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("사업자 정보 등록 여부 완료"),
    ).not.toBeInTheDocument();
  });

  it("샘플 최종 확인 화면에는 추천 로딩을 적용하지 않는다", () => {
    render(
      <RfpStep4Review
        pgList={[]}
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        submitting={false}
        serverError=""
      />,
    );
    expect(screen.getByText("견적 마감일")).toBeInTheDocument();
    expect(screen.queryByText("상담 조건 검토 중")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "보내기" })).getByText(
        "보내기",
      ),
    ).toBeInTheDocument();
  });
});

it('직접 입력 추천은 남아 있는 등록 업종 ID를 전송하지 않고 이름 변경 시 재조회한다', async () => {
  useRfpDraftStore.setState({ industryMode: 'custom', customIndustryName: '방문 돌봄' });
  renderReview();
  await advance(0);
  expect(screen.getByRole('heading', { name: '방문 돌봄에 맞는 PG사를 찾고 있어요' })).toBeInTheDocument();
  expect(mocks.recommend).toHaveBeenLastCalledWith({ customIndustryName: '방문 돌봄' });
  await act(async () => useRfpDraftStore.setState({ customIndustryName: '수리' }));
  await advance(0);
  expect(screen.getByRole('heading', { name: '수리에 맞는 PG사를 찾고 있어요' })).toBeInTheDocument();
  expect(mocks.recommend).toHaveBeenLastCalledWith({ customIndustryName: '수리' });
});

it('진행 안내에는 정리된 직접 입력 이름을 표시한다', async () => {
  useRfpDraftStore.setState({ industryMode: 'custom', customIndustryName: '  방문   돌봄  ' });
  renderReview();
  await advance(0);

  expect(screen.getByRole('heading', { name: '방문 돌봄에 맞는 PG사를 찾고 있어요' })).toBeInTheDocument();
  expect(mocks.recommend).toHaveBeenLastCalledWith({ customIndustryName: '  방문   돌봄  ' });
});

describe('모바일 최종 확인은 PG 선택과 마감일 확인을 두 화면으로 나눈다', () => {
  const realWidth = window.innerWidth;
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 }); });
  afterEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: realWidth }); });
  const showResults = async (onBack = vi.fn()) => {
    renderReview(onBack);
    await advance(MIN_MATCHING_LOADING_MS);
  };

  it('최종 확인에 들어와 자동으로 잡힌 초점에서 Shift+Enter를 누르면 이전 단계로 돌아간다', () => {
    const onStepChange = vi.fn();
    render(<RfpCreateWizard step={3} onStepChange={onStepChange} pgList={[]} industryGroups={[{ id: 'industry-1', name: '교육 서비스', pgWorkspaceIds: [] }]} />);
    const content = screen.getByRole('group', { name: '작성 이동' }).parentElement!.querySelector('[data-coachmark="tutorial-wizard-content"]')!;
    expect(content.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Enter', shiftKey: true });
    expect(onStepChange).toHaveBeenCalledWith(2);
  });

  it('PG사를 고른 뒤 다음을 누르면 마감일과 요약 화면으로 넘어가 상담을 요청한다', async () => {
    await showResults();
    expect(screen.getByRole('radio', { name: /Alpha/ })).toBeVisible();
    expect(screen.getByText('견적 마감일')).not.toBeVisible();
    expect(screen.queryByRole('button', { name: '상담 요청하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('견적 마감일')).toBeVisible();
    expect(screen.queryByRole('radio', { name: /Alpha/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상담 요청하기' })).toBeEnabled();
  });

  it('마감일 화면의 이전은 PG 선택 화면으로, PG 선택 화면의 이전은 견적 내용으로 돌아간다', async () => {
    const onBack = vi.fn();
    await showResults(onBack);
    fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Alpha/ })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Alpha/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Shift+Enter도 이전 버튼처럼 현재 화면에서 한 화면씩 돌아간다', async () => {
    const onBack = vi.fn();
    await showResults(onBack);
    fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    fireEvent.keyDown(screen.getByText('견적 마감일'), { key: 'Enter', shiftKey: true });
    expect(screen.getByRole('radio', { name: /Alpha/ })).toBeVisible();
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('radio', { name: /Alpha/ }), { key: 'Enter', shiftKey: true });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('PG 선택 화면의 다음 버튼에 포커스해도 Shift+Enter는 이전 단계로 돌아간다', async () => {
    const onBack = vi.fn();
    await showResults(onBack);
    fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }));
    const next = screen.getByRole('button', { name: '다음' });
    next.focus();
    fireEvent.keyDown(next, { key: 'Enter', shiftKey: true });
    expect(onBack).toHaveBeenCalledOnce();
    expect(screen.getByRole('radio', { name: /Alpha/ })).toBeVisible();
  });

  it('넓은 화면에서는 두 영역을 함께 보여주고 바로 상담을 요청한다', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    await showResults();
    expect(screen.getByRole('radio', { name: /Alpha/ })).toBeVisible();
    expect(screen.getByText('견적 마감일')).toBeVisible();
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
  });
});
