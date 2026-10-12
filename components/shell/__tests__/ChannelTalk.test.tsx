import { describe, it, expect, vi, beforeEach } from "vitest";
import { DemoServiceContact } from "@/components/demo/DemoServiceContact";
import { fireEvent, screen, render } from "@testing-library/react";
import { act } from "react";
import { ChannelTalk } from "../ChannelTalk";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const mockHide = vi.fn();
const mockOnHide = vi.fn();
const mockLoadScript = vi.fn();
const mockShutdown = vi.fn();
const mockBoot = vi.fn();

vi.mock("@channel.io/channel-web-sdk-loader", () => ({
  loadScript: mockLoadScript,
  shutdown: mockShutdown,
  boot: mockBoot,
  hideMessenger: vi.fn(),
  hideChannelButton: mockHide,
  onHideMessenger: mockOnHide,
}));

const PLUGIN_KEY = "test-plugin-key";

beforeEach(() => {
  mockLoadScript.mockClear();
  mockShutdown.mockClear();
  mockBoot.mockReset();
  pathname = "/";
  mockHide.mockClear();
  mockOnHide.mockClear();
});

describe("ChannelTalk", () => {
  it("dispatches channelio:ready event after boot", async () => {
    const listener = vi.fn();
    window.addEventListener("channelio:ready", listener);

    await act(async () => {
      render(<ChannelTalk pluginKey={PLUGIN_KEY} member={null} />);
    });

    expect(listener).not.toHaveBeenCalled();
    act(() => mockBoot.mock.calls[0][1](null, {}));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("channelio:ready", listener);
  });

  it("does not dispatch channelio:ready when pluginKey is absent", async () => {
    const listener = vi.fn();
    window.addEventListener("channelio:ready", listener);

    await act(async () => {
      render(<ChannelTalk pluginKey={undefined} member={null} />);
    });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("channelio:ready", listener);
  });
});

it("suppresses demo launchers, restores landing, and ignores stale callbacks", async () => {
  pathname = "/demo";
  let view: ReturnType<typeof render>;
  await act(async () => {
    view = render(<ChannelTalk pluginKey={PLUGIN_KEY} member={null} />);
  });
  expect(mockBoot.mock.calls[0][0]).toMatchObject({
    hideChannelButtonOnBoot: true,
    hidePopup: true,
  });
  act(() => mockBoot.mock.calls[0][1](null, {}));
  const close = mockOnHide.mock.calls[0][0];
  mockHide.mockClear();
  close();
  expect(mockHide).toHaveBeenCalledOnce();
  await act(async () => {
    view.rerender(<ChannelTalk pluginKey={PLUGIN_KEY} member={null} />);
  });
  expect(mockBoot).toHaveBeenCalledTimes(1);
  pathname = "/";
  await act(async () => {
    view.rerender(<ChannelTalk pluginKey={PLUGIN_KEY} member={null} />);
  });
  expect(mockBoot.mock.calls[1][0]).toMatchObject({
    hideChannelButtonOnBoot: false,
    hidePopup: false,
  });
  mockHide.mockClear();
  close();
  mockBoot.mock.calls[0][1](null, {});
  expect(mockHide).not.toHaveBeenCalled();
  pathname = "/demo";
  await act(async () => {
    view.rerender(<ChannelTalk pluginKey={PLUGIN_KEY} member={null} />);
  });
  expect(mockBoot.mock.calls[2][0]).toMatchObject({
    hideChannelButtonOnBoot: true,
    hidePopup: true,
  });
});

it("does not announce failed or abandoned boots", async () => {
  const listener = vi.fn();
  window.addEventListener("channelio:ready", listener);
  let view: ReturnType<typeof render>;
  await act(async () => {
    view = render(<ChannelTalk pluginKey={PLUGIN_KEY} member={null} />);
  });
  const complete = mockBoot.mock.calls[0][1];
  expect(complete).toEqual(expect.any(Function));
  complete(new Error("offline"), null);
  view!.unmount();
  complete(null, {});
  expect(listener).not.toHaveBeenCalled();
  window.removeEventListener("channelio:ready", listener);
});

it("opens service contact only after successful boot, with email fallback otherwise", async () => {
  pathname = "/demo";
  const sdk = vi.fn();
  window.ChannelIO = sdk;
  let view: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <>
        <ChannelTalk pluginKey={PLUGIN_KEY} member={null} />
        <DemoServiceContact />
      </>,
    );
  });
  const contact = screen.getByRole("link", { name: "서비스 문의" });
  expect(contact).toHaveAttribute("href", "mailto:contact@support-b.com");
  // Observe the native fallback without asking jsdom to launch a mail client.
  let prevented = true;
  const stopNavigation = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", stopNavigation, { once: true });
  fireEvent.click(contact);
  expect(prevented).toBe(false);
  expect(sdk).not.toHaveBeenCalled();
  act(() => mockBoot.mock.calls[0][1](null, {}));
  expect(fireEvent.click(contact)).toBe(false);
  expect(sdk).toHaveBeenCalledWith("showMessenger");
  view!.unmount();
  delete (window as unknown as Record<string, unknown>).ChannelIO;
});
