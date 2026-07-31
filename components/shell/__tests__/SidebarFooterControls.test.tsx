import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarFooterControls } from '../SidebarFooterControls';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// 두 출처를 **따로** 둔다. 렌더(셀렉터)가 보는 값과 `getState()` 가 보는 라이브
// 값이 같기만 하면, "클로저 대신 스토어를 다시 읽는다"는 계약을 검증할 수 없다 —
// 클로저로 되돌려도 목이 같은 답을 주기 때문이다. 연타 테스트가 둘을 어긋나게 한다.
let mockResolvedTheme = 'light';
let mockStoreTheme = 'light';
const mockSetTheme = vi.fn();
vi.mock('@/lib/stores/theme', () => {
  const store = (selector: (s: { resolvedTheme: string; setTheme: () => void }) => unknown) =>
    selector({ resolvedTheme: mockResolvedTheme, setTheme: mockSetTheme });
  store.getState = () => ({ resolvedTheme: mockStoreTheme, setTheme: mockSetTheme });
  return { useThemeStore: store };
});

vi.mock('@/lib/hooks/usePlatform', () => ({
  useIsMac: () => false,
}));

vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

const mockChannelIO = vi.fn();

function renderControls(defaultOpen = true) {
  return render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <TooltipProvider delay={0}>
        <SidebarFooterControls />
      </TooltipProvider>
    </SidebarProvider>,
  );
}

/** 렌더가 보는 값과 스토어 라이브 값을 함께 세팅한다(보통은 둘이 같다). */
function setMockTheme(theme: 'light' | 'dark') {
  mockResolvedTheme = theme;
  mockStoreTheme = theme;
}

beforeEach(() => {
  setMockTheme('light');
  mockSetTheme.mockReset();
});

describe('SidebarFooterControls — 문의하기 버튼', () => {
  beforeEach(() => {
    mockChannelIO.mockClear();
    window.ChannelIO = mockChannelIO as unknown as typeof window.ChannelIO;
  });

  it('renders 문의하기 button', () => {
    renderControls();
    expect(screen.getByRole('button', { name: '문의하기' })).toBeInTheDocument();
  });

  it('calls ChannelIO showMessenger when clicked', async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole('button', { name: '문의하기' }));
    expect(mockChannelIO).toHaveBeenCalledWith('showMessenger');
  });
});

