import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useOutletContext } from "react-router";
import { session, type Tank, useOnline } from "../client";
import { ApiError, type User } from "../session";
import { toLitres, volumeLabels } from "../volume";
import { Button } from "../components/ui/button";
import { Field } from "../components/field";
import { Title } from "../components/title";

export function AddTank() {
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
        <Field
          id="tank-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={mutation.isPending}
          error={nameError}
        />
        <Field
          id="tank-volume"
          label={`Volume (${unit})`}
          inputMode="decimal"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          disabled={mutation.isPending}
          error={volumeError}
        />
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
