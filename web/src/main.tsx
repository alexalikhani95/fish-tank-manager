import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
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
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import { ApiError, createSession, type User } from "./session";
import { formatVolume, toLitres, volumeLabels } from "./volume";
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
type Tank = { _id: string; name: string; volumeLitres: number };

function Title({ children }: { children: ReactNode }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <h1
      ref={title}
      tabIndex={-1}
      className="mb-6 text-3xl font-semibold tracking-tight break-words"
    >
      {children}
    </h1>
  );
}

function Shell({ user }: { user: User }) {
  const online = useOnline();
  const logout = useMutation({ mutationFn: session.signOut });
  return (
    <>
      <nav
        aria-label="Signed in"
        className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2"
      >
        <Link to="/">Dashboard</Link>
        <Button
          onClick={() => logout.mutate()}
          disabled={!online || logout.isPending}
          className="ml-auto"
        >
          {logout.isPending ? "Signing out…" : "Sign out"}
        </Button>
        <p className="w-full text-sm break-words text-muted-foreground">
          {user.email}
        </p>
        {logout.isError && (
          <p role="alert" className="w-full text-destructive">
            Sign-out was not confirmed. Please reconnect and try again.
          </p>
        )}
      </nav>
      <Outlet context={user} />
    </>
  );
}

function Unavailable({ what, retry }: { what: string; retry: () => void }) {
  const online = useOnline();
  return (
    <div className="rounded-md bg-muted p-4">
      <p className="mb-4">
        We couldn’t load {what}. Please try again when connected.
      </p>
      <Button onClick={retry} disabled={!online}>
        Try again
      </Button>
    </div>
  );
}

