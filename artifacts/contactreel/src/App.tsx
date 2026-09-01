import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Editor from '@/pages/editor';
import { type ReactNode } from 'react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient();

function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-6 text-center text-[hsl(var(--foreground))]">
      <div>
        <div className="mono text-[10px] tracking-[.16em] text-[hsl(var(--primary))]">CONTACTREEL / 404</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.06em]">Frame not found.</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">This route is outside the render console.</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Editor} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
