import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router";
import { session, type Tank } from "../client";
import type { User } from "../session";
import { formatVolume } from "../volume";
import { Title } from "../components/title";
import { Unavailable } from "../components/unavailable";

export function Dashboard() {
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