function Dashboard() {
  const user = useOutletContext<User>();
  const tanks = useQuery({
    queryKey: ["tanks"],
    queryFn: ({ signal }) => session.request<Tank[]>("tanks", { signal }),
  });
  return (
    <section>
      <Title>Your Tanks</Title>
      <p className="mb-6">
        <Link to="/tanks/new">Add Tank</Link>
      </p>
      {tanks.isPending ? (
        <p role="status">Loading your Tanks…</p>
      ) : tanks.isError ? (
        <Unavailable what="your Tanks" retry={() => void tanks.refetch()} />
      ) : tanks.data.length === 0 ? (
        <div className="rounded-md bg-muted p-4">
          <p className="font-semibold">No Tanks yet</p>
          <p>Add your first Tank to start its log.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tanks.data.map((tank) => (
            <li key={tank._id}>
              <Link
                to={`/tanks/${tank._id}`}
                className="flex flex-col items-start rounded-md border border-input bg-white p-4 no-underline"
              >
                <span className="w-full text-lg font-semibold break-words underline underline-offset-4">
                  {tank.name}
                </span>
                <span>{formatVolume(tank.volumeLitres, user.volumeUnit)}</span>
                <span className="text-sm text-muted-foreground">
                  No water changes yet.
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddTank() {
  const user = useOutletContext<User>();
  const online = useOnline();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [volume, setVolume] = useState("");
  const [checked, setChecked] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const unit = volumeLabels[user.volumeUnit];
  // The amount is in the User's volumeUnit; full-precision litres are stored, only display rounds.
  const amount = Number(volume); // "" is 0, so it fails the same check.
  const litres = toLitres(amount, user.volumeUnit);
  const mutation = useMutation({
    mutationFn: () =>
      session.request<Tank>("tanks", {
        method: "POST",
        body: JSON.stringify({
          name,
          volumeLitres: litres,
        }),
      }),
    onSuccess: (tank) => {
      session.client.setQueryData(["tanks", tank._id], tank);
      void session.client.invalidateQueries({
        queryKey: ["tanks"],
        exact: true,
      });
      void navigate(`/tanks/${tank._id}`);
    },
  });
  useEffect(() => {
    if (mutation.isError) feedback.current?.focus();
  }, [mutation.isError]);
  const error = mutation.error;
  const serverErrors =
    error instanceof ApiError && error.status === 400 ? error.errors : [];
  const nameInvalid = name.trim().length < 1 || name.trim().length > 80;
  // Litres are checked too: a finite amount can still overflow, e.g. 1e308 UK gal.
  const volumeInvalid = !(amount > 0) || !Number.isFinite(litres);
  const fieldError = (field: string, local: string | false) =>
    (checked && local) ||
    serverErrors
      .filter((e) => e.field === field)
      .map((e) => e.message)
      .join(". ");
  const nameError = fieldError(
    "name",
    nameInvalid && "Enter a name of 1–80 characters.",
  );
  const volumeError = fieldError(
    "volumeLitres",
    volumeInvalid && `Enter a volume above zero in ${unit}, like 80 or 80.5.`,
  );
  return (
    <section>
      <Title>Add Tank</Title>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          // Render the errors before focusing, so the field announces its error.
          flushSync(() => setChecked(true));
          if (nameInvalid || volumeInvalid)
            document
              .getElementById(nameInvalid ? "tank-name" : "tank-volume")
              ?.focus();
          else if (online && !mutation.isPending) mutation.mutate();
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
            {serverErrors.length ? (
              "Check the highlighted fields."
            ) : (
              <>
                Your Tank was not confirmed as saved. Before trying again,{" "}
                <Link to="/">check your Tanks</Link> so it isn’t added twice.
              </>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="tank-name">Name</Label>
          <Input
            id="tank-name"
            value={name}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            disabled={mutation.isPending}
            aria-invalid={!!nameError}
            aria-describedby="tank-name-error"
            className="min-h-12"
          />
          <p id="tank-name-error" className="text-sm text-destructive">
            {nameError}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tank-volume">Volume ({unit})</Label>
          <Input
            id="tank-volume"
            inputMode="decimal"
            value={volume}
            autoComplete="off"
            onChange={(e) => setVolume(e.target.value)}
            disabled={mutation.isPending}
            aria-invalid={!!volumeError}
            aria-describedby="tank-volume-error"
            className="min-h-12"
          />
          <p id="tank-volume-error" className="text-sm text-destructive">
            {volumeError}
          </p>
        </div>
        <Button
          type="submit"
          disabled={!online || mutation.isPending}
          className="min-h-12 w-full"
        >
          {mutation.isPending ? "Saving…" : "Create Tank"}
        </Button>
      </form>
    </section>
  );
}

function TankDetailRoute() {
  const { tankId = "" } = useParams();
  // A fresh component per Tank: no state or data carries over between Tanks.
  return <TankDetail key={tankId} tankId={tankId} />;
}

function TankDetail({ tankId }: { tankId: string }) {
  const user = useOutletContext<User>();
  const tank = useQuery({
    queryKey: ["tanks", tankId],
    queryFn: ({ signal }) =>
      session.request<Tank>(`tanks/${tankId}`, { signal }),
  });
  if (tank.isPending) return <p role="status">Loading Tank…</p>;
  if (tank.isError) {
    return tank.error instanceof ApiError && tank.error.status === 404 ? (
      <section>
        <Title>Tank not found</Title>
        <p>This Tank doesn’t exist or isn’t yours.</p>
      </section>
    ) : (
      <section>
        <Title>Tank unavailable</Title>
        <Unavailable what="this Tank" retry={() => void tank.refetch()} />
      </section>
    );
  }
  return (
    <section>
      <Title>{tank.data.name}</Title>
      <dl className="mb-6">
        <dt className="text-sm text-muted-foreground">Volume</dt>
        <dd className="m-0 text-lg">
          {formatVolume(tank.data.volumeLitres, user.volumeUnit)}
        </dd>
      </dl>
      <h2 className="mb-2 text-xl font-semibold">Water changes</h2>
      <p>No water changes yet.</p>
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
