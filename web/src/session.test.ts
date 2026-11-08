import { afterEach, expect, test, vi } from "vitest";
import { createSession, ApiError } from "./session";

afterEach(() => vi.unstubAllGlobals());

test("login 401 preserves current data, protected 401 removes private data", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ errors: [{ field: "", message: "Unauthorized" }] }),
          { status: 401 },
        ),
      ),
  );
  const session = createSession();
  session.client.setQueryData(["tanks"], ["private"]);
  await expect(
    session.signIn("login", "a@example.com", " password "),
  ).rejects.toBeInstanceOf(ApiError);
  expect(session.client.getQueryData(["tanks"])).toEqual(["private"]);
  await expect(session.request("tanks")).rejects.toBeInstanceOf(ApiError);
  expect(session.client.getQueryData(["tanks"])).toBeUndefined();
  expect(session.client.getQueryData(["me"])).toBeNull();
});

test("network failures and 5xx preserve the User and failed logout is unconfirmed", async () => {
  const session = createSession();
  session.client.setQueryData(["me"], { email: "first@example.com" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(session.request("me")).rejects.toThrow("offline");
  await expect(session.signOut()).rejects.toThrow("offline");
  expect(session.client.getQueryData(["me"])).toEqual({
    email: "first@example.com",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("server error", { status: 503 })),
  );
  await expect(session.request("me")).rejects.toMatchObject({ status: 503 });
  expect(session.client.getQueryData(["me"])).toEqual({
    email: "first@example.com",
  });
});

test("logout cancels a delayed query; its late result cannot populate the next login", async () => {
  const session = createSession();
  let finish!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, init) => {
      if (_url.endsWith("/tanks")) {
        signal = init.signal;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    }),
  );
  const pending = session.client
    .fetchQuery({
      queryKey: ["tanks"],
      queryFn: ({ signal }) => session.request("tanks", { signal }),
    })
    .catch(() => undefined);
  await session.signOut();
  expect(signal?.aborted).toBe(true);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ email: "next@example.com" })),
      ),
  );
  await session.signIn("login", "next@example.com", " exact password ");
  finish(new Response(JSON.stringify(["old private Tank"])));
  await pending;
  expect(session.client.getQueryData(["tanks"])).toBeUndefined();
  expect(session.client.getQueryData(["me"])).toEqual({
    email: "next@example.com",
  });
});

test("credentials remain exact and validation fields survive transport", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        errors: [{ field: "password", message: "Too short" }],
      }),
      { status: 400 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const session = createSession();
  await expect(
    session.signIn("register", "a@example.com", " spaces "),
  ).rejects.toMatchObject({
    errors: [{ field: "password", message: "Too short" }],
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body).password).toBe(" spaces ");
  expect(fetch.mock.calls[0][1].credentials).toBe("include");
});

test("an unauthenticated me resolves to null rather than unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  const session = createSession();
  await session.client.fetchQuery(session.me).catch(() => undefined);
  expect(session.client.getQueryData(["me"])).toBeNull();
});

test("a late 401 from a previous login cannot clear the current User", async () => {
  const session = createSession();
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ email: "new@example.com" })),
      ),
  );
  const old = session.request("tanks").catch((error: Error) => error.name);
  await session.signIn("login", "new@example.com", "long password");
  finish(new Response("{}", { status: 401 }));
  expect(await old).toBe("AbortError");
  expect(session.client.getQueryData(["me"])).toEqual({
    email: "new@example.com",
  });
});

test("an unreadable successful response is unavailable rather than signed out", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>")),
  );
  const session = createSession();
  session.client.setQueryData(["me"], { email: "current@example.com" });
  await expect(session.request("me")).rejects.toMatchObject({ status: 502 });
  expect(session.client.getQueryData(["me"])).toEqual({
    email: "current@example.com",
  });
});
