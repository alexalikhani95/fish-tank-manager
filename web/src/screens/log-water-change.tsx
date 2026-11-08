import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { session, tankQuery, useOnline, type WaterChange } from "../client";
import { ApiError } from "../session";
import { localToday } from "../day";
import { Button } from "../components/ui/button";
import { Field } from "../components/field";
import { TankError } from "../components/tank-error";
import { Title } from "../components/title";

export function LogWaterChangeRoute() {
  const { tankId = "" } = useParams();
  // A fresh form per Tank: values never carry over to another Tank.
  return <LogWaterChange key={tankId} tankId={tankId} />;
}

function LogWaterChange({ tankId }: { tankId: string }) {
  const tank = useQuery(tankQuery(tankId));
  if (tank.data)
    return <WaterChangeForm tankId={tankId} name={tank.data.name} />;
  if (tank.isPending) return <p role="status">Loading Tank…</p>;
  return <TankError error={tank.error!} retry={() => void tank.refetch()} />;
}

function WaterChangeForm({ tankId, name }: { tankId: string; name: string }) {
  const online = useOnline();
  const navigate = useNavigate();
  // Values live only in this form's memory: kept on failure and while offline,
  // never persisted or replayed (lld.md → Server state).
  const [at, setAt] = useState(localToday);
  const [percent, setPercent] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: () =>
      session.request<WaterChange>(`tanks/${tankId}/water-changes`, {
        method: "POST",
        body: JSON.stringify({
          at,
          percent: Number(percent),
          ...(note && { note }),
        }),
      }),
    onSuccess: async () => {
      // Refetch this Tank's history and summary and the dashboard before
      // showing them, so the new entry is there on arrival.
      await Promise.all([
        session.client.invalidateQueries({
          queryKey: ["tanks", tankId],
          refetchType: "all",
        }),
        session.client.invalidateQueries({
          queryKey: ["tanks"],
          exact: true,
          refetchType: "all",
        }),
      ]);
      void navigate(`/tanks/${tankId}`, { state: { saved: true } });
    },
  });
  useEffect(() => {
    if (mutation.isError) feedback.current?.focus();
  }, [mutation.isError]);
  const error = mutation.error;
  const serverErrors =
    error instanceof ApiError && error.status === 400 ? error.errors : [];
  const atInvalid = !/^\d{4}-\d{2}-\d{2}$/.test(at);
  const percentInvalid =
    !/^\d+$/.test(percent) || Number(percent) < 1 || Number(percent) > 100;
  const fieldError = (field: string, local: string | false) =>
    (checked && local) ||
    serverErrors
      .filter((e) => e.field === field)
      .map((e) => e.message)
      .join(". ");
  const atError = fieldError(
    "at",
    atInvalid && "Enter the date of the change.",
  );
  const percentError = fieldError(
    "percent",
    percentInvalid && "Enter a whole number from 1 to 100.",
  );
  const noteError = fieldError("note", false);
  return (
    <section>
      <Title>Log water change</Title>
      <p className="-mt-4 mb-6 break-words text-muted-foreground">{name}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          // Render the errors before focusing, so the field announces its error.
          flushSync(() => setChecked(true));
          if (atInvalid || percentInvalid)
            document
              .getElementById(atInvalid ? "change-at" : "change-percent")
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
                Your water change was not confirmed as saved. It may or may not
                have been recorded. Before trying again,{" "}
                <Link to={`/tanks/${tankId}`}>check the history</Link> so it
                isn’t logged twice.
              </>
            )}
          </div>
        )}
        <Field
          id="change-at"
          label="Date"
          type="date"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          disabled={mutation.isPending}
          error={atError}
        />
        <Field
          id="change-percent"
          label="Percentage replaced (%)"
          inputMode="numeric"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          disabled={mutation.isPending}
          error={percentError}
        />
        <Field
          id="change-note"
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={mutation.isPending}
          error={noteError}
        />
        <Button
          type="submit"
          disabled={!online || mutation.isPending}
          className="min-h-12 w-full"
        >
          {mutation.isPending ? "Saving…" : "Save water change"}
        </Button>
        {!online && (
          <p className="text-sm text-muted-foreground">
            Saving needs a connection. Your entry stays here until you’re back
            online.
          </p>
        )}
      </form>
    </section>
  );
}
