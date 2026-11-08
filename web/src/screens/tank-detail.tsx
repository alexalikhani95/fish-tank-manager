import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useOutletContext, useParams } from "react-router";
import { session, tankQuery, type WaterChange } from "../client";
import type { User } from "../session";
import { formatDay } from "../day";
import { formatVolume } from "../volume";
import { TankError } from "../components/tank-error";
import { Title } from "../components/title";
import { Unavailable } from "../components/unavailable";

export function TankDetailRoute() {
  const { tankId = "" } = useParams();
  // A fresh component per Tank: no state or data carries over between Tanks.
  return <TankDetail key={tankId} tankId={tankId} />;
}

function TankDetail({ tankId }: { tankId: string }) {
  const user = useOutletContext<User>();
  const saved = (useLocation().state as { saved?: boolean } | null)?.saved;
  const tank = useQuery(tankQuery(tankId));
  // Loaded data stays visible if a later refetch fails (e.g. offline).
  if (!tank.data) {
    if (tank.isPending) return <p role="status">Loading Tank…</p>;
    return <TankError error={tank.error!} retry={() => void tank.refetch()} />;
  }
  const last = tank.data.lastWaterChangeAt;
  return (
    <section>
      <Title>{tank.data.name}</Title>
      {saved && (
        <p role="status" className="mb-6 rounded-md bg-muted p-4">
          Water change saved.
        </p>
      )}
      <dl className="mb-6 space-y-3">
        <div>
          <dt className="text-sm text-muted-foreground">Volume</dt>
          <dd className="m-0 text-lg">
            {formatVolume(tank.data.volumeLitres, user.volumeUnit)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Last water change</dt>
          <dd className="m-0 text-lg">{last ? formatDay(last) : "None yet"}</dd>
        </div>
      </dl>
      <p className="mb-6">
        <Link
          to={`/tanks/${tankId}/water-change`}
          className="inline-flex min-h-11 items-center"
        >
          Log water change
        </Link>
      </p>
      <h2 className="mb-2 text-xl font-semibold">Water changes</h2>
      <History tankId={tankId} />
    </section>
  );
}

function History({ tankId }: { tankId: string }) {
  const history = useQuery({
    queryKey: ["tanks", tankId, "water-changes"],
    queryFn: ({ signal }) =>
      session.request<WaterChange[]>(`tanks/${tankId}/water-changes`, {
        signal,
      }),
  });
  if (!history.data) {
    if (history.isPending) return <p role="status">Loading water changes…</p>;
    return (
      <Unavailable
        what="the water changes"
        retry={() => void history.refetch()}
      />
    );
  }
  if (history.data.length === 0) {
    return (
      <div className="rounded-md bg-muted p-4">
        <p className="font-semibold">No water changes yet.</p>
        <p>Use “Log water change” to record the first one.</p>
      </div>
    );
  }
  return (
    <ul aria-label="Water change history" className="space-y-3">
      {history.data.map((change) => (
        <li
          key={change._id}
          className="rounded-md border border-input bg-white p-4"
        >
          <p className="flex flex-wrap justify-between gap-x-4">
            <span className="font-semibold">{formatDay(change.at)}</span>
            <span>{change.percent}% replaced</span>
          </p>
          {change.note && (
            <p className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">
              {change.note}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
