import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ApiRequestError } from './api/client';
import { router } from './router';
import { ToastProvider } from './components/Toast';
import './styles/theme.css';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 404 or a validation error will not fix itself, so only retry network and server errors.
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
