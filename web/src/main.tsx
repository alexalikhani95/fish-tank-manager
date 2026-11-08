import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { ApiError, createSession } from "./session";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import "./styles.css";

const session = createSession();
const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}

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
            path="/"
            element={
              me.data ? (
                <Landing email={me.data.email} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      <footer className="mt-12 text-sm text-muted-foreground">
        Your aquarium, thoughtfully kept.
      </footer>
    </main>
  );
}

function AuthForm({ signup }: { signup: boolean }) {
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: () =>
      session.signIn(signup ? "register" : "login", email, password),
    onSettled: () => setPassword(""),
  });
  useEffect(() => {
    title.current?.focus();
  }, []);
  useEffect(() => {
    if (mutation.isError) feedback.current?.focus();
  }, [mutation.isError]);
  const error = mutation.error;
  const errors =
    error instanceof ApiError && error.status === 400 ? error.errors : [];
  const closed = error instanceof ApiError && error.status === 403;
  const message = closed
    ? "Sign-up is closed. Please sign in with the existing User."
    : error instanceof ApiError && error.status === 401
      ? "Email or password is incorrect."
      : errors.length
        ? "Check the highlighted fields."
        : error instanceof ApiError && error.status < 500
          ? error.message
          : "Unable to connect. Your sign-in was not confirmed. Please try again.";
  return (
    <section>
      <h1
        ref={title}
        tabIndex={-1}
        className="mb-2 text-3xl font-semibold tracking-tight"
      >
        {signup ? "Create your User" : "Welcome back"}
      </h1>
      <p className="mb-8 text-muted-foreground">
        {signup
          ? "Set up the first User to start caring for your Tanks."
          : "Sign in to your aquarium log."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (online && !mutation.isPending) mutation.mutate();
        }}
        className="space-y-5"
      >
        {error && (
          <div
            ref={feedback}
            tabIndex={-1}
            role="alert"
            className="rounded-md border border-destructive p-4 text-destructive"
          >
            {message}
            {errors
              .filter((e) => !["email", "password"].includes(e.field))
              .map((e, i) => (
                <p key={i}>{e.message}</p>
              ))}
            {closed && (
              <p className="mt-2">
                <Link to="/login">Go to sign in</Link>
              </p>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            disabled={mutation.isPending}
            aria-invalid={errors.some((e) => e.field === "email")}
            aria-describedby="email-error"
            className="min-h-12"
          />
          <p id="email-error" className="text-sm text-destructive">
            {errors
              .filter((e) => e.field === "email")
              .map((e) => e.message)
              .join(". ")}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={12}
            maxLength={256}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            disabled={mutation.isPending}
            aria-invalid={errors.some((e) => e.field === "password")}
            aria-describedby="password-hint password-error"
            className="min-h-12"
          />
          <p id="password-hint" className="text-sm text-muted-foreground">
            12–256 characters. Spaces count exactly as typed.
          </p>
          <p id="password-error" className="text-sm text-destructive">
            {errors
              .filter((e) => e.field === "password")
              .map((e) => e.message)
              .join(". ")}
          </p>
        </div>
        <Button
          type="submit"
          disabled={!online || mutation.isPending || closed}
          className="min-h-12 w-full"
        >
          {mutation.isPending
            ? "Please wait…"
            : signup
              ? "Create User"
              : "Sign in"}
        </Button>
      </form>
      <p className="mt-7 text-sm">
        {signup ? "Already have a User? " : "Starting for the first time? "}
        <Link to={signup ? "/login" : "/signup"}>
          {signup ? "Sign in" : "Create the first User"}
        </Link>
      </p>
    </section>
  );
}
function Landing({ email }: { email: string }) {
  const online = useOnline();
  const title = useRef<HTMLHeadingElement>(null);
  const logout = useMutation({ mutationFn: session.signOut });
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <section>
      <h1 ref={title} tabIndex={-1} className="mb-3 text-3xl font-semibold">
        You’re signed in
      </h1>
      <p className="mb-6 break-words text-muted-foreground">{email}</p>
      <p className="mb-8">Welcome to your aquarium log.</p>
      {logout.isError && (
        <p role="alert" className="mb-4 text-destructive">
          Sign-out was not confirmed. Please reconnect and try again.
        </p>
      )}
      <Button
        onClick={() => logout.mutate()}
        disabled={!online || logout.isPending}
        className="min-h-12"
      >
        {logout.isPending ? "Signing out…" : "Sign out"}
      </Button>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={session.client}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
