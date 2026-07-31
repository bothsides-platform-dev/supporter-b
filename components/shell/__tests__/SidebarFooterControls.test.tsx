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

let mockResolvedTheme = 'light';
const mockSetTheme = vi.fn();
vi.mock('@/lib/stores/theme', () => {
  const store = (selector: (s: { resolvedTheme: string; setTheme: () => void }) => unknown) =>
    selector({ resolvedTheme: mockResolvedTheme, setTheme: mockSetTheme });
  // 컴포넌트가 stale closure 를 피하려고 getState() 로 라이브 값을 다시 읽는다.
  store.getState = () => ({ resolvedTheme: mockResolvedTheme, setTheme: mockSetTheme });
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

beforeEach(() => {
  mockResolvedTheme = 'light';
  mockSetTheme.mockClear();
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
    mockResolvedTheme = 'dark';
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

  // 48px 레일에서는 문의하기와 같이 라벨을 숨기고 툴팁으로만 알린다.
  it('접었을 때 라벨 텍스트를 숨긴다', () => {
    renderControls(false);
    const label = screen.getByText('다크 모드로 전환');
    expect(label.className).toMatch(/group-data-\[collapsible=icon\]:hidden/);
  });

  it('접었을 때 툴팁으로 같은 문구를 알린다', async () => {
    const user = userEvent.setup();
    renderControls(false);
    await user.hover(screen.getByRole('button', { name: '다크 모드로 전환' }));
    const tooltip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveTextContent('다크 모드로 전환');
  });

  // 두 행이 같은 행 문법(아이콘 열·높이·라벨 간격)을 공유해야 푸터가 한 덩어리로 읽힌다.
  it('문의하기 행과 같은 행 문법을 쓴다', () => {
    renderControls(true);
    const contact = screen.getByRole('button', { name: '문의하기' });
    const theme = screen.getByRole('button', { name: '다크 모드로 전환' });
    for (const cls of ['h-8', 'w-full', 'gap-2.5', 'px-2.5']) {
      expect(theme.className, `테마 행에 ${cls} 가 있어야 한다`).toContain(cls);
      expect(contact.className, `문의하기 행에 ${cls} 가 있어야 한다`).toContain(cls);
    }
  });
});
