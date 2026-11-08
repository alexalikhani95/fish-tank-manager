import { expect, test } from "@playwright/test";
import { createTank, signIn } from "./helpers";

test("Add Tank in a UK-gallon preference: field errors, unconfirmed create, Tank switch and missing Tank", async ({
  page,
}) => {
  page.on("pageerror", (error) =>
    console.error("BROWSER ERROR", error.message),
  );
  await signIn(page);
  const riverId = await createTank(page, "Second Tank", 80.25);
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
  const riverPath = `/tanks/${riverId}`;
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
  await expect(
    page.getByRole("heading", { name: "Second Tank" }),
  ).toBeVisible();
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
});
