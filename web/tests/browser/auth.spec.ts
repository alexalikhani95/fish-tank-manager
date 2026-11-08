import { expect, test } from "@playwright/test";
import { email, password } from "./helpers";

test("empty install: signup → Tank → logout → login → WaterChange → reload, with the unchanged Secure cookie", async ({
  page,
  context,
}) => {
  page.on("pageerror", (error) =>
    console.error("BROWSER ERROR", error.message),
  );
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
  await expect(page.getByRole("link", { name: /^River Tank/ })).toBeVisible();
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
  await page.getByRole("link", { name: /^River Tank/ }).click();
  await expect(page).toHaveURL(tankUrl);
  await expect(page.getByRole("heading", { name: "River Tank" })).toBeVisible();
  // Log a WaterChange after signing back in: real POST, log and summaries.
  await page.getByRole("link", { name: "Log water change" }).click();
  await expect(
    page.getByRole("heading", { name: "Log water change" }),
  ).toBeFocused();
  const today = await page.evaluate(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(today);
  await page.getByLabel("Date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Percentage replaced (%)").fill("25");
  await page.getByLabel("Note (optional)").fill("Cleaned the filter");
  const save = page.waitForResponse("**/api/v1/tanks/*/water-changes");
  await page.getByRole("button", { name: "Save water change" }).click();
  expect((await save).status()).toBe(201);
  await expect(page).toHaveURL(tankUrl);
  await expect(page.getByRole("status")).toContainText("Water change saved.");
  const log = page.getByRole("list", { name: "Water change log" });
  await expect(log.getByRole("listitem")).toHaveCount(1);
  await expect(log).toContainText("1 Nov 2026");
  await expect(log).toContainText("25% replaced");
  await expect(log).toContainText("Cleaned the filter");
  await expect(page.getByText("None yet")).toHaveCount(0);
  await page.reload();
  await expect(log).toContainText("25% replaced");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("link", { name: /^River Tank/ })).toContainText(
    "Last water change: 1 Nov 2026",
  );
  await page.reload();
  await expect(page.getByRole("link", { name: /^River Tank/ })).toContainText(
    "Last water change: 1 Nov 2026",
  );
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
