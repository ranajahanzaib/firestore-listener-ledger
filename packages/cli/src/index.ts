#!/usr/bin/env node
import {
  analyze,
  htmlReport,
  importReport,
  terminalReport,
  traceSchema,
} from "@listenerledger/core";
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
const cli = new Command()
  .name("listenerledger")
  .description("Local Firestore listener evidence and explicit read estimates")
  .version("0.1.0");
const load = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));
cli
  .command("validate")
  .argument("<trace>")
  .description("Validate a version 1 trace")
  .action(async (path) => {
    traceSchema.parse(await load(path));
    console.log("Valid ListenerLedger v1 trace");
  });
cli
  .command("analyze")
  .argument("<trace>")
  .option("--dau <number>", "Daily active users", "1")
  .option("--sessions-per-user <number>", "Sessions per user per day", "1")
  .option("--budget <number>", "Modeled daily read budget", "50000")
  .option("--scenario <scenario>", "light, baseline or heavy", "baseline")
  .option(
    "--additional-reads <number>",
    "Unobserved reads assumed per session",
    "0",
  )
  .option(
    "--reconnect-minutes <number>",
    "Declared backend disconnect duration",
  )
  .option(
    "--reconnect-count <number>",
    "Declared reconnect cycles per session",
    "0",
  )
  .option("--persistence <mode>", "memory, persistent or unknown", "unknown")
  .option("--format <format>", "text or json", "text")
  .option("--out <path>")
  .option("--fail-on-budget", "Exit 2 when modeled projection exceeds budget")
  .action(async (path, o) => {
    if (!["text", "json"].includes(o.format))
      throw new Error("format must be text or json");
    const report = analyze(await load(path), {
      dau: Number(o.dau),
      sessionsPerUser: Number(o.sessionsPerUser),
      budget: Number(o.budget),
      scenario: o.scenario,
      additionalReads: Number(o.additionalReads),
      reconnectMinutes:
        o.reconnectMinutes === undefined ? null : Number(o.reconnectMinutes),
      reconnectCount: Number(o.reconnectCount),
      persistence: o.persistence,
    });
    const output =
      o.format === "json"
        ? JSON.stringify(report, null, 2)
        : terminalReport(report);
    if (o.out) await writeFile(o.out, output);
    else console.log(output);
    if (o.failOnBudget && report.summary.budgetExceeded) process.exitCode = 2;
  });
cli
  .command("report")
  .argument("<report>")
  .requiredOption("--out <path>")
  .description("Render a validated JSON report as standalone HTML")
  .action(async (path, o) => {
    await writeFile(o.out, htmlReport(importReport(await load(path))));
  });
try {
  await cli.parseAsync();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
