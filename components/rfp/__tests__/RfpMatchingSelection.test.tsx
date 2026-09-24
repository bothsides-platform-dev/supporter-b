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
import { RfpMatchingSelection } from "../RfpMatchingSelection";
import { RfpStep4Review } from "../RfpStep4Review";

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
      pgList={[]}
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
  it("빠른 응답도 5초 동안 단계와 로고를 보여준 뒤 한 PG만 선택할 수 있다", async () => {
    renderReview();
    await advance(0);
    expect(
      screen.getByRole("heading", { name: "사업에 맞는 PG사를 찾고 있어요" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText("마감일")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "상담 요청하기" }),
    ).not.toBeInTheDocument();
    await advance(1000);
    expect(screen.getByLabelText("사업자 정보 확인 완료")).toBeInTheDocument();
    await advance(1000);
    expect(screen.getByText("상담 조건 검토 중")).toBeVisible();
    expect(screen.getByAltText("토스페이먼츠")).toBeInTheDocument();
    expect(screen.getByAltText("KG이니시스")).toBeInTheDocument();
    expect(screen.getByAltText("NHN KCP")).toBeInTheDocument();
    await advance(2700);
    expect(screen.getByLabelText("추천 PG사 준비 완료")).toBeInTheDocument();
    await advance(299);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await advance(1);
    expect(screen.getByText("마감일")).toBeVisible();
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
    await advance(6000);
    expect(
      screen.queryByLabelText("사업자 정보 확인 완료"),
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
    await advance(6000);
    expect(screen.getByLabelText("사업자 정보 확인 완료")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("업종별 상담 조건 확인 완료"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "상담 요청하기" }),
    ).not.toBeInTheDocument();
    await act(async () => finish(result));
    expect(screen.getByRole("radio", { name: /Alpha/ })).toBeInTheDocument();
  });

  it("네트워크 오류는 5초를 기다리지 않고 안내하며 재시도하면 연출을 새로 시작한다", async () => {
    mocks.recommend.mockRejectedValueOnce(new Error("network"));
    renderReview();
    await advance(0);
    expect(screen.getByRole("alert")).toHaveTextContent("연결이 잠시 끊겼어요");
    expect(
      screen.queryByRole("button", { name: "상담 요청하기" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인해요" }));
    await advance(4999);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await advance(1);
    expect(screen.getByRole("radio", { name: /Alpha/ })).toBeInTheDocument();
  });

  it("업종 변경 시 이전 결과와 선택을 즉시 비우고 새 업종을 기다린다", async () => {
    renderReview();
    await advance(5000);
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
    await advance(5000);
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
    await advance(5000);
    await act(async () => finish(result));
    expect(
      screen.getByRole("radio", { name: /새 업종 PG/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /Alpha/ }),
    ).not.toBeInTheDocument();
  });

  it("로딩 중 이전으로 돌아갈 수 있고 언마운트하면 타이머를 정리한다", async () => {
    const onBack = vi.fn();
    const view = renderReview(onBack);
    await advance(0);
    fireEvent.click(
      screen.getByRole("button", { name: "입력 내용 다시 확인해요" }),
    );
    expect(onBack).toHaveBeenCalledOnce();
    view.unmount();
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
      await advance(5000);
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
        screen.getByRole("button", { name: "입력 내용 다시 확인해요" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("마감일")).not.toBeInTheDocument();
    },
  );

  it("등록된 사업자 정보가 없으면 확인 성공으로 꾸미지 않는다", async () => {
    mocks.business.mockResolvedValue({ ok: true, hasBusinessProfile: false });
    render(<RfpMatchingSelection />);
    await advance(1000);
    expect(screen.getByText("등록된 정보 없음")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("사업자 정보 확인 완료"),
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
    expect(screen.getByText("마감일")).toBeInTheDocument();
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
  expect(mocks.recommend).toHaveBeenLastCalledWith({ customIndustryName: '방문 돌봄' });
  await act(async () => useRfpDraftStore.setState({ customIndustryName: '수리' }));
  await advance(0);
  expect(mocks.recommend).toHaveBeenLastCalledWith({ customIndustryName: '수리' });
});
