import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import App from './App';
import {
  APP_CONFIG_GC_TIME,
  APP_CONFIG_STALE_TIME,
  BOOKS_GC_TIME,
  BOOKS_STALE_TIME,
  KEYWORDS_GC_TIME,
  KEYWORDS_STALE_TIME,
  PERSISTED_QUERY_MAX_AGE,
  RECIPES_GC_TIME,
  RECIPES_STALE_TIME,
  shouldPersistQueryKey,
} from './utils/cacheConfig';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

queryClient.setQueryDefaults(['recipe'], {
  staleTime: RECIPES_STALE_TIME,
  gcTime: RECIPES_GC_TIME,
});
queryClient.setQueryDefaults(['recipes'], {
  staleTime: RECIPES_STALE_TIME,
  gcTime: RECIPES_GC_TIME,
});
queryClient.setQueryDefaults(['keywords'], {
  staleTime: KEYWORDS_STALE_TIME,
  gcTime: KEYWORDS_GC_TIME,
});
queryClient.setQueryDefaults(['book'], {
  staleTime: BOOKS_STALE_TIME,
  gcTime: BOOKS_GC_TIME,
});
queryClient.setQueryDefaults(['books'], {
  staleTime: BOOKS_STALE_TIME,
  gcTime: BOOKS_GC_TIME,
});
queryClient.setQueryDefaults(['book-entries'], {
  staleTime: BOOKS_STALE_TIME,
  gcTime: BOOKS_GC_TIME,
});
queryClient.setQueryDefaults(['app-config'], {
  staleTime: APP_CONFIG_STALE_TIME,
  gcTime: APP_CONFIG_GC_TIME,
  refetchOnMount: true,
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'darkhold-query-cache',
});

const queryCacheBuster = localStorage.getItem('tandoor_token') ?? 'default-token';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          buster: queryCacheBuster,
          maxAge: PERSISTED_QUERY_MAX_AGE,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.state.status === 'success' && shouldPersistQueryKey(query.queryKey),
          },
        }}
      >
        <App />
      </PersistQueryClientProvider>
    </React.StrictMode>,
  );
}
