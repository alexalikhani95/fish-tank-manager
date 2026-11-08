import { expect, test } from "@playwright/test";

test("real signup → me → logout → login carries the unchanged Secure cookie", async ({
  page,
  context,
}) => {
  page.on("pageerror", (error) =>
    console.error("BROWSER ERROR", error.message),
  );
  const email = "browser@example.com";
  const password = "  exact browser password  ";
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeFocused();
  await page.getByRole("link", { name: "Create the first User" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your User" }),
  ).toBeFocused();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    password,
  );
  const signup = page.waitForResponse("**/api/v1/auth/register");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    password,
  );
  await page.getByRole("button", { name: "Create User" }).click();
  expect((await signup).status()).toBe(201);
  await expect(page.getByRole("heading", { name: "Your Tanks" })).toBeVisible();
  await expect(page.getByText("No Tanks yet")).toBeVisible();
  await page.getByRole("link", { name: "Add Tank", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add Tank" })).toBeFocused();
  await page.getByLabel("Name", { exact: true }).fill("River Tank");
  await page.getByLabel("Volume (L)", { exact: true }).fill("80.25");
  await page.getByRole("button", { name: "Create Tank" }).click();
  await expect(page.getByRole("heading", { name: "River Tank" })).toBeFocused();
  await expect(page.getByText("80 L", { exact: true })).toBeVisible();
  const tankUrl = page.url();
  await page.reload();
  await expect(page.getByRole("heading", { name: "River Tank" })).toBeVisible();
  await expect(page.getByText("No water changes yet.")).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("link", { name: /River Tank/ })).toBeVisible();
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "token",
  )!;
  expect(cookie).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });
  // Fetch inside Chromium, not Playwright's request client: this proves browser cookie transport.
  expect(
    await page.evaluate(async () => {
      const response = await fetch("/api/v1/me", { credentials: "include" });
      return { status: response.status, email: (await response.json()).email };
    }),
  ).toEqual({ status: 200, email });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your Tanks" })).toBeVisible();
  await page.goto("/signup");
  await expect(page).toHaveURL("http://localhost:4173/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await context.cookies()).some((cookie) => cookie.name === "token"),
  ).toBe(false);
  expect(
    await page.evaluate(async () => (await fetch("/api/v1/me")).status),
  ).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create the first User" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your User" }),
  ).toBeFocused();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    password,
  );
  await page.getByRole("button", { name: "Create User" }).click();
  await expect(page.getByRole("alert")).toContainText("Sign-up is closed");
  await page.getByRole("link", { name: "Go to sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeFocused();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("wrong password long enough");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is incorrect",
  );
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    password,
  );
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Tanks" })).toBeVisible();
  await page.getByRole("link", { name: /River Tank/ }).click();
  await expect(page).toHaveURL(tankUrl);
  await expect(page.getByRole("heading", { name: "River Tank" })).toBeVisible();
  // Prepare an existing preference via the real API, without a settings screen.
  expect(
    await page.evaluate(
      async () =>
        (
          await fetch("/api/v1/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volumeUnit: "ukGal" }),
          })
        ).status,
    ),
  ).toBe(200);
  await page.goto("/tanks/new");
  await expect(page.getByRole("heading", { name: "Add Tank" })).toBeFocused();
  await page.getByRole("button", { name: "Create Tank" }).click();
  await expect(
    page.getByLabel("Name", { exact: true }),
  ).toHaveAccessibleDescription("Enter a name of 1–80 characters.");
  await expect(
    page.getByLabel("Volume (UK gal)", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  // Submitting moves focus to the first invalid field.
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  // Over 80 characters after trimming is a field error, not silent truncation.
  await page.getByLabel("Name", { exact: true }).fill(` ${"a".repeat(81)} `);
  await page.getByLabel("Volume (UK gal)", { exact: true }).fill("10.25");
  await page.getByRole("button", { name: "Create Tank" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Name", { exact: true }).fill("UK Tank");
  // A finite amount that overflows litres is a field error, not a server round trip.
  await page.getByLabel("Volume (UK gal)", { exact: true }).fill("1e308");
  await page.getByRole("button", { name: "Create Tank" }).click();
  await expect(
    page.getByLabel("Volume (UK gal)", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Volume (UK gal)", { exact: true }),
  ).toHaveAccessibleDescription(
    "Enter a volume above zero in UK gal, like 80 or 80.5.",
  );
  await page.getByLabel("Volume (UK gal)", { exact: true }).fill("10.25");
  // An unconfirmed create keeps the values and is never retried automatically.
  let posts = 0;
  await page.route("**/api/v1/tanks", (route) =>
    route.request().method() === "POST"
      ? (posts++, route.abort())
      : route.fallback(),
  );
  await page.getByRole("button", { name: "Create Tank" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your Tank was not confirmed as saved",
  );
  expect(posts).toBe(1);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("UK Tank");
  await expect(page.getByLabel("Volume (UK gal)", { exact: true })).toHaveValue(
    "10.25",
  );
  await page.unroute("**/api/v1/tanks");
  await page.getByRole("button", { name: "Create Tank" }).click();
  await expect(page.getByRole("heading", { name: "UK Tank" })).toBeFocused();
  expect(
    await page.evaluate(async () => {
      const tanks = await (await fetch("/api/v1/tanks")).json();
      return tanks.find((tank: { name: string }) => tank.name === "UK Tank")
        .volumeLitres;
    }),
  ).toBeCloseTo(46.5974225, 10);
  await page.reload();
  await expect(page.getByText("10 UK gal", { exact: true })).toBeVisible();
  // Switching straight from one Tank to another never shows the first Tank's data.
  const riverPath = new URL(tankUrl).pathname;
  await page.evaluate((riverPath) => {
    const w = window as unknown as { leaked: string[] };
    w.leaked = [];
    new MutationObserver(() => {
      const shown = document.querySelector("main")?.textContent ?? "";
      if (location.pathname === riverPath && /UK Tank|10 UK gal/.test(shown))
        w.leaked.push(shown);
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    history.pushState({}, "", riverPath);
    dispatchEvent(new PopStateEvent("popstate"));
  }, riverPath);
  await expect(page.getByRole("heading", { name: "River Tank" })).toBeVisible();
  await expect(page.getByText("18 UK gal", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { leaked: string[] }).leaked,
    ),
  ).toEqual([]);
  await page.goto("/tanks/000000000000000000000000");
  await expect(
    page.getByRole("heading", { name: "Tank not found" }),
  ).toBeFocused();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.route("**/api/v1/auth/logout", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sign-out was not confirmed",
  );
  await expect(page.getByRole("heading", { name: "Your Tanks" })).toBeVisible();
  await page.unroute("**/api/v1/auth/logout");
  await context.clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  // API navigation must pass through the proxy, never return index.html.
  const api = await page.goto("/api/v1/me");
  expect(api?.status()).toBe(401);
  expect(api?.headers()["content-type"]).toContain("application/json");
});

test("unavailable session and login network errors offer retry without claiming bad credentials", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Unable to connect" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await page.unroute("**/api/v1/me");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeFocused();
  await page.route("**/api/v1/auth/login", (route) => route.abort());
  await page.getByLabel("Email", { exact: true }).fill("browser@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("long enough password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your sign-in was not confirmed",
  );
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "browser@example.com",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});
