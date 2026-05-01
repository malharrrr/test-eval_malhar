import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import { runEvaluationSuite } from "./services/runner.service";
import type { StrategyType } from "@healos/shared";

const app = new Hono();
app.use("/api/*", cors());

app.post("/api/v1/runs", async (c) => {
  const body = await c.req.json();
  const strategy = (body.strategy || "zero_shot") as StrategyType;
  const model = body.model || "claude-haiku-4-5-20251001";
  const force = body.force || false;

  console.log(`Dashboard requested run: ${strategy} on ${model}`);

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => {
      console.log("Client aborted SSE connection");
    });

    const onProgress = async (caseId: string, status: string) => {
      await stream.writeSSE({
        data: JSON.stringify({ caseId, status }),
        event: "progress",
        id: String(Date.now()),
      });
    };

    try {
      const { summary, results } = await runEvaluationSuite(strategy, model, force, onProgress);
      
      await stream.writeSSE({
        data: JSON.stringify({ summary, results }),
        event: "complete",
        id: String(Date.now()),
      });
    } catch (error: any) {
      await stream.writeSSE({
        data: JSON.stringify({ error: error.message }),
        event: "error",
      });
    }
  });
});

export default {
  port: 8787,
  fetch: app.fetch,
};