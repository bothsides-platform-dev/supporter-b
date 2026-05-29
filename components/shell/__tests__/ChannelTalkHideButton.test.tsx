import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ChannelTalkHideButton } from '../ChannelTalkHideButton';

const mockChannelIO = vi.fn();

describe('ChannelTalkHideButton', () => {
  beforeEach(() => {
    mockChannelIO.mockClear();
    window.ChannelIO = mockChannelIO as unknown as typeof window.ChannelIO;
  });

  it('calls hideChannelButton on mount', () => {
    render(<ChannelTalkHideButton />);
    expect(mockChannelIO).toHaveBeenCalledWith('hideChannelButton');
  });

  it('calls showChannelButton on unmount', () => {
    const { unmount } = render(<ChannelTalkHideButton />);
    mockChannelIO.mockClear();
    unmount();
    expect(mockChannelIO).toHaveBeenCalledWith('showChannelButton');
  });

  it('does not throw when window.ChannelIO is undefined', () => {
    delete (window as unknown as Record<string, unknown>).ChannelIO;
    expect(() => render(<ChannelTalkHideButton />)).not.toThrow();
  });

  describe('onHideMessenger (re-hide FAB after messenger closes)', () => {
    it('registers onHideMessenger on mount', () => {
      render(<ChannelTalkHideButton />);
      expect(mockChannelIO).toHaveBeenCalledWith('onHideMessenger', expect.any(Function));
    });

    it('hides the channel button again when the messenger is closed', () => {
      render(<ChannelTalkHideButton />);
      const call = mockChannelIO.mock.calls.find(([cmd]) => cmd === 'onHideMessenger');
      expect(call).toBeDefined();
      const onHide = call![1] as () => void;

      mockChannelIO.mockClear();
      onHide();

      expect(mockChannelIO).toHaveBeenCalledWith('hideChannelButton');
    });
  });

  describe('async boot (channelio:ready event)', () => {
    it('calls hideChannelButton when channelio:ready fires after mount', () => {
      delete (window as unknown as Record<string, unknown>).ChannelIO;
      render(<ChannelTalkHideButton />);

      window.ChannelIO = mockChannelIO as unknown as typeof window.ChannelIO;
      window.dispatchEvent(new CustomEvent('channelio:ready'));

      expect(mockChannelIO).toHaveBeenCalledWith('hideChannelButton');
    });

    it('removes channelio:ready listener on unmount', () => {
      delete (window as unknown as Record<string, unknown>).ChannelIO;
      const { unmount } = render(<ChannelTalkHideButton />);
      unmount();

      window.ChannelIO = mockChannelIO as unknown as typeof window.ChannelIO;
      window.dispatchEvent(new CustomEvent('channelio:ready'));

      expect(mockChannelIO).not.toHaveBeenCalledWith('hideChannelButton');
    });
  });
});
