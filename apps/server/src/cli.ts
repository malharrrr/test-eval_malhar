import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../.env") });

import { runEvaluationSuite } from "./services/runner.service";
import type { StrategyType } from "@healos/shared";

async function main() {
  const args = process.argv.slice(2);
  let strategy: StrategyType = "zero_shot";
  let model = "claude-haiku-4-5-20251001";

  for (const arg of args) {
    if (arg.startsWith("--strategy=")) {
      strategy = arg.split("=")[1] as StrategyType;
    }
    if (arg.startsWith("--model=")) {
      model = arg.split("=")[1]!;
    }
  }

  console.log(`\n Starting evaluation harness...`);
  console.log(`Strategy: ${strategy} | Model: ${model}\n`);

  const { summary } = await runEvaluationSuite(
    strategy, 
    model, 
    true, // force true for CLI runs so we always evaluate fresh
    (caseId, status) => {
      // print inline progress dots/statuses
      process.stdout.write(`[${caseId}: ${status}] `);
    }
  );

  console.log("\n\n === EVALUATION SUMMARY ===");
  console.table([summary]);
  process.exit(0);
}

main().catch((err) => {
  console.error("CLI Failed:", err);
  process.exit(1);
});