import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { session, useOnline } from "../client";
import { ApiError } from "../session";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function AuthForm({ signup }: { signup: boolean }) {
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
