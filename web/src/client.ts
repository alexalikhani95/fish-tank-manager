import { useSyncExternalStore } from "react";
import { createSession } from "./session";

/** The app's one session: TanStack Query client plus authenticated transport. */
export const session = createSession();

export type Tank = {
  _id: string;
  name: string;
  volumeLitres: number;
  // Derived by GET tanks and GET tanks/:tankId; a just-created Tank has none.
  lastWaterChangeAt?: string | null;
};
export type WaterChange = {
  _id: string;
  at: string;
  percent: number;
  note?: string;
};

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}

/** `['tanks', tankId]` — shared by Tank detail and the WaterChange form. */
export const tankQuery = (tankId: string) => ({
  queryKey: ["tanks", tankId],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    session.request<Tank>(`tanks/${tankId}`, { signal }),
});
