import { expect, test } from "@playwright/test";
import { createTank, signIn } from "./helpers";

test("WaterChange form: field errors, offline-disabled save, unconfirmed save, same-day order and separate logs", async ({
  page,
  context,
}) => {
  page.on("pageerror", (error) =>
    console.error("BROWSER ERROR", error.message),
  );
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/water-changes"))
      posts++;
  });
  await signIn(page);
  const pondId = await createTank(page, "Pond Tank", 100);
  const shrimpId = await createTank(page, "Shrimp Tank", 20);
  await page.goto(`/tanks/${pondId}/water-change`);
  await expect(
    page.getByRole("heading", { name: "Log water change" }),
  ).toBeFocused();
  const date = page.getByLabel("Date", { exact: true });
  const percent = page.getByLabel("Percentage replaced (%)");
  const note = page.getByLabel("Note (optional)");
  const save = page.getByRole("button", { name: "Save water change" });

  // Client checks: no request, error announced, first invalid field focused.
  for (const value of ["", "0", "101", "2.5", "ten"]) {
    await percent.fill(value);
    await save.click();
    await expect(percent).toBeFocused();
    await expect(percent).toHaveAccessibleDescription(
      "Enter a whole number from 1 to 100.",
    );
  }
  await date.fill("");
  await save.click();
  await expect(date).toBeFocused();
  await expect(date).toHaveAccessibleDescription(
    "Enter the date of the change.",
  );
  expect(posts).toBe(0);

  // The API is authoritative for the upper bound; its field error is shown.
  await date.fill("2999-01-01");
  await percent.fill("30");
  await save.click();
  await expect(page.getByRole("alert")).toContainText(
    "Check the highlighted fields.",
  );
  await expect(date).toHaveAccessibleDescription(
    "Date cannot be in the future",
  );
  expect(posts).toBe(1);

  // Offline: the Shell's announced banner, save disabled, values kept, nothing
  // replayed on reconnect.
  await date.fill("2026-11-02");
  await note.fill("  Offline note  ");
  await context.setOffline(true);
  await expect(save).toBeDisabled();
  await expect(page.getByRole("status")).toContainText(
    "You’re offline. Connect before trying again.",
  );
  await expect(date).toHaveValue("2026-11-02");
  await expect(percent).toHaveValue("30");
  await expect(note).toHaveValue("  Offline note  ");
  await context.setOffline(false);
  await expect(save).toBeEnabled();
  await expect(note).toHaveValue("  Offline note  ");
  expect(posts).toBe(1);

  // Unconfirmed: values kept, one request, never retried automatically.
  await page.route("**/api/v1/tanks/*/water-changes", (route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
  await save.click();
  await expect(page.getByRole("alert")).toContainText(
    "Your water change was not confirmed as saved",
  );
  await expect(page.getByRole("alert")).toBeFocused();
  expect(posts).toBe(2);
  await expect(percent).toHaveValue("30");
  await expect(note).toHaveValue("  Offline note  ");
  await page.unroute("**/api/v1/tanks/*/water-changes");
  await page.getByRole("link", { name: "check the log" }).click();
  await expect(page.getByRole("heading", { name: "Pond Tank" })).toBeVisible();
  await expect(page.getByText("No water changes yet.")).toBeVisible();
  expect(posts).toBe(2);

  // Two entries on the same day: newest entry first.
  for (const value of ["30", "10"]) {
    await page.getByRole("link", { name: "Log water change" }).click();
    await expect(
      page.getByRole("heading", { name: "Log water change" }),
    ).toBeFocused();
    await date.fill("2026-11-02");
    await percent.fill(value);
    await save.click();
    await expect(page.getByRole("status")).toContainText("Water change saved.");
  }
  const entries = page.getByRole("list", { name: "Water change log" });
  await expect(entries.getByRole("listitem")).toHaveText([
    /2 Nov 2026.*10% replaced/,
    /2 Nov 2026.*30% replaced/,
  ]);
  await expect(
    page.getByText("2 Nov 2026", { exact: true }).first(),
  ).toBeVisible();

  // Switching Tanks never shows the other Tank's log, even for a frame.
  const shrimpPath = `/tanks/${shrimpId}`;
  await page.evaluate((shrimpPath) => {
    const w = window as unknown as { leaked: string[] };
    w.leaked = [];
    new MutationObserver(() => {
      const shown = document.querySelector("main")?.textContent ?? "";
      if (
        location.pathname === shrimpPath &&
        /Pond Tank|% replaced/.test(shown)
      )
        w.leaked.push(shown);
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    history.pushState({}, "", shrimpPath);
    dispatchEvent(new PopStateEvent("popstate"));
  }, shrimpPath);
  await expect(
    page.getByRole("heading", { name: "Shrimp Tank" }),
  ).toBeVisible();
  await expect(page.getByText("No water changes yet.")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { leaked: string[] }).leaked,
    ),
  ).toEqual([]);

  // Each dashboard card has its own summary and logging link.
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("link", { name: /^Pond Tank/ })).toContainText(
    "Last water change: 2 Nov 2026",
  );
  await expect(page.getByRole("link", { name: /^Shrimp Tank/ })).toContainText(
    "No water changes yet.",
  );
  await page
    .getByRole("link", { name: "Log water change for Shrimp Tank" })
    .click();
  await expect(page).toHaveURL(new RegExp(`${shrimpPath}/water-change$`));
  await expect(page.getByText("Shrimp Tank", { exact: true })).toBeVisible();
  await expect(percent).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(posts).toBe(4);
});
