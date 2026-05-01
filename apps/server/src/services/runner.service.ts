import pLimit from "p-limit";
import { readdir, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { extractTranscript } from "@healos/llm";
import { evaluateCase } from "./evaluate.service";
import type { ClinicalExtraction, StrategyType } from "@healos/shared"

const limit = pLimit(5);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const executeWithBackoff = async <T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> => {
  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.status === 429 && retries < maxRetries) {
        const delay = Math.pow(2, retries) * 1000; // 1s, 2s, 4s, 8s...
        console.warn(`Rate limited (429). Backing off for ${delay}ms...`);
        await sleep(delay);
        retries++;
      } else {
        throw error; 
      }
    }
  }
};

export const generatePromptHash = (strategy: StrategyType): string => {
  const promptContent = `strategy-${strategy}-v1`; 
  return crypto.createHash("sha256").update(promptContent).digest("hex");
};

export const runEvaluationSuite = async (
  strategy: StrategyType,
  model: string,
  force: boolean = false,
  onProgress?: (caseId: string, status: string) => void
) => {
  const promptHash = generatePromptHash(strategy);
  
  const dataDir = path.resolve(process.cwd(), "../../data");
  const transcriptsDir = path.join(dataDir, "transcripts");
  const goldDir = path.join(dataDir, "gold");
  
  const files = await readdir(transcriptsDir);
  const caseFiles = files.filter(f => f.endsWith(".txt"));

  console.log(`Starting run for ${caseFiles.length} cases using ${strategy} on ${model}`);
  console.log(`Reading data from: ${dataDir}`);

  const tasks = caseFiles.map(filename => limit(async () => {
    const caseId = filename.replace(".txt", "");
    
    const existingRun = null; 

    if (existingRun && !force) {
      onProgress?.(caseId, "SKIPPED_CACHED");
      return existingRun; 
    }

    onProgress?.(caseId, "PROCESSING");
    const transcript = await readFile(path.join(transcriptsDir, filename), "utf-8");
    const goldRaw = await readFile(path.join(goldDir, `${caseId}.json`), "utf-8");
    const goldData = JSON.parse(goldRaw) as ClinicalExtraction;

    const start = performance.now();
    const result = await executeWithBackoff(() => extractTranscript(transcript, strategy, model));
    const duration = performance.now() - start;

    let scores = null;
    if (result.success && result.data) {
      scores = evaluateCase(result.data, goldData, transcript);
    }

    const runRecord = {
      caseId,
      strategy,
      model,
      promptHash,
      success: result.success,
      duration,
      usage: result.usage,
      scores,
    };

    if (!result.success) {
      const errorMsg = result.error || result.trace?.[result.trace.length - 1]?.error || "Validation Failed";
      console.log(`\n [${caseId}] Failed: ${errorMsg}`);
      onProgress?.(caseId, "FAILED_EVAL");
    } else {
      onProgress?.(caseId, "COMPLETED");
    }

    return runRecord;
  }));
  const results = await Promise.all(tasks);
  
  const successfulRuns = results.filter(r => r.success && r.scores);
  const summary = {
    total: results.length,
    successes: successfulRuns.length,
    failures: results.length - successfulRuns.length,
    totalCost: calculateCost(results.map(r => r.usage)), 
    avgMedsF1: successfulRuns.length > 0 
      ? successfulRuns.reduce((acc, r) => acc + (r.scores!.medications || 0), 0) / successfulRuns.length 
      : 0,
  };

  return { summary, results };
};

const calculateCost = (usages: any[]) => {
  return usages.reduce((total, u) => {
    if (!u) return total;
    // Input: $0.25/1M, Cache Write: $0.30/1M, Cache Read: $0.03/1M, Output: $1.25/1M
    const inputCost = (u.inputTokens / 1_000_000) * 0.25;
    const cacheCreateCost = (u.cacheCreationTokens / 1_000_000) * 0.30;
    const cacheReadCost = (u.cacheReadTokens / 1_000_000) * 0.03;
    const outputCost = (u.outputTokens / 1_000_000) * 1.25;
    return total + inputCost + cacheCreateCost + cacheReadCost + outputCost;
  }, 0);
};