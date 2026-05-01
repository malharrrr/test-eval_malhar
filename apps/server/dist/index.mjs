import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import { readFile, readdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { extractTranscript } from "@healos/llm";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region ../../node_modules/.bun/yocto-queue@1.2.2/node_modules/yocto-queue/index.js
var Node = class {
	value;
	next;
	constructor(value) {
		this.value = value;
	}
};
var Queue = class {
	#head;
	#tail;
	#size;
	constructor() {
		this.clear();
	}
	enqueue(value) {
		const node = new Node(value);
		if (this.#head) {
			this.#tail.next = node;
			this.#tail = node;
		} else {
			this.#head = node;
			this.#tail = node;
		}
		this.#size++;
	}
	dequeue() {
		const current = this.#head;
		if (!current) return;
		this.#head = this.#head.next;
		this.#size--;
		if (!this.#head) this.#tail = void 0;
		return current.value;
	}
	peek() {
		if (!this.#head) return;
		return this.#head.value;
	}
	clear() {
		this.#head = void 0;
		this.#tail = void 0;
		this.#size = 0;
	}
	get size() {
		return this.#size;
	}
	*[Symbol.iterator]() {
		let current = this.#head;
		while (current) {
			yield current.value;
			current = current.next;
		}
	}
	*drain() {
		while (this.#head) yield this.dequeue();
	}
};
//#endregion
//#region ../../node_modules/.bun/p-limit@7.3.0/node_modules/p-limit/index.js
function pLimit(concurrency) {
	let rejectOnClear = false;
	if (typeof concurrency === "object") ({concurrency, rejectOnClear = false} = concurrency);
	validateConcurrency(concurrency);
	if (typeof rejectOnClear !== "boolean") throw new TypeError("Expected `rejectOnClear` to be a boolean");
	const queue = new Queue();
	let activeCount = 0;
	const resumeNext = () => {
		if (activeCount < concurrency && queue.size > 0) {
			activeCount++;
			queue.dequeue().run();
		}
	};
	const next = () => {
		activeCount--;
		resumeNext();
	};
	const run = async (function_, resolve, arguments_) => {
		const result = (async () => function_(...arguments_))();
		resolve(result);
		try {
			await result;
		} catch {}
		next();
	};
	const enqueue = (function_, resolve, reject, arguments_) => {
		const queueItem = { reject };
		new Promise((internalResolve) => {
			queueItem.run = internalResolve;
			queue.enqueue(queueItem);
		}).then(run.bind(void 0, function_, resolve, arguments_));
		if (activeCount < concurrency) resumeNext();
	};
	const generator = (function_, ...arguments_) => new Promise((resolve, reject) => {
		enqueue(function_, resolve, reject, arguments_);
	});
	Object.defineProperties(generator, {
		activeCount: { get: () => activeCount },
		pendingCount: { get: () => queue.size },
		clearQueue: { value() {
			if (!rejectOnClear) {
				queue.clear();
				return;
			}
			const abortError = AbortSignal.abort().reason;
			while (queue.size > 0) queue.dequeue().reject(abortError);
		} },
		concurrency: {
			get: () => concurrency,
			set(newConcurrency) {
				validateConcurrency(newConcurrency);
				concurrency = newConcurrency;
				queueMicrotask(() => {
					while (activeCount < concurrency && queue.size > 0) resumeNext();
				});
			}
		},
		map: { async value(iterable, function_) {
			const promises = Array.from(iterable, (value, index) => this(function_, value, index));
			return Promise.all(promises);
		} }
	});
	return generator;
}
function validateConcurrency(concurrency) {
	if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) throw new TypeError("Expected `concurrency` to be a number from 1 and up");
}
//#endregion
//#region src/services/evaluate.service.ts
var import_src = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		compareTwoStrings,
		findBestMatch
	};
	function compareTwoStrings(first, second) {
		first = first.replace(/\s+/g, "");
		second = second.replace(/\s+/g, "");
		if (first === second) return 1;
		if (first.length < 2 || second.length < 2) return 0;
		let firstBigrams = /* @__PURE__ */ new Map();
		for (let i = 0; i < first.length - 1; i++) {
			const bigram = first.substring(i, i + 2);
			const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) + 1 : 1;
			firstBigrams.set(bigram, count);
		}
		let intersectionSize = 0;
		for (let i = 0; i < second.length - 1; i++) {
			const bigram = second.substring(i, i + 2);
			const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) : 0;
			if (count > 0) {
				firstBigrams.set(bigram, count - 1);
				intersectionSize++;
			}
		}
		return 2 * intersectionSize / (first.length + second.length - 2);
	}
	function findBestMatch(mainString, targetStrings) {
		if (!areArgsValid(mainString, targetStrings)) throw new Error("Bad arguments: First argument should be a string, second should be an array of strings");
		const ratings = [];
		let bestMatchIndex = 0;
		for (let i = 0; i < targetStrings.length; i++) {
			const currentTargetString = targetStrings[i];
			const currentRating = compareTwoStrings(mainString, currentTargetString);
			ratings.push({
				target: currentTargetString,
				rating: currentRating
			});
			if (currentRating > ratings[bestMatchIndex].rating) bestMatchIndex = i;
		}
		return {
			ratings,
			bestMatch: ratings[bestMatchIndex],
			bestMatchIndex
		};
	}
	function areArgsValid(mainString, targetStrings) {
		if (typeof mainString !== "string") return false;
		if (!Array.isArray(targetStrings)) return false;
		if (!targetStrings.length) return false;
		if (targetStrings.find(function(s) {
			return typeof s !== "string";
		})) return false;
		return true;
	}
})))(), 1);
const calculateSimilarity = (str1, str2) => {
	if (!str1 && !str2) return 1;
	if (!str1 || !str2) return 0;
	return import_src.compareTwoStrings(str1.toLowerCase().trim(), str2.toLowerCase().trim());
};
const isFuzzyMatch = (str1, str2, threshold = .8) => {
	return calculateSimilarity(str1, str2) >= threshold;
};
const calculateF1 = (precision, recall) => {
	if (precision + recall === 0) return 0;
	return 2 * precision * recall / (precision + recall);
};
const normalizeMedText = (text) => {
	return text.toLowerCase().trim().replace(/\bbid\b/g, "twice daily").replace(/\btid\b/g, "three times daily").replace(/\bpo\b/g, "by mouth").replace(/\bprn\b/g, "as needed").replace(/mg/g, " mg");
};
const evaluateVitals = (pred, gold) => {
	let score = 0;
	const total = 4;
	if (pred.bp === gold.bp) score++;
	if (pred.hr === gold.hr) score++;
	if (pred.spo2 === gold.spo2) score++;
	if (pred.temp_f === gold.temp_f) score++;
	else if (pred.temp_f !== null && gold.temp_f !== null && Math.abs(pred.temp_f - gold.temp_f) <= .2) score++;
	return score / total;
};
const evaluateMedications = (pred, gold) => {
	if (pred.length === 0 && gold.length === 0) return 1;
	if (pred.length === 0 || gold.length === 0) return 0;
	let correctMatches = 0;
	for (const p of pred) if (gold.some((g) => {
		const nameMatch = isFuzzyMatch(p.name, g.name, .75);
		const doseFreqMatch = normalizeMedText(p.dose) === normalizeMedText(g.dose) && normalizeMedText(p.frequency) === normalizeMedText(g.frequency);
		return nameMatch && doseFreqMatch;
	})) correctMatches++;
	return calculateF1(correctMatches / pred.length, correctMatches / gold.length);
};
const evaluateDiagnoses = (pred, gold) => {
	if (pred.length === 0 && gold.length === 0) return 1;
	if (pred.length === 0 || gold.length === 0) return 0;
	let correctMatches = 0;
	for (const p of pred) if (gold.some((g) => {
		const descMatch = isFuzzyMatch(p.description, g.description, .8);
		const icdMatch = p.icd10 && g.icd10 ? p.icd10 === g.icd10 : true;
		return descMatch && icdMatch;
	})) correctMatches++;
	return calculateF1(correctMatches / pred.length, correctMatches / gold.length);
};
const evaluatePlan = (pred, gold) => {
	if (pred.length === 0 && gold.length === 0) return 1;
	if (pred.length === 0 || gold.length === 0) return 0;
	let correctMatches = 0;
	for (const p of pred) if (gold.some((g) => isFuzzyMatch(p, g, .75))) correctMatches++;
	return calculateF1(correctMatches / pred.length, correctMatches / gold.length);
};
const detectHallucinations = (pred, transcript) => {
	let hallucinations = 0;
	const transcriptLower = transcript.toLowerCase();
	const isGrounded = (val) => {
		if (!val) return true;
		const cleanVal = val.toLowerCase().trim();
		if (transcriptLower.includes(cleanVal)) return true;
		const words = cleanVal.split(" ");
		return words.filter((w) => transcriptLower.includes(w)).length / words.length >= .5;
	};
	if (!isGrounded(pred.chief_complaint)) hallucinations++;
	pred.diagnoses.forEach((d) => {
		if (!isGrounded(d.description)) hallucinations++;
	});
	pred.plan.forEach((p) => {
		if (!isGrounded(p)) hallucinations++;
	});
	return hallucinations;
};
const evaluateCase = (pred, gold, transcript) => {
	return {
		chief_complaint: calculateSimilarity(pred.chief_complaint, gold.chief_complaint),
		vitals: evaluateVitals(pred.vitals, gold.vitals),
		medications: evaluateMedications(pred.medications, gold.medications),
		diagnoses: evaluateDiagnoses(pred.diagnoses, gold.diagnoses),
		plan: evaluatePlan(pred.plan, gold.plan),
		follow_up: pred.follow_up.interval_days === gold.follow_up.interval_days && isFuzzyMatch(pred.follow_up.reason, gold.follow_up.reason) ? 1 : 0,
		hallucinationCount: detectHallucinations(pred, transcript)
	};
};
//#endregion
//#region src/services/runner.service.ts
const limit = pLimit(5);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const executeWithBackoff = async (fn, maxRetries = 5) => {
	let retries = 0;
	while (true) try {
		return await fn();
	} catch (error) {
		if (error.status === 429 && retries < maxRetries) {
			const delay = Math.pow(2, retries) * 1e3;
			console.warn(`Rate limited (429). Backing off for ${delay}ms...`);
			await sleep(delay);
			retries++;
		} else throw error;
	}
};
const generatePromptHash = (strategy) => {
	const promptContent = `strategy-${strategy}-v1`;
	return crypto.createHash("sha256").update(promptContent).digest("hex");
};
const runEvaluationSuite = async (strategy, model, force = false, onProgress) => {
	const promptHash = generatePromptHash(strategy);
	const dataDir = path.resolve(process.cwd(), "../../data");
	const transcriptsDir = path.join(dataDir, "transcripts");
	const goldDir = path.join(dataDir, "gold");
	const caseFiles = (await readdir(transcriptsDir)).filter((f) => f.endsWith(".txt"));
	console.log(`Starting run for ${caseFiles.length} cases using ${strategy} on ${model}`);
	console.log(`Reading data from: ${dataDir}`);
	const tasks = caseFiles.map((filename) => limit(async () => {
		const caseId = filename.replace(".txt", "");
		onProgress?.(caseId, "PROCESSING");
		const transcript = await readFile(path.join(transcriptsDir, filename), "utf-8");
		const goldRaw = await readFile(path.join(goldDir, `${caseId}.json`), "utf-8");
		const goldData = JSON.parse(goldRaw);
		const start = performance.now();
		const result = await executeWithBackoff(() => extractTranscript(transcript, strategy, model));
		const duration = performance.now() - start;
		let scores = null;
		if (result.success && result.data) scores = evaluateCase(result.data, goldData, transcript);
		const runRecord = {
			caseId,
			strategy,
			model,
			promptHash,
			success: result.success,
			duration,
			usage: result.usage,
			scores
		};
		if (!result.success) {
			const errorMsg = result.error || result.trace?.[result.trace.length - 1]?.error || "Validation Failed";
			console.log(`\n [${caseId}] Failed: ${errorMsg}`);
			onProgress?.(caseId, "FAILED_EVAL");
		} else onProgress?.(caseId, "COMPLETED");
		return runRecord;
	}));
	const results = await Promise.all(tasks);
	const successfulRuns = results.filter((r) => r.success && r.scores);
	return {
		summary: {
			total: results.length,
			successes: successfulRuns.length,
			failures: results.length - successfulRuns.length,
			totalCost: calculateCost(results.map((r) => r.usage)),
			avgMedsF1: successfulRuns.length > 0 ? successfulRuns.reduce((acc, r) => acc + (r.scores.medications || 0), 0) / successfulRuns.length : 0
		},
		results
	};
};
const calculateCost = (usages) => {
	return usages.reduce((total, u) => {
		if (!u) return total;
		const inputCost = u.inputTokens / 1e6 * .25;
		const cacheCreateCost = u.cacheCreationTokens / 1e6 * .3;
		const cacheReadCost = u.cacheReadTokens / 1e6 * .03;
		const outputCost = u.outputTokens / 1e6 * 1.25;
		return total + inputCost + cacheCreateCost + cacheReadCost + outputCost;
	}, 0);
};
//#endregion
//#region src/index.ts
const app = new Hono();
app.use("/api/*", cors());
app.post("/api/v1/runs", async (c) => {
	const body = await c.req.json();
	const strategy = body.strategy || "zero_shot";
	const model = body.model || "claude-haiku-4-5-20251001";
	const force = body.force || false;
	console.log(`Dashboard requested run: ${strategy} on ${model}`);
	return streamSSE(c, async (stream) => {
		stream.onAbort(() => {
			console.log("Client aborted SSE connection");
		});
		const onProgress = async (caseId, status) => {
			await stream.writeSSE({
				data: JSON.stringify({
					caseId,
					status
				}),
				event: "progress",
				id: String(Date.now())
			});
		};
		try {
			const { summary, results } = await runEvaluationSuite(strategy, model, force, onProgress);
			await stream.writeSSE({
				data: JSON.stringify({
					summary,
					results
				}),
				event: "complete",
				id: String(Date.now())
			});
		} catch (error) {
			await stream.writeSSE({
				data: JSON.stringify({ error: error.message }),
				event: "error"
			});
		}
	});
});
var src_default = {
	port: 8787,
	fetch: app.fetch
};
//#endregion
export { src_default as default };
