import { ApiError } from "../session";
import { Title } from "./title";
import { Unavailable } from "./unavailable";

/** A 404 (missing, foreign or malformed id) is "not found"; anything else can be retried. */
export function TankError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return error instanceof ApiError && error.status === 404 ? (
    <section>
      <Title>Tank not found</Title>
      <p>This Tank doesn’t exist or isn’t yours.</p>
    </section>
  ) : (
    <section>
      <Title>Tank unavailable</Title>
      <Unavailable what="this Tank" retry={retry} />
    </section>
  );
}
