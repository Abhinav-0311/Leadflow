import { expect, test } from "@playwright/test";

test("create, discuss, schedule, change status, and reload", async ({ page }, testInfo) => {
  const name = `Alex ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your leads" })).toBeVisible();
  await page.getByRole("button", { name: "Add lead", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(page.getByLabel("Full name")).toBeFocused();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Company", { exact: false }).fill("Example Studio");
  await page.getByLabel("Phone", { exact: false }).fill("+91 98765 43210");
  await dialog.getByRole("button", { name: "Add lead", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  await expect(dialog.getByText("No discussions yet")).toBeVisible();
  await page.getByLabel("Log a discussion").fill("Discussed pricing and next steps.");
  await page.getByLabel("Schedule a follow-up").check();
  const localDate = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T23:59`;
  });
  await page.getByLabel("Date & time").fill(localDate);
  await page.getByRole("button", { name: "Save discussion" }).click();
  await expect(dialog.getByText("Discussion saved.", { exact: true })).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("Proposal Sent");
  await expect(dialog.getByText("Status updated.", { exact: true })).toBeVisible();
  await page.getByLabel("Log a discussion").fill("Confirmed the follow-up.");
  await page.getByRole("button", { name: "Save discussion" }).click();
  await expect(dialog.getByText("Discussion saved.", { exact: true })).toBeVisible();
  await expect(dialog.locator(".timeline li").first()).toContainText("Confirmed the follow-up.");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const today = page.getByRole("region", { name: "Today’s follow-ups" });
  await expect(today.getByRole("button", { name: `Open ${name}`, exact: true })).toContainText("Confirmed the follow-up.");
  await expect(page.getByRole("button", { name: `Open ${name}`, exact: true })).toHaveCount(1);
  await page.reload();
  await expect(today.getByRole("button", { name: `Open ${name}`, exact: true })).toContainText("Proposal Sent");
  await page.getByRole("button", { name: "Won", exact: true }).click();
  await expect(page.getByRole("button", { name: `Open ${name}`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Proposal Sent", exact: true }).click();
  await page.getByLabel("Search leads by name").fill(name.toLowerCase());
  await expect(page.locator(".lead-row")).toHaveCount(1);
  await page.getByLabel("Search leads by name").fill("no-such-person-xyz");
  await expect(page.getByRole("heading", { name: "No matching leads" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("button", { name: "All leads", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("failed saves preserve the draft and can be retried", async ({ page, request }, testInfo) => {
  const name = `Retry ${testInfo.project.name} ${Date.now()}`;
  await request.post("/api/leads", { data: { name } });
  await page.goto("/");
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  await expect(page.getByRole("dialog").getByText("No discussions yet", { exact: true })).toBeVisible();
  await page.getByLabel("Log a discussion").fill("Keep this note when the network fails.");
  await page.route("**/api/leads/*/discussions", async route => {
    if (route.request().method() === "POST") await route.fulfill({ status: 500, json: { detail: "Please try again." } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save discussion" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Please try again.");
  await expect(page.getByLabel("Log a discussion")).toHaveValue("Keep this note when the network fails.");
  await page.unroute("**/api/leads/*/discussions");
  await page.getByRole("button", { name: "Save discussion" }).click();
  await expect(page.getByText("Discussion saved.", { exact: true })).toBeVisible();
});

test("load errors offer a working retry", async ({ page }) => {
  await page.route("**/api/leads", route => route.fulfill({ status: 503, json: { detail: "API temporarily unavailable." } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Couldn’t load your leads" })).toBeVisible();
  await page.unroute("**/api/leads");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Couldn’t load your leads" })).toHaveCount(0);
  await expect(page.locator(".lead-row").first()).toBeVisible();
});

test("native modal blocks background focus and restores its trigger", async ({ page }) => {
  await page.goto("/");
  const trigger = page.locator("main").getByRole("button", { name: "Add lead", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Full name")).toBeFocused();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press("Tab");
    // Native dialogs include browser chrome in Tab traversal, but keep the page background inert.
    expect(await page.evaluate(() => document.activeElement === document.body
      || Boolean(document.activeElement?.closest("dialog")))).toBe(true);
  }
  await page.getByLabel("Full name").focus();
  await trigger.evaluate(element => element.focus());
  await expect(page.getByLabel("Full name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("overdue follow-ups are labeled and the layout fits the viewport", async ({ page, request }, testInfo) => {
  const name = `Overdue ${testInfo.project.name} ${Date.now()}`;
  const lead = await (await request.post("/api/leads", { data: { name } })).json();
  await request.post(`/api/leads/${lead.id}/discussions`, { data: {
    note: "This follow-up is overdue.", follow_up_at: "2020-01-01T09:00:00Z",
  } });
  await page.goto("/");
  await expect(page.getByRole("button", { name: `Open ${name}`, exact: true }).locator(".overdue")).toContainText("Overdue");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("This follow-up is overdue.", { exact: true })).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
