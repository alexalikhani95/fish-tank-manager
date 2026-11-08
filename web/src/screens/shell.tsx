import { useMutation } from "@tanstack/react-query";
import { Link, Outlet } from "react-router";
import { session, useOnline } from "../client";
import type { User } from "../session";
import { Button } from "../components/ui/button";

export function Shell({ user }: { user: User }) {
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
