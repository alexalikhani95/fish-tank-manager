import { useSyncExternalStore } from "react";
import { createSession } from "./session";

/** The app's one session: TanStack Query client plus authenticated transport. */
export const session = createSession();

export type Tank = { _id: string; name: string; volumeLitres: number };

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
