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

test("attention filters and completing a follow-up preserve history and drafts", async ({ page, request }, testInfo) => {
  await page.clock.install({ time: new Date("2026-10-13T10:00:00Z") });
  const prefix = `Focus ${testInfo.project.name} ${Date.now()}`;
  const ids: number[] = [];
  for (const [suffix, date] of [["Past", "2026-10-13T03:30:00Z"], ["Next", "2026-10-13T11:30:00Z"]]) {
    const lead = await (await request.post("/api/leads", { data: { name: `${prefix} ${suffix}` } })).json();
    ids.push(lead.id);
    await request.post(`/api/leads/${lead.id}/discussions`, { data: { note: `Original ${suffix} discussion.`, follow_up_at: date } });
  }
  await page.goto("/");
  await page.getByLabel("Search leads by name").fill(prefix);
  const today = page.getByRole("button", { name: /^Due today/ });
  const overdue = page.getByRole("button", { name: /^Overdue/ });
  await expect(today).toContainText("2");
  await expect(overdue).toContainText("1");
  await today.click();
  await expect(page.locator(".lead-row")).toHaveCount(2);
  await overdue.click();
  await expect(page.locator(".lead-row")).toHaveCount(1);
  await page.getByRole("button", { name: `Open ${prefix} Past`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Original Past discussion.", { exact: true })).toBeVisible();
  await page.getByLabel("Log a discussion").fill("A draft to keep while completing the reminder.");
  await dialog.getByRole("button", { name: "Mark complete" }).click();
  await expect(dialog.getByText("Follow-up completed.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Log a discussion")).toHaveValue("A draft to keep while completing the reminder.");
  await expect(dialog.getByText("Original Past discussion.", { exact: true })).toBeVisible();
  await expect(dialog.locator(".scheduled-note")).toHaveCount(1);
  page.once("dialog", confirmation => confirmation.dismiss());
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toBeVisible();
  page.once("dialog", confirmation => confirmation.accept());
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("heading", { name: "No overdue follow-ups" })).toBeVisible();
  await expect(today).toContainText("1");
  await today.click();
  await expect(page.locator(".lead-row")).toHaveCount(1);
  await expect(page.locator(".lead-row")).toContainText(`${prefix} Next`);
  await page.reload();
  await page.getByLabel("Search leads by name").fill(`${prefix} Past`);
  await expect(page.locator(".lead-row .follow-up")).toHaveCount(0);
  expect((await (await request.get(`/api/leads/${ids[0]}`)).json()).follow_up_at).toBeNull();
});

test("failed follow-up completion keeps the reminder and allows retry", async ({ page, request }, testInfo) => {
  const name = `Complete retry ${testInfo.project.name} ${Date.now()}`;
  const lead = await (await request.post("/api/leads", { data: { name } })).json();
  await request.post(`/api/leads/${lead.id}/discussions`, { data: { note: "Keep the reminder until saved.", follow_up_at: "2020-01-01T09:00:00Z" } });
  await page.goto("/");
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  await page.route(`**/api/leads/${lead.id}/follow-up`, route => route.fulfill({ status: 500, json: { detail: "Could not complete this follow-up." } }));
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Mark complete" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Could not complete this follow-up.");
  await expect(dialog.getByText("Overdue follow-up", { exact: true })).toBeVisible();
  await page.unroute(`**/api/leads/${lead.id}/follow-up`);
  await dialog.getByRole("button", { name: "Mark complete" }).click();
  await expect(dialog.getByText("Follow-up completed.", { exact: true })).toBeVisible();
  await expect(dialog.locator(".current-appointment")).toHaveCount(0);
});

test("a failed status update preserves the status and note draft", async ({ page, request }, testInfo) => {
  const name = `Status retry ${testInfo.project.name} ${Date.now()}`;
  const lead = await (await request.post("/api/leads", { data: { name } })).json();
  await page.goto("/");
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("No discussions yet", { exact: true })).toBeVisible();
  await page.getByLabel("Log a discussion").fill("Unsaved context.");
  await page.route(`**/api/leads/${lead.id}`, route => route.fulfill({ status: 500, json: { detail: "Could not update the status." } }));
  await page.getByLabel("Status", { exact: true }).selectOption("Won");
  await expect(dialog.getByRole("alert")).toHaveText("Could not update the status.");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("New");
  await expect(page.getByLabel("Log a discussion")).toHaveValue("Unsaved context.");
});
