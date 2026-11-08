import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { session, useOnline } from "./client";
import { Button } from "./components/ui/button";
import { AddTank } from "./screens/add-tank";
import { AuthForm } from "./screens/auth-form";
import { Dashboard } from "./screens/dashboard";
import { Shell } from "./screens/shell";
import { TankDetailRoute } from "./screens/tank-detail";
import "./styles.css";

function App() {
  const me = useQuery(session.me);
  const online = useOnline();
  const location = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [location.pathname, me.status]);
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-5 py-10 sm:py-16">
      <header className="mb-10 border-b border-input pb-6">
        <p className="mb-2 text-xs font-bold tracking-[.18em] uppercase text-primary">
          A little care, every day
        </p>
        <p className="text-2xl font-semibold tracking-tight">
          Fish Tank Manager
        </p>
      </header>
      {!online && (
        <p role="status" className="mb-6 rounded-md bg-muted p-4">
          You’re offline. Connect before trying again.
        </p>
      )}
      {me.isPending ? (
        <p role="status">Checking your sign-in…</p>
      ) : me.isError ? (
        <section>
          <h1
            ref={heading}
            tabIndex={-1}
            className="mb-3 text-2xl font-semibold"
          >
            Unable to connect
          </h1>
          <p className="mb-6">
            We couldn’t check your sign-in. Please try again when connected.
          </p>
          <Button
            onClick={() => void me.refetch()}
            disabled={!online || me.isFetching}
          >
            Try again
          </Button>
        </section>
      ) : (
        <Routes>
          <Route
            path="/login"
            element={
              me.data ? (
                <Navigate to="/" replace />
              ) : (
                <AuthForm key="login" signup={false} />
              )
            }
          />
          <Route
            path="/signup"
            element={
              me.data ? (
                <Navigate to="/" replace />
              ) : (
                <AuthForm key="signup" signup />
              )
            }
          />
          <Route
            element={
              me.data ? (
                <Shell user={me.data} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="tanks/new" element={<AddTank />} />
            <Route path="tanks/:tankId" element={<TankDetailRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      <footer className="mt-12 text-sm text-muted-foreground">
        Your aquarium, thoughtfully kept.
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={session.client}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
