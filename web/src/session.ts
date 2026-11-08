import { QueryClient } from "@tanstack/react-query";

export type User = {
  _id: string;
  email: string;
  volumeUnit: "L" | "usGal" | "ukGal";
  temperatureUnit: "C" | "F";
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public errors: { field: string; message: string }[],
  ) {
    super(errors.map((error) => error.message).join(". "));
  }
}

export function createSession() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: "always", staleTime: 30_000 },
      mutations: { retry: false, networkMode: "always" },
    },
  });
  let generation = 0;

  function replace(user: User | null) {
    generation++;
    void client.cancelQueries();
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
    client.getMutationCache().clear();
    client.setQueryData(["me"], user);
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    protectedRequest = true,
  ): Promise<T> {
    const started = generation;
    const response = await fetch(`/api/v1/${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    const body =
      response.status === 204
        ? undefined
        : await response.json().catch(() => undefined);
    // A response belonging to a previous login must never affect the current User.
    if (started !== generation)
      throw new DOMException("Login changed", "AbortError");
    if (!response.ok) {
      if (response.status === 401 && protectedRequest) replace(null);
      throw new ApiError(
        response.status,
        body?.errors ?? [
          {
            field: "",
            message: body?.message ?? "Service unavailable. Please try again.",
          },
        ],
      );
    }
    if (response.status !== 204 && body === undefined) {
      throw new ApiError(502, [
        {
          field: "",
          message: "Service returned an unreadable response. Please try again.",
        },
      ]);
    }
    return body as T;
  }

  return {
    client,
    request,
    me: {
      queryKey: ["me"],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        try {
          return await request<User>("me", { signal });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return null;
          throw error;
        }
      },
    },
    async signIn(
      action: "login" | "register",
      email: string,
      password: string,
    ) {
      const user = await request<User>(
        `auth/${action}`,
        { method: "POST", body: JSON.stringify({ email, password }) },
        false,
      );
      replace(user);
    },
    async signOut() {
      await request("auth/logout", { method: "POST" }, false);
      replace(null);
    },
  };
}
