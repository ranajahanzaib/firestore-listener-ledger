import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test("capture authentic project showcase screenshots", async ({
  page,
}, testInfo) => {
  const screenshotsDir = path.resolve(process.cwd(), "docs/screenshots");
  fs.mkdirSync(screenshotsDir, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 960 });

  // 1. Exercise the real emulator-connected demo application
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(page.getByText("Inbox item 1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start profiling" }).click();
  await page.getByRole("checkbox").check();

  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page.getByText("New local demo item")).toBeVisible();

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

  // Capture Emulator Demo App screenshot
  await page.screenshot({
    path: path.join(screenshotsDir, "emulator-demo.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: "Stop profiling" }).click();
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export trace" }).click();
  const traceFile = await pendingDownload;
  const tracePath = await traceFile.path();
  expect(tracePath).toBeTruthy();

  // 2. Load the exported trace into the Dashboard
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Import trace").setInputFiles(tracePath!);
  await expect(page.getByText("Imported profiling trace")).toBeVisible();

  // Configure workload parameters
  await page.getByLabel("Daily active users").fill("1000");
  await page.getByLabel("Sessions / user").fill("2");
  await page.getByLabel("Daily read budget").fill("50000");

  // Expand all findings in section 04 so details and advice are shown
  await page.evaluate(() => {
    document.querySelectorAll("details").forEach((d) => (d.open = true));
  });

  // Capture Overview screenshot (Full Page)
  await page.screenshot({
    path: path.join(screenshotsDir, "overview.png"),
    fullPage: true,
  });

  // Capture Dashboard upper section (Hero & Columns 01/02)
  await page.screenshot({
    path: path.join(screenshotsDir, "dashboard.png"),
    clip: { x: 0, y: 0, width: 1440, height: 960 },
  });

  // Capture Section 03: Listener Lifecycle timeline
  const lifecycleSection = page.locator("section:has(.timeline)");
  await lifecycleSection.scrollIntoViewIfNeeded();
  await lifecycleSection.screenshot({
    path: path.join(screenshotsDir, "lifecycle-timeline.png"),
  });

  // Capture Section 04: Findings & Evidence
  const findingsSection = page.locator("section:has(details)");
  await findingsSection.scrollIntoViewIfNeeded();
  await findingsSection.screenshot({
    path: path.join(screenshotsDir, "findings-evidence.png"),
  });

  // 3. Render genuine CLI output in a beautiful terminal canvas and capture cli-demo.png
  const cliOutput = execFileSync(
    "node",
    [
      "packages/cli/dist/index.js",
      "analyze",
      "fixtures/traces/churn.json",
      "--dau",
      "500",
      "--sessions-per-user",
      "2",
    ],
    { encoding: "utf8" },
  );

  const terminalHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #111413;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 40px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          }
          .terminal-window {
            background: #181c19;
            border: 1px solid #2a332c;
            border-radius: 12px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
            width: 100%;
            max-width: 1100px;
            overflow: hidden;
          }
          .title-bar {
            background: #1f2521;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid #2a332c;
          }
          .buttons {
            display: flex;
            gap: 8px;
          }
          .button {
            width: 12px;
            height: 12px;
            border-radius: 50%;
          }
          .btn-close { background: #ff5f56; }
          .btn-minimize { background: #ffbd2e; }
          .btn-maximize { background: #27c93f; }
          .title {
            flex-grow: 1;
            text-align: center;
            font-size: 13px;
            color: #8fa393;
            font-weight: 500;
          }
          .body {
            padding: 24px 28px;
            color: #d1d9d2;
            font-size: 14px;
            line-height: 1.65;
            white-space: pre-wrap;
          }
          .prompt {
            color: #58a6ff;
            font-weight: 600;
          }
          .command {
            color: #f0f6fc;
            font-weight: 600;
          }
          .highlight {
            color: #7ee787;
          }
          .warn-text {
            color: #f2cc60;
          }
          .dim-text {
            color: #8b949e;
          }
        </style>
      </head>
      <body>
        <div class="terminal-window">
          <div class="title-bar">
            <div class="buttons">
              <span class="button btn-close"></span>
              <span class="button btn-minimize"></span>
              <span class="button btn-maximize"></span>
            </div>
            <div class="title">terminal — listenerledger analyze</div>
          </div>
          <div class="body"><span class="prompt">$ </span><span class="command">listenerledger analyze fixtures/traces/churn.json --dau 500 --sessions-per-user 2</span>\n\n${escapeHtml(cliOutput)}</div>
        </div>
      </body>
    </html>
  `;

  function escapeHtml(str: string) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/(Observed:[^\n]+)/g, '<span class="highlight">$1</span>')
      .replace(
        /(Modeled document reads:[^\n]+)/g,
        '<span class="highlight">$1</span>',
      )
      .replace(
        /(Projected daily reads:[^\n]+)/g,
        '<span class="warn-text">$1</span>',
      )
      .replace(
        /(Approaching daily read budget:[^\n]+)/g,
        '<span class="warn-text">$1</span>',
      )
      .replace(
        /(Subscription churn:[^\n]+)/g,
        '<span class="warn-text">$1</span>',
      )
      .replace(
        /(Listener survives screen exit:[^\n]+)/g,
        '<span class="warn-text">$1</span>',
      )
      .replace(
        /(Unknown overhead:[^\n]+)/g,
        '<span class="dim-text">$1</span>',
      );
  }

  await page.setContent(terminalHtml);
  const terminalElement = page.locator(".terminal-window");
  await terminalElement.screenshot({
    path: path.join(screenshotsDir, "cli-demo.png"),
  });
});
