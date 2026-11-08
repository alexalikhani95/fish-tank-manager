import { expect, type Page } from "@playwright/test";

// One User per browser suite: sign-up closes after the first (ADR-0010).
export const email = "browser@example.com";
export const password = "  exact browser password  ";

/**
 * Sign in through Chromium's own fetch, creating the User if this spec runs
 * first, so the browser holds the real Secure cookie. The empty-install signup
 * journey itself is proved in auth.spec.ts.
 */
export async function signIn(page: Page) {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  const status = await page.evaluate(
    async ({ email, password }) => {
      const post = (action: string) =>
        fetch(`/api/v1/auth/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      const register = await post("register");
      return register.status === 403
        ? (await post("login")).status
        : register.status;
    },
    { email, password },
  );
  expect([200, 201]).toContain(status);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Tanks" })).toBeVisible();
}

/** Create a Tank through the real API, in litres, and return its id. */
export async function createTank(page: Page, name: string, litres: number) {
  return page.evaluate(
    async ({ name, litres }) => {
      const response = await fetch("/api/v1/tanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, volumeLitres: litres }),
      });
      if (response.status !== 201) throw new Error(`create ${response.status}`);
      return (await response.json())._id as string;
    },
    { name, litres },
  );
}
