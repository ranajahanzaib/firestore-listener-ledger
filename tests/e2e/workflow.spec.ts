import { expect, test } from "@playwright/test";
test("real demo trace to dashboard report", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByText("Inbox item 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start profiling" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(
    page.getByText("Conversation item 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Modify document" }).click();
  await expect(page.getByText("Updated demo item")).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("Activity item 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop profiling" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export trace" }).click();
  const trace = await pending;
  const path = await trace.path();
  expect(path).toBeTruthy();
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Import trace").setInputFiles(path!);
  await expect(page.getByText("Imported profiling trace")).toBeVisible();
  await expect(
    page.getByText("Listener survives screen exit").first(),
  ).toBeVisible();
  await page.getByLabel("Daily active users").fill("1000");
  await expect(page.getByText("PROJECTED DAILY DOCUMENT READS")).toBeVisible();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export HTML" }).click();
  expect((await exported).suggestedFilename()).toBe(
    "listenerledger-report.html",
  );
});
test("rejects invalid import and loads synthetic sample", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Import trace").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Explore synthetic sample" }).click();
  await expect(page.getByText("Synthetic demonstration")).toBeVisible();
});