describe('SidebarFooterControls — 크롬 컨트롤 분리', () => {
  // 접기 토글은 헤더 좌측(Header)·모바일 상단 바(MobileShellBar)로 옮겼다.
  // 푸터에 남는 것은 지원 액션(문의하기)과 표시 설정(테마)뿐이다.
  it('does not render the sidebar collapse trigger', () => {
    renderControls();
    expect(screen.queryByRole('button', { name: '사이드바 접기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사이드바 펼치기' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="trigger"]')).not.toBeInTheDocument();
  });

  it('keeps the theme toggle in the footer toolbar', () => {
    renderControls();
    const toolbar = document.querySelector('[data-testid="sidebar-footer-toolbar"]');
    expect(toolbar).toContainElement(screen.getByRole('button', { name: '다크 모드로 전환' }));
  });
});

// 테마 행은 아이콘만 있고 이름이 어디에도 안 보였다 — 바로 옆 문의하기 행은
// 아이콘+라벨인데 혼자만 정체불명의 달 아이콘이었다. 두 행의 문법을 맞춘다.
describe('SidebarFooterControls — 테마 행 이름', () => {
  it('펼쳤을 때 라벨이 보인다', () => {
    renderControls(true);
    expect(screen.getByText('다크 모드로 전환')).toBeInTheDocument();
  });

  it('다크 모드에서는 라벨이 뒤집힌다', () => {
    setMockTheme('dark');
    renderControls(true);
    expect(screen.getByText('라이트 모드로 전환')).toBeInTheDocument();
  });

  // WCAG 2.5.3 Label in Name — 보이는 라벨이 접근 가능한 이름에 포함돼야
  // 음성 제어 사용자가 화면에 보이는 말을 그대로 불러 누를 수 있다.
  it('보이는 라벨이 접근 가능한 이름과 일치한다', () => {
    renderControls(true);
    const button = screen.getByRole('button', { name: '다크 모드로 전환' });
    expect(button).toHaveTextContent('다크 모드로 전환');
  });

  // 두 행이 같은 문법을 공유하는지는 "같은 상수를 쓰는가"로 못박는다. 개별
  // 클래스를 나열하면 두 버튼이 같은 상수를 받는 이상 구조적으로 항상 통과해서
  // (= 반증 불가능), 정작 한쪽이 상수에서 떨어져 나가는 순간을 못 잡는다.
  it('문의하기 행과 완전히 같은 행 문법을 쓴다', () => {
    renderControls(true);
    const contact = screen.getByRole('button', { name: '문의하기' });
    const theme = screen.getByRole('button', { name: '다크 모드로 전환' });
    expect(theme.className).toBe(contact.className);
  });

  // 셸의 다른 컨트롤(navItemBase·IconButton)과 같은 상호작용 값을 쓴다. raw
  // <button> 이라 상속이 없어서, 빠지면 이 두 행만 커서가 화살표이고 hover 가
  // 뚝 끊기고 포커스 링이 앱 표준과 달라진다.
  it.each([
    ['cursor-pointer', /\bcursor-pointer\b/],
    ['transition-colors', /\btransition-colors\b/],
    ['focus ring', /focus-visible:ring-2/],
  ])('셸 표준 상호작용 값을 쓴다 (%s)', (_name, pattern) => {
    renderControls(true);
    expect(screen.getByRole('button', { name: '다크 모드로 전환' }).className).toMatch(
      pattern,
    );
  });
});

// 툴팁은 접힘일 때만 뜬다(nav 행의 showTooltip 과 같은 규칙). 펼침에서는 라벨이
// 바로 옆에 보이므로 툴팁이 같은 말을 반복할 뿐이다.
// `state` 는 SidebarProvider 가 주므로 <Sidebar> 없이도 이 분기는 진짜로 갈린다
// (CSS 의 group-data-[collapsible=icon] 과 달리).
describe('SidebarFooterControls — 툴팁은 접힘 전용', () => {
  it('펼쳤을 때는 툴팁을 띄우지 않는다', async () => {
    const user = userEvent.setup();
    renderControls(true);

    await user.hover(screen.getByRole('button', { name: '다크 모드로 전환' }));

    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();
  });

  it('접었을 때는 이름을 툴팁으로 알린다', async () => {
    const user = userEvent.setup();
    renderControls(false);

    await user.hover(screen.getByRole('button', { name: '다크 모드로 전환' }));

    expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
      '다크 모드로 전환',
    );
  });

  it('접힘 툴팁도 다크에서 뒤집힌다', async () => {
    setMockTheme('dark');
    const user = userEvent.setup();
    renderControls(false);

    await user.hover(screen.getByRole('button', { name: '라이트 모드로 전환' }));

    expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
      '라이트 모드로 전환',
    );
  });

  it('문의하기도 접힘일 때만 툴팁을 띄운다', async () => {
    const user = userEvent.setup();
    renderControls(false);

    await user.hover(screen.getByRole('button', { name: '문의하기' }));

    expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
      '문의하기',
    );
  });
});

// 리팩터 전에는 사이드바가 <ThemeToggle/> 을 렌더해서 그 클릭이
// ThemeToggle.test.tsx 로 덮였다. 자체 행으로 바꾸면서 그 커버리지가 사라졌다 —
// 핸들러를 no-op 으로 바꿔도 셸 테스트가 전부 그린이었다.
describe('SidebarFooterControls — 테마 행 클릭', () => {
  it('라이트에서 누르면 다크로 바꾼다', async () => {
    const user = userEvent.setup();
    renderControls(true);

    await user.click(screen.getByRole('button', { name: '다크 모드로 전환' }));

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('다크에서 누르면 라이트로 바꾼다', async () => {
    setMockTheme('dark');
    const user = userEvent.setup();
    renderControls(true);

    await user.click(screen.getByRole('button', { name: '라이트 모드로 전환' }));

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  // 연타 회귀: 렌더 클로저가 아니라 스토어에서 현재 값을 다시 읽어야 한다.
  // 클로저를 쓰면 두 번째 클릭이 클릭 직전 스냅샷을 보고 첫 번째를 되돌린다.
  // 그걸 잡으려면 목이 두 출처를 **다르게** 답해야 한다 — 셀렉터는 계속 light 를
  // 주고 getState 만 첫 클릭 뒤 dark 로 넘어가게 만든다.
  it('연타해도 스토어의 최신 값을 따라간다', async () => {
    const user = userEvent.setup();
    renderControls(true);
    const button = screen.getByRole('button', { name: '다크 모드로 전환' });

    // 첫 클릭 뒤 스토어는 dark 가 됐지만 렌더는 아직 light 스냅샷이다.
    mockSetTheme.mockImplementation(() => {
      mockStoreTheme = 'dark';
    });

    await user.click(button);
    await user.click(button);

    expect(mockSetTheme).toHaveBeenNthCalledWith(1, 'dark');
    expect(mockSetTheme).toHaveBeenNthCalledWith(2, 'light');
  });
});
