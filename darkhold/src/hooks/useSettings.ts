import { useState, useCallback } from 'react';

export type HomepageSetting = 'dashboard' | 'all-recipes' | 'meal-plan';

export function useSettings() {
  const [token, setTokenState] = useState(() => localStorage.getItem('tandoor_token') || '');
  const [homepage, setHomepageState] = useState<HomepageSetting>(
    () => (localStorage.getItem('homepage_pref') as HomepageSetting) || 'dashboard',
  );

  const setToken = useCallback((t: string) => {
    localStorage.setItem('tandoor_token', t);
    setTokenState(t);
  }, []);

  const setHomepage = useCallback((h: HomepageSetting) => {
    localStorage.setItem('homepage_pref', h);
    setHomepageState(h);
  }, []);

  return { token, setToken, homepage, setHomepage };
}
