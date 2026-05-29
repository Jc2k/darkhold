import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
  MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY,
} from '../utils/mealPlanRedirect';
import {
  getVersionReloadUrl,
  shouldReloadForVersion,
  useInvalidationSocket,
} from './useInvalidationSocket';

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
  send() {
    return undefined;
  }
}

function HookHarness() {
  useInvalidationSocket();
  return null;
}

describe('shouldReloadForVersion', () => {
  it('reloads when the server version changes and has not already reloaded for it', () => {
    expect(shouldReloadForVersion('1.2.4', '1.2.3', null)).toBe(true);
  });

  it('does not reload when the app is already on the current server version', () => {
    expect(shouldReloadForVersion('1.2.3', '1.2.3', null)).toBe(false);
  });

  it('does not reload again for the same server version', () => {
    expect(shouldReloadForVersion('1.2.4', '1.2.3', '1.2.4')).toBe(false);
  });
});

describe('getVersionReloadUrl', () => {
  it('adds a cache-busting version parameter to the current URL', () => {
    expect(getVersionReloadUrl('https://darkhold.example.com/meal-plan', '1.2.4')).toBe(
      'https://darkhold.example.com/meal-plan?darkhold_reload_version=1.2.4',
    );
  });

  it('preserves existing query parameters and hash fragments', () => {
    expect(
      getVersionReloadUrl('https://darkhold.example.com/search?q=pasta#results', '1.2.4'),
    ).toBe('https://darkhold.example.com/search?q=pasta&darkhold_reload_version=1.2.4#results');
  });

  it('replaces any stale reload version parameter', () => {
    expect(
      getVersionReloadUrl(
        'https://darkhold.example.com/dashboard?darkhold_reload_version=1.2.3',
        '1.2.4',
      ),
    ).toBe('https://darkhold.example.com/dashboard?darkhold_reload_version=1.2.4');
  });
});

describe('useInvalidationSocket', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('invalidates shopping and proactively refreshes redirect week when websocket connects', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const fetchSpy = vi.spyOn(queryClient, 'fetchQuery').mockResolvedValue('/meal-plan/2026-05-23');

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HookHarness),
        ),
      );
    });

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    act(() => {
      socket.onopen?.();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['shopping-list'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY }),
    );
  });

  it('refreshes redirect week when receiving shopping-list invalidations', () => {
    const queryClient = new QueryClient();
    const fetchSpy = vi.spyOn(queryClient, 'fetchQuery').mockResolvedValue('/meal-plan/2026-05-23');

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HookHarness),
        ),
      );
    });

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({ type: 'invalidate', queryKey: 'shopping-list' }),
      } as MessageEvent<string>);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY }),
    );
  });

  it('refreshes redirect week when receiving redirect broadcast invalidations', () => {
    const queryClient = new QueryClient();
    const fetchSpy = vi.spyOn(queryClient, 'fetchQuery').mockResolvedValue('/meal-plan/2026-05-23');

    act(() => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HookHarness),
        ),
      );
    });

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'invalidate',
          queryKey: MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
        }),
      } as MessageEvent<string>);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY }),
    );
  });
});
