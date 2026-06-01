import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGetMock, useSettingsMock, useAppConfigMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  useSettingsMock: vi.fn(),
  useAppConfigMock: vi.fn(),
}));

vi.mock('../api/client', () => ({
  apiGet: apiGetMock,
}));

vi.mock('../hooks/useSettings', () => ({
  useSettings: useSettingsMock,
}));

vi.mock('../hooks/useAppConfig', () => ({
  useAppConfig: useAppConfigMock,
}));

import { Settings } from './Settings';

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe('Settings', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    apiGetMock.mockReset();
    useSettingsMock.mockReset();
    useAppConfigMock.mockReset();
    useSettingsMock.mockReturnValue({
      token: 'saved-token',
      setToken: vi.fn(),
      homepage: 'dashboard',
      setHomepage: vi.fn(),
    });
    useAppConfigMock.mockReturnValue({ tandoor_external_url: '' });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('tests the connection against the personal user spaces endpoint', async () => {
    apiGetMock.mockResolvedValue([
      {
        id: 1,
        user: { id: 2, username: 'connected-user' },
        space: 3,
      },
    ]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      );
    });

    const testButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Test Connection',
    );
    expect(testButton).toBeDefined();

    await act(async () => {
      testButton?.click();
    });

    expect(apiGetMock).toHaveBeenCalledWith('/user-space/all_personal/');
    expect(container.textContent).toContain('Connected as connected-user');
  });
});
