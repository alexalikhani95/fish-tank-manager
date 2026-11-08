import { useQuery } from "@tanstack/react-query";
import { useOutletContext, useParams } from "react-router";
import { session, type Tank } from "../client";
import { ApiError, type User } from "../session";
import { formatVolume } from "../volume";
import { Title } from "../components/title";
import { Unavailable } from "../components/unavailable";

export function TankDetailRoute() {
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
