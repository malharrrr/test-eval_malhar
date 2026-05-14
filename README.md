# HealosBench

HealosBench is a high-performance evaluation harness and dashboard designed to benchmark Large Language Models (LLMs) on clinical data extraction tasks. It processes unstructured medical transcripts, extracts structured clinical entities (vitals, medications, diagnoses, and treatment plans), and scores the model's accuracy against a set of gold-standard annotations.

## How It Works

At its core, HealosBench automates the tedious process of validating LLM outputs in a healthcare context. The workflow is divided into three main phases:

1. **Extraction (`runner.service.ts`)**: The harness reads raw patient transcripts (`.txt`) and feeds them to an LLM (default: Haiku 4.5) alongside a specific extraction strategy. The LLM returns a structured JSON payload representing the patient's clinical state.
2. **Evaluation (`evaluate.service.ts`)**: The system compares the LLM's predictions against gold-standard JSON files. Instead of brittle exact-string matching, it uses a sophisticated scoring engine:
   - **Vitals**: Evaluated via exact match, with a 0.2-degree tolerance for temperature.
   - **Medications**: Uses text normalization (e.g., converting "bid" to "twice daily") and fuzzy string matching (0.75 threshold) to calculate an F1 score based on precision and recall.
   - **Diagnoses**: Matches descriptions using a 0.8 fuzzy threshold while strictly validating ICD-10 codes if present.
   - **Hallucination Detection**: Verifies "grounding" by checking if the extracted clinical facts lexically appear in the original transcript text, flagging ungrounded claims.
3. **Reporting (`index.ts` & `cli.ts`)**: Results are streamed in real-time via Server-Sent Events (SSE) to a Next.js dashboard, or outputted directly in the terminal via the CLI, complete with a detailed breakdown of token usage and API costs.

## System Architecture

The project is structured as a modern monorepo using **Turborepo** and **Bun** workspaces, allowing seamless code sharing between the frontend, backend, and database layers.

### Workspace Breakdown
- **`apps/server`**: A lightweight Hono HTTP server. It handles the evaluation execution, manages concurrency, and exposes an SSE endpoint (`/api/v1/runs`) to stream progress updates to the client. 
- **`apps/web`**: A Next.js 16 frontend styled with Tailwind CSS and Radix UI primitives. It consumes the SSE stream to render a live dashboard of evaluation metrics.
- **`packages/db`**: The data layer using PostgreSQL and Drizzle ORM for schema management and migrations.
- **`packages/llm` & `packages/shared`**: Shared TypeScript types, evaluation interfaces, and LLM orchestration logic ensuring end-to-end type safety.

## Technical Decisions

1. **Server-Sent Events (SSE) over WebSockets**
   Evaluating dozens of cases against an LLM can take minutes. Instead of leaving the client hanging or overcomplicating the stack with WebSockets, we use Hono's SSE streaming. This provides a unidirectional, real-time pipe to the Next.js dashboard, emitting `progress`, `complete`, and `error` events case-by-case.

2. **Fuzzy Matching & Clinical Normalization**
   Medical terminology is notoriously inconsistent (e.g., "Tylenol 500mg PO BID" vs. "acetaminophen 500 mg by mouth twice daily"). We built a custom normalization pipeline that standardizes abbreviations and relies on the `string-similarity` algorithm to calculate F1 scores. This ensures the evaluation penalizes actual clinical errors rather than formatting quirks.

3. **Concurrency Control with p-limit**
   To prevent aggressive rate-limiting from the Anthropic API (HTTP 429), the LLM runner strictly limits concurrency using `p-limit(5)`. 

4. **Graceful Exponential Backoff**
   Even with concurrency limits, network spikes or tier limits can trigger 429s. The runner wraps LLM calls in a custom `executeWithBackoff` loop, automatically retrying with exponentially increasing delays (1s, 2s, 4s, 8s...) to ensure long evaluation suites don't crash halfway through.

5. **Granular Cost Tracking**
   Benchmarking gets expensive. The system tracks token usage at a granular level, specifically accounting for Anthropic's Prompt Caching economics. It calculates total run cost by separating input tokens ($0.25/1M), output tokens ($1.25/1M), cache creation ($0.30/1M), and cache reads ($0.03/1M).

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (v1.3+)
- Docker (for local Postgres DB)

### Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Start the database:
   ```bash
   docker-compose up -d
   ```

3. Run database migrations:
   ```bash
   bun run db:push
   ```

4. Start the development environment (Server + Web):
   ```bash
   bun run dev
   ```

### Running Evaluations via CLI

You can bypass the UI and run the evaluation harness directly from the terminal:
```bash
bun run eval --strategy=zero_shot --model=claude-haiku-4-5-20251001
```