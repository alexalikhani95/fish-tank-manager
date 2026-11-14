import { expect, test } from "@playwright/test";
import { createTank, signIn } from "./helpers";

test("installable shell: manifest, worker-served deep links, API pass-through and offline", async ({
  page,
  context,
}) => {
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest).toMatchObject({
    name: "Fish Tank Manager",
    display: "standalone",
    start_url: "/",
  });
  expect(
    manifest.icons.map(
      (icon: { sizes: string; purpose?: string }) =>
        `${icon.sizes} ${icon.purpose ?? "any"}`,
    ),
  ).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  for (const icon of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
    const response = await page.request.get(`/${icon}`);
    expect(response.headers()["content-type"]).toBe("image/png");
  }

  await signIn(page);
  const tankId = await createTank(page, "Shell Tank", 40);
  await page.goto(`/tanks/${tankId}`);
  await expect(page.getByRole("heading", { name: "Shell Tank" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker takes control on the next navigation (no clientsClaim).
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(
    true,
  );

  // With the worker in control: a deep link is the shell from the worker,
  // API navigations and fetches are the API's own responses and statuses.
  const deepLink = await page.goto(`/tanks/${tankId}`);
  expect(deepLink?.status()).toBe(200);
  expect(deepLink?.fromServiceWorker()).toBe(true);
  expect(deepLink?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByRole("heading", { name: "Shell Tank" })).toBeVisible();
  for (const [path, status] of [
    ["/api/v1/me", 200],
    [`/api/v1/tanks/${"0".repeat(24)}`, 404],
    ["/api/v1/no-such-route", 404],
    ["/api", 404],
  ] as const) {
    const api = await page.goto(path);
    expect(api?.status(), path).toBe(status);
    expect(api?.fromServiceWorker(), path).toBe(false);
    expect(api?.headers()["content-type"], path).toContain("application/json");
  }
  await page.goto(`/tanks/${tankId}`);
  expect(
    await page.evaluate(async () => {
      const response = await fetch("/api/v1/no-such-route");
      return [response.status, response.headers.get("content-type")];
    }),
  ).toEqual([404, expect.stringContaining("application/json")]);
  // Nothing from the API is in any cache.
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        urls.push(new URL(request.url).pathname);
    return urls;
  });
  expect(cached).toContain("/index.html");
  expect(cached.filter((url) => url.startsWith("/api"))).toEqual([]);

  // Offline with data already loaded: it stays visible with the banner.
  await expect(page.getByRole("heading", { name: "Shell Tank" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("You’re offline");
  await expect(page.getByRole("heading", { name: "Shell Tank" })).toBeVisible();
  // An unavailable API is a failed request, never a successful HTML page.
  expect(
    await page.evaluate(() =>
      fetch("/api/v1/me").then(
        (response) => `${response.status}`,
        () => "failed",
      ),
    ),
  ).toBe("failed");
  await expect(page.goto("/api/v1/me")).rejects.toThrow();

  // Cold offline start of a deep link: the shell opens from the worker and
  // says the session is unavailable — not a sign-in failure.
  const cold = await context.newPage();
  const shell = await cold.goto(`/tanks/${tankId}`);
  expect(shell?.fromServiceWorker()).toBe(true);
  await expect(
    cold.getByRole("heading", { name: "Unable to connect" }),
  ).toBeVisible();
  await expect(cold.getByRole("button", { name: "Try again" })).toBeDisabled();
  await expect(cold.getByRole("heading", { name: "Welcome back" })).toHaveCount(
    0,
  );
  await context.setOffline(false);
  await cold.getByRole("button", { name: "Try again" }).click();
  await expect(cold.getByRole("heading", { name: "Shell Tank" })).toBeVisible();
  await cold.close();
});

test("online with the API unreachable: /api fails, never the shell", async ({
  page,
}) => {
  // The second preview (playwright.config.ts) proxies /api to a closed port.
  const unreachable = "http://localhost:4174";
  await page.goto(`${unreachable}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(
    true,
  );
  for (const path of ["/api/v1/me", "/api"]) {
    const api = await page.goto(`${unreachable}${path}`);
    expect(api?.fromServiceWorker(), path).toBe(false);
    expect(api?.ok(), path).toBe(false);
    expect(api?.headers()["content-type"] ?? "", path).not.toContain(
      "text/html",
    );
  }
  await page.goto(`${unreachable}/`);
  expect(
    await page.evaluate(async () => {
      const response = await fetch("/api/v1/me");
      return [response.ok, response.headers.get("content-type") ?? ""];
    }),
  ).toEqual([false, expect.not.stringContaining("text/html")]);
});
