import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import App from './App';
import { ALL_RECIPES_GC_TIME } from './utils/cacheConfig';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'darkhold-query-cache',
});

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: ALL_RECIPES_GC_TIME,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.queryKey[0] === 'all-recipes' && query.state.status === 'success',
          },
        }}
      >
        <App />
      </PersistQueryClientProvider>
    </React.StrictMode>,
  );
}
