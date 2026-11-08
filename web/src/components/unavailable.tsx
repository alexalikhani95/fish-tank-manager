import { useOnline } from "../client";
import { Button } from "./ui/button";

export function Unavailable({
  what,
  retry,
}: {
  what: string;
  retry: () => void;
}) {
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
