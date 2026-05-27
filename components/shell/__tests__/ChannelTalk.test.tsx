import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { ChannelTalk } from '../ChannelTalk';

const mockLoadScript = vi.fn();
const mockShutdown = vi.fn();
const mockBoot = vi.fn();

vi.mock('@channel.io/channel-web-sdk-loader', () => ({
  loadScript: mockLoadScript,
  shutdown: mockShutdown,
  boot: mockBoot,
}));

const PLUGIN_KEY = 'test-plugin-key';

describe('ChannelTalk', () => {
  beforeEach(() => {
    mockLoadScript.mockClear();
    mockShutdown.mockClear();
    mockBoot.mockClear();
  });

  it('dispatches channelio:ready event after boot', async () => {
    const listener = vi.fn();
    window.addEventListener('channelio:ready', listener);

    await act(async () => {
      render(<ChannelTalk pluginKey={PLUGIN_KEY} member={null} />);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('channelio:ready', listener);
  });

  it('does not dispatch channelio:ready when pluginKey is absent', async () => {
    const listener = vi.fn();
    window.addEventListener('channelio:ready', listener);

    await act(async () => {
      render(<ChannelTalk pluginKey={undefined} member={null} />);
    });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('channelio:ready', listener);
  });
});
