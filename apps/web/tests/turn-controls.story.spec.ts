import { expect, test } from "@playwright/test";

test("Storybook runs control interaction and disabled state stories", async ({ page }) => {
  for (const story of ["your-turn", "last-token"]) {
    await page.goto(
      `http://127.0.0.1:6010/iframe.html?id=table-turn-controls--${story}&viewMode=story`,
    );
    await expect(page.getByRole("button", { name: "Take 1 1", exact: true })).toBeEnabled();
    if (story === "last-token")
      await expect(page.getByRole("button", { name: "Take 2 2", exact: true })).toBeDisabled();
    await expect(page.locator("#storybook-root")).toBeVisible();
  }
});
