import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import z from "@deepseek-ai/schemastery";
import { foldConsumedWork } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { KNOWN_SESSION_EVENT_TYPES, SessionId } from "@deepseek-ai/dsh-session";
import { homedir } from "node:os";
import { appendDelegatedPolicyOverrides, applyChildComposition, captureDelegatedPolicyOverrides, childSessionMeta, finalAssistantOutput, resolveChildAgentOptions, resolveChildDepth } from "@deepseek-ai/dsh-subagent";
//#region src/git.ts
/** Structured Git failure used by callers that need to distinguish a missing repository. */
var GitCommandError = class extends Error {
	args;
	exitCode;
	stdout;
	stderr;
	constructor(args, exitCode, stdout, stderr) {
		let index = 0;
		while (args[index] === "-c") index += 2;
		const operation = args[index] ?? "<unknown>";
		const detail = stderr.trim() || stdout.trim() || `exit ${String(exitCode)}`;
		super(`git ${operation} failed: ${detail}`);
		this.args = args;
		this.exitCode = exitCode;
		this.stdout = stdout;
		this.stderr = stderr;
		this.name = "GitCommandError";
	}
};
function readAll(reader, stream) {
	if (reader === void 0) throw new Error(`git ${stream} was not collected`);
	const value = reader.readFrom(0);
	if (value.lossy) throw new Error(`git ${stream} exceeded the configured capture limit`);
	return value.text;
}
/** Execute Git without a shell and fail with bounded diagnostics. */
async function runGit(ctx, cwd, args, signal, config) {
	const git = await ctx.subprocess.resolveExecutable(config.command, void 0, signal);
	const collect = { maxBytes: config.maxOutputBytes };
	const handle = ctx.subprocess.spawn({
		argv: [git, ...args],
		cwd,
		stdio: {
			stdin: "ignore",
			stdout: collect,
			stderr: collect
		},
		graceMs: config.graceMs,
		signal,
		env: {
			LC_ALL: "C",
			LANG: "C"
		}
	});
	const outcome = await handle.done;
	const stdout = readAll(handle.collected.stdout, "stdout");
	const stderr = readAll(handle.collected.stderr, "stderr");
	if (outcome.exitCode !== 0) throw new GitCommandError(args, outcome.exitCode, stdout, stderr);
	return {
		stdout,
		stderr
	};
}
/** Resolve and validate the private durable evidence root. */
async function resolveRunsRoot(configured) {
	const target = configured === void 0 ? join(homedir(), ".dsh", "dual-model-eval") : configured;
	if (!isAbsolute(target)) throw new Error("dual-model-eval runsRoot must be an absolute path");
	await mkdir(target, {
		recursive: true,
		mode: 448
	});
	if (!(await stat(target)).isDirectory()) throw new Error(`dual-model-eval runsRoot is not a directory: ${target}`);
	return realpath(target);
}
/** Write one UTF-8 evidence file with private permissions. */
async function writeEvidence(path, value) {
	const parent = path.slice(0, path.lastIndexOf("/"));
	await mkdir(parent, {
		recursive: true,
		mode: 448
	});
	await writeFile(path, value, {
		encoding: "utf8",
		mode: 384
	});
}
//#endregion
//#region src/isolated-provider.ts
function stopReason(reason) {
	switch (reason?.kind) {
		case "completed": return "completed";
		case "aborted":
		case "interrupted": return "aborted";
		case "max-tokens": return "max-tokens";
		case "blocked": return "refusal";
		default: return "error";
	}
}
function attachDescriptor(childCtx, request) {
	let appended = false;
	childCtx.on("agent/pre-step", async ({ agent }, next) => {
		const decision = await next();
		if (!appended && decision.kind === "enter") {
			appended = true;
			agent.session.append("subagent/descriptor", request.descriptor);
		}
		return decision;
	});
}
function drive(handle, signal, prompt, childId) {
	const child = handle.agent;
	const onAbort = () => {
		child.cancel({ kind: "parent" });
	};
	signal.addEventListener("abort", onAbort, { once: true });
	if (signal.aborted) onAbort();
	const result = (async () => {
		try {
			if (!signal.aborted) {
				child.followup(createUserMessage({
					content: prompt,
					source: { kind: "user" }
				}));
				await child.whenIdle();
			}
			const output = finalAssistantOutput(child.session.events) ?? [];
			const recorded = stopReason(foldConsumedWork(child.session.events).end?.data.reason);
			return {
				output,
				stopReason: signal.aborted && recorded !== "completed" ? "aborted" : recorded
			};
		} finally {
			signal.removeEventListener("abort", onAbort);
		}
	})();
	return {
		id: childId,
		localAgent: child,
		result,
		async dispose() {
			signal.removeEventListener("abort", onAbort);
			const settlements = await Promise.allSettled([handle.dispose(), result]);
			if (settlements[0].status === "rejected") throw settlements[0].reason;
		}
	};
}
async function validateWorkspace(path) {
	if (!isAbsolute(path)) throw new Error("comparison subagent cwd must be absolute");
	const resolved = await realpath(path);
	if (!(await stat(resolved)).isDirectory()) throw new Error(`comparison subagent cwd is not a directory: ${path}`);
	return resolved;
}
/** In-process subagent provider with a per-run isolated cwd. */
var IsolatedWorktreeProvider = class {
	name;
	capabilities = {
		outputSchema: false,
		depthLimit: true,
		toolFilter: true,
		persona: true
	};
	inheritsParentContext = false;
	constructor(name) {
		this.name = name;
	}
	async start(request) {
		if (request.signal.aborted) throw new Error("comparison subagent was aborted before publication");
		const requested = request.agentOptions;
		const workspace = requested?.dualEvalWorktreeCwd;
		if (workspace === void 0) throw new Error("comparison subagent is missing agentOptions.dualEvalWorktreeCwd");
		const cwd = await validateWorkspace(workspace);
		const childDepth = resolveChildDepth(request.parent, request.maxDepth);
		const inherited = captureDelegatedPolicyOverrides(request.parent);
		const childId = SessionId(randomUUID());
		const { dualEvalWorktreeCwd: _cwd, ...route } = requested;
		return drive(await request.parent.ctx.agents.create({
			sessionId: childId,
			meta: {
				...childSessionMeta(request.parent, childDepth, 0),
				cwd
			},
			agentOptions: resolveChildAgentOptions(request.parent, route, childDepth),
			signal: request.signal,
			setup: (childCtx) => {
				appendDelegatedPolicyOverrides(childCtx.agent.session, inherited);
				applyChildComposition(childCtx, request.parent, {
					persona: request.persona,
					toolFilter: request.toolFilter
				});
				attachDescriptor(childCtx, request);
			}
		}), request.signal, request.prompt, childId);
	}
};
//#endregion
//#region src/index.ts
/** Multi-model coding comparison over isolated detached Git worktrees. */
const name = "client-ui-dual-model-eval";
const inject = [
	"commands",
	"subagents",
	"subprocess"
];
const COMMAND_NAME = "compare-models";
const ADOPT_COMMAND_NAME = "compare-models-adopt";
const PROVIDER_NAME = "dual-eval-worktree-ui";
const MAX_WIRE_BYTES = 262144;
const MAX_TASK_CHARS = 5e4;
const MAX_CAPTURED_TOOLS = 100;
const MAX_TOOL_TEXT_CHARS = 12e3;
const EVENT_TYPES = [
	"dual-eval/adopted",
	"dual-eval/run-end",
	"dual-eval/run-start",
	"dual-eval/worker-end",
	"dual-eval/worker-progress",
	"dual-eval/worker-start"
];
const CHILD_PERSONA = "You are one candidate in a controlled coding evaluation. Work directly in the current Git worktree and implement the requested change. Inspect the repository before editing, make concrete file changes, and run relevant tests when possible. Do not create Git commits, branches, or additional worktrees. Finish with a concise summary of changed files, verification performed, and any remaining blocker.";
const Config = z.object({
	runsRoot: z.string(),
	initializeNonGitWorkspace: z.boolean().default(true),
	requireCleanWorktree: z.boolean().default(true),
	keepWorktrees: z.boolean().default(false),
	timeoutMs: z.number().step(1).min(1).default(18e5),
	maxModels: z.number().step(1).min(2).max(8).default(4),
	maxResponseChars: z.number().step(1).min(1e3).default(6e4),
	maxStatusChars: z.number().step(1).min(1e3).default(2e4),
	maxPatchPreviewChars: z.number().step(1).min(1e3).default(4e4),
	gitCommand: z.string().default("git"),
	gitGraceMs: z.number().step(1).min(1).default(5e3),
	gitMaxOutputBytes: z.number().step(1).min(1024).default(8388608)
});
function errorText(error) {
	return error instanceof Error ? error.message : String(error);
}
function contentText(content) {
	return content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function cap(value, limit) {
	if (value.length <= limit) return {
		value,
		truncated: false
	};
	return {
		value: `${value.slice(0, limit)}\n… [已截断 ${String(value.length - limit)} 个字符]`,
		truncated: true
	};
}
function zeroMetrics() {
	return {
		steps: 0,
		llmMs: 0,
		toolMs: 0,
		ttftMs: 0,
		ttftSteps: 0,
		decodeMs: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		reasoningTokens: 0,
		toolCalls: 0
	};
}
function stepKey(turn, step) {
	return `${String(turn)}:${String(step)}`;
}
function boundedToolContent(content) {
	return content.flatMap((block) => {
		if (block.type !== "text") return [];
		return [{
			...block,
			text: cap(block.text, MAX_TOOL_TEXT_CHARS).value
		}];
	});
}
function cloneTool(tool) {
	return {
		...tool,
		content: [...tool.content]
	};
}
/** O(1)-per-event projector shared by durable final capture and live progress. */
var ChildTraceTracker = class {
	metrics = zeroMetrics();
	starts = /* @__PURE__ */ new Map();
	firstTokens = /* @__PURE__ */ new Map();
	toolStarts = /* @__PURE__ */ new Map();
	toolIndexes = /* @__PURE__ */ new Map();
	tools = [];
	observe(event) {
		if (event.type === "step/start") {
			this.starts.set(stepKey(event.data.turn, event.data.step), event.time);
			return { emit: true };
		}
		if (event.type === "assistant/chunk") {
			const key = stepKey(event.data.turn, event.data.step);
			const chunk = event.data.chunk;
			if (!this.firstTokens.has(key) && (chunk.type === "text-delta" || chunk.type === "reasoning-delta")) this.firstTokens.set(key, event.time);
			return { emit: false };
		}
		if (event.type === "assistant/message") {
			const key = stepKey(event.data.turn, event.data.step);
			const startedAt = this.starts.get(key);
			const firstTokenAt = this.firstTokens.get(key);
			this.metrics.steps += 1;
			if (startedAt !== void 0) this.metrics.llmMs += Math.max(0, event.time - startedAt);
			if (startedAt !== void 0 && firstTokenAt !== void 0) {
				this.metrics.ttftMs += Math.max(0, firstTokenAt - startedAt);
				this.metrics.ttftSteps += 1;
				this.metrics.decodeMs += Math.max(0, event.time - firstTokenAt);
			}
			const usage = event.data.usage;
			if (usage !== void 0) {
				this.metrics.inputTokens += usage.inputTokens;
				this.metrics.outputTokens += usage.outputTokens;
				this.metrics.cacheReadTokens += usage.cacheReadTokens ?? 0;
				this.metrics.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
				this.metrics.reasoningTokens += usage.reasoningTokens ?? 0;
			}
			return { emit: true };
		}
		if (event.type === "tool/call") {
			const callId = String(event.data.callId);
			this.metrics.toolCalls += 1;
			this.toolStarts.set(callId, event);
			if (this.tools.length >= MAX_CAPTURED_TOOLS) return { emit: true };
			const tool = {
				seq: event.seq,
				callId,
				name: event.data.name,
				argsRaw: event.data.arguments,
				startedAt: event.time,
				content: [],
				isError: false
			};
			this.toolIndexes.set(callId, this.tools.length);
			this.tools.push(tool);
			return {
				emit: true,
				tool: cloneTool(tool)
			};
		}
		if (event.type !== "tool/result") return { emit: false };
		const callId = String(event.data.message.source.callId);
		const start = this.toolStarts.get(callId);
		const result = event.data.message.content[0];
		if (start !== void 0) this.metrics.toolMs += Math.max(0, event.time - start.time);
		const index = this.toolIndexes.get(callId);
		if (index === void 0) return { emit: true };
		const previous = this.tools[index];
		if (previous === void 0) return { emit: true };
		const tool = {
			...previous,
			seq: event.seq,
			endedAt: event.time,
			content: boundedToolContent(result.content),
			isError: result.isError ?? false,
			...event.data.error === void 0 ? {} : { error: event.data.error },
			...event.data.meta === void 0 ? {} : { meta: event.data.meta }
		};
		this.tools[index] = tool;
		return {
			emit: true,
			tool: cloneTool(tool)
		};
	}
	snapshot() {
		return {
			metrics: { ...this.metrics },
			tools: this.tools.map(cloneTool),
			toolsTruncated: this.metrics.toolCalls > this.tools.length
		};
	}
};
/** Fold actual child Session events into bounded native Tool rows and provider metrics. */
function projectChildTrace(events) {
	const tracker = new ChildTraceTracker();
	for (const event of events) tracker.observe(event);
	return tracker.snapshot();
}
/** Mirror semantic child lifecycle boundaries into one bounded parent projection. */
function streamChildTrace(ctx, parent, child, runId, index, childSessionId, startedAt) {
	const tracker = new ChildTraceTracker();
	const queued = [];
	let seeding = true;
	const publish = (observation) => {
		if (!observation.emit) return;
		const snapshot = tracker.snapshot();
		const progress = {
			index,
			childSessionId,
			elapsedMs: Date.now() - startedAt,
			metrics: snapshot.metrics,
			...observation.tool === void 0 ? {} : { tool: observation.tool },
			toolsTruncated: snapshot.toolsTruncated
		};
		parent.session.append("dual-eval/worker-progress", {
			runId,
			progress
		});
	};
	const consume = (event) => {
		publish(tracker.observe(event));
	};
	const dispose = ctx.on("session/event", (session, event) => {
		if (session !== child.session) return;
		if (seeding) queued.push(event);
		else consume(event);
	});
	const initial = [...child.session.events];
	for (const event of initial) tracker.observe(event);
	const initialLastSeq = initial.at(-1)?.seq ?? -1;
	const snapshot = tracker.snapshot();
	parent.session.append("dual-eval/worker-progress", {
		runId,
		progress: {
			index,
			childSessionId,
			elapsedMs: Date.now() - startedAt,
			metrics: snapshot.metrics,
			tools: snapshot.tools,
			toolsTruncated: snapshot.toolsTruncated
		}
	});
	seeding = false;
	queued.filter((event) => event.seq > initialLastSeq).sort((left, right) => left.seq - right.seq).forEach(consume);
	return {
		snapshot: () => tracker.snapshot(),
		dispose
	};
}
/** Parse Git --numstat output without deriving line counts from rendered patches. */
function parseNumstat(output) {
	let additions = 0;
	let deletions = 0;
	let filesChanged = 0;
	let binaryFiles = 0;
	for (const line of output.split("\n")) {
		if (line === "") continue;
		const [added, deleted] = line.split("	", 3);
		if (added === void 0 || deleted === void 0) continue;
		filesChanged += 1;
		if (added === "-" || deleted === "-") {
			binaryFiles += 1;
			continue;
		}
		additions += Number.parseInt(added, 10) || 0;
		deletions += Number.parseInt(deleted, 10) || 0;
	}
	return {
		additions,
		deletions,
		filesChanged,
		binaryFiles
	};
}
function requiredString(value, field, max = 512) {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	const normalized = value.trim();
	if (normalized === "") throw new Error(`${field} must be non-empty`);
	if (normalized.length > max) throw new Error(`${field} exceeds ${String(max)} characters`);
	return normalized;
}
function isMissingRepository(cause) {
	return cause instanceof GitCommandError && cause.stderr.includes("not a git repository");
}
async function resolveRepository(ctx, cwd, signal, git, initializeNonGitWorkspace) {
	try {
		const path = (await runGit(ctx, cwd, ["rev-parse", "--show-toplevel"], signal, git)).stdout.trim();
		return {
			path: await realpath(path),
			initialized: false
		};
	} catch (cause) {
		if (!initializeNonGitWorkspace || !isMissingRepository(cause)) throw cause;
	}
	try {
		await runGit(ctx, cwd, ["init", "--quiet"], signal, git);
		await runGit(ctx, cwd, [
			"add",
			"-A",
			"--",
			"."
		], signal, git);
		await runGit(ctx, cwd, [
			"-c",
			"user.name=DeepSeek Harness",
			"-c",
			"user.email=deepseek-harness@localhost",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--allow-empty",
			"--no-verify",
			"--quiet",
			"-m",
			"Initialize DeepSeek Harness comparison baseline"
		], signal, git);
		const path = (await runGit(ctx, cwd, ["rev-parse", "--show-toplevel"], signal, git)).stdout.trim();
		return {
			path: await realpath(path),
			initialized: true
		};
	} catch (cause) {
		throw new Error(`compare-models could not initialize a Git baseline in ${cwd}: ${errorText(cause)}`);
	}
}
function parsePayload(rawInput, maxModels) {
	const encoded = rawInput.trim();
	if (encoded === "") throw new Error("compare-models requires an encoded request");
	if (encoded.length > MAX_WIRE_BYTES) throw new Error("compare-models request is too large");
	let wire;
	try {
		wire = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	} catch {
		throw new Error("compare-models request is not valid base64url JSON");
	}
	if (typeof wire !== "object" || wire === null) throw new Error("compare-models request must be an object");
	const value = wire;
	if (value.version !== 1) throw new Error("compare-models request version is unsupported");
	const runId = requiredString(value.runId, "runId", 64);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId)) throw new Error("compare-models runId must be a UUID");
	const task = requiredString(value.task, "task", MAX_TASK_CHARS);
	const baseRef = value.baseRef === void 0 ? void 0 : requiredString(value.baseRef, "baseRef", 256);
	if (baseRef?.startsWith("-") === true) throw new Error("compare-models baseRef must not start with \"-\"");
	if (!Array.isArray(value.models) || value.models.length < 2 || value.models.length > maxModels) throw new Error(`compare-models requires between 2 and ${String(maxModels)} models`);
	const seen = /* @__PURE__ */ new Set();
	return {
		version: 1,
		runId,
		task,
		models: value.models.map((candidate, index) => {
			if (typeof candidate !== "object" || candidate === null) throw new Error(`models[${String(index)}] must be an object`);
			const row = candidate;
			const provider = requiredString(row.provider, `models[${String(index)}].provider`, 256);
			const model = requiredString(row.model, `models[${String(index)}].model`, 256);
			const reasoningEffort = row.reasoningEffort === void 0 ? void 0 : requiredString(row.reasoningEffort, `models[${String(index)}].reasoningEffort`, 128);
			const identity = `${provider}\u0000${model}\u0000${reasoningEffort ?? ""}`;
			if (seen.has(identity)) throw new Error(`models[${String(index)}] duplicates an earlier route`);
			seen.add(identity);
			return {
				index,
				label: requiredString(row.label, `models[${String(index)}].label`, 256),
				providerLabel: requiredString(row.providerLabel, `models[${String(index)}].providerLabel`, 256),
				provider,
				model,
				...reasoningEffort === void 0 ? {} : { reasoningEffort }
			};
		}),
		...baseRef === void 0 ? {} : { baseRef }
	};
}
function parseAdoptionPayload(rawInput) {
	const encoded = rawInput.trim();
	if (encoded === "" || encoded.length > MAX_WIRE_BYTES) throw new Error("compare-models-adopt request is invalid");
	let wire;
	try {
		wire = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	} catch {
		throw new Error("compare-models-adopt request is not valid base64url JSON");
	}
	if (typeof wire !== "object" || wire === null) throw new Error("compare-models-adopt request must be an object");
	const value = wire;
	if (value.version !== 1) throw new Error("compare-models-adopt request version is unsupported");
	const runId = requiredString(value.runId, "runId", 64);
	if (!Number.isSafeInteger(value.index) || value.index < 0) throw new Error("compare-models-adopt index must be a non-negative safe integer");
	return {
		version: 1,
		runId,
		index: value.index
	};
}
function childPrompt(task, baseCommit) {
	return `Evaluation task:\n${task}\n\nAll candidates started from Git commit ${baseCommit}. Implement the task only in this worktree.`;
}
async function settle(run) {
	try {
		const result = await run.result;
		const reason = run.localAgent === void 0 ? void 0 : foldConsumedWork(run.localAgent.session.events).end?.data.reason;
		const terminalDetail = reason?.kind === "error" ? reason.error.message : reason === void 0 || reason.kind === "completed" ? void 0 : reason.kind;
		return {
			result,
			events: run.localAgent === void 0 ? [] : [...run.localAgent.session.events],
			...terminalDetail === void 0 ? {} : { terminalDetail }
		};
	} finally {
		await run.dispose();
	}
}
async function captureWorker(ctx, runId, route, task, baseCommit, worktree, artifactDirectory, parent, signal, git, config) {
	const startedAt = Date.now();
	const directory = join(artifactDirectory, `candidate-${String(route.index + 1).padStart(2, "0")}`);
	const responsePath = join(directory, "response.json");
	const statusPath = join(directory, "status.txt");
	const patchPath = join(directory, "changes.patch");
	let childSessionId;
	let stopReason = "error";
	let response = "";
	let error;
	let trace = {
		metrics: zeroMetrics(),
		tools: [],
		toolsTruncated: false
	};
	let changes = {
		additions: 0,
		deletions: 0,
		filesChanged: 0,
		binaryFiles: 0
	};
	parent.session.append("dual-eval/worker-start", {
		runId,
		model: route
	});
	try {
		const run = await ctx.subagents.start(PROVIDER_NAME, {
			label: `${route.label} isolated comparison`,
			prompt: [{
				type: "text",
				text: childPrompt(task, baseCommit)
			}],
			parent,
			signal,
			maxDepth: 1,
			persona: CHILD_PERSONA,
			agentOptions: {
				provider: route.provider,
				model: route.model,
				...route.reasoningEffort === void 0 ? {} : { reasoningEffort: route.reasoningEffort },
				dualEvalWorktreeCwd: worktree
			}
		});
		childSessionId = run.id;
		const live = run.localAgent === void 0 ? void 0 : streamChildTrace(ctx, parent, run.localAgent, runId, route.index, run.id, startedAt);
		const settled = await (async () => {
			try {
				return await settle(run);
			} finally {
				live?.dispose();
				if (live !== void 0) trace = live.snapshot();
			}
		})();
		if (live === void 0) trace = projectChildTrace(settled.events);
		stopReason = settled.result.stopReason;
		response = contentText(settled.result.output);
		if (settled.terminalDetail !== void 0 && stopReason !== "completed") error = settled.terminalDetail;
		await writeEvidence(responsePath, `${JSON.stringify({
			childSessionId,
			stopReason,
			output: settled.result.output,
			...settled.terminalDetail === void 0 ? {} : { terminalDetail: settled.terminalDetail }
		}, null, 2)}\n`);
	} catch (cause) {
		error = errorText(cause);
		await writeEvidence(responsePath, `${JSON.stringify({
			childSessionId,
			stopReason,
			error
		}, null, 2)}\n`);
	}
	let status = "";
	let patch = "";
	try {
		await runGit(ctx, worktree, [
			"add",
			"-N",
			"--",
			"."
		], void 0, git);
		const [statusResult, patchResult, numstatResult] = await Promise.all([
			runGit(ctx, worktree, [
				"status",
				"--short",
				"--untracked-files=all"
			], void 0, git),
			runGit(ctx, worktree, [
				"diff",
				"--binary",
				"--no-ext-diff",
				"--full-index",
				baseCommit,
				"--",
				"."
			], void 0, git),
			runGit(ctx, worktree, [
				"diff",
				"--numstat",
				"--no-ext-diff",
				baseCommit,
				"--",
				"."
			], void 0, git)
		]);
		status = statusResult.stdout;
		patch = patchResult.stdout;
		changes = parseNumstat(numstatResult.stdout);
		await Promise.all([writeEvidence(statusPath, status), writeEvidence(patchPath, patch)]);
	} catch (cause) {
		const detail = `artifact capture failed: ${errorText(cause)}`;
		error = error === void 0 ? detail : `${error}; ${detail}`;
	}
	const renderedResponse = cap(response, config.maxResponseChars);
	const renderedStatus = cap(status, config.maxStatusChars);
	const renderedPatch = cap(patch, config.maxPatchPreviewChars);
	const evidence = {
		...route,
		...childSessionId === void 0 ? {} : { childSessionId },
		stopReason,
		elapsedMs: Date.now() - startedAt,
		response: renderedResponse.value,
		status: renderedStatus.value,
		patchPreview: renderedPatch.value,
		responsePath,
		statusPath,
		patchPath,
		changes,
		metrics: trace.metrics,
		tools: trace.tools,
		toolsTruncated: trace.toolsTruncated,
		...config.keepWorktrees ? { worktreePath: worktree } : {},
		responseTruncated: renderedResponse.truncated,
		statusTruncated: renderedStatus.truncated,
		patchTruncated: renderedPatch.truncated,
		...error === void 0 ? {} : { error }
	};
	parent.session.append("dual-eval/worker-end", {
		runId,
		evidence
	});
	return evidence;
}
async function runComparison(ctx, payload, invocation, config) {
	const startedAt = Date.now();
	const parent = invocation.agent;
	const latestEnd = parent.session.events.findLast((event) => event.type === "dual-eval/run-end");
	if (latestEnd !== void 0 && latestEnd.data.status === "completed") {
		if (!parent.session.events.some((event) => event.type === "dual-eval/adopted" && event.data.runId === latestEnd.data.runId)) throw new Error("需要先采纳上一轮的一个模型结果，才能开始新的对比");
	}
	const cwd = parent.session.header.cwd;
	if (cwd === void 0) throw new Error("compare-models requires a session workspace");
	const git = {
		command: config.gitCommand,
		graceMs: config.gitGraceMs,
		maxOutputBytes: config.gitMaxOutputBytes
	};
	const repository = await resolveRepository(ctx, cwd, invocation.signal, git, config.initializeNonGitWorkspace);
	const canonicalRepository = repository.path;
	if (config.requireCleanWorktree) {
		if ((await runGit(ctx, canonicalRepository, [
			"status",
			"--porcelain=v1",
			"--untracked-files=normal"
		], invocation.signal, git)).stdout.length > 0) throw new Error("compare-models requires a clean working tree; commit or stash local changes first");
	}
	const baseCommit = (await runGit(ctx, canonicalRepository, [
		"rev-parse",
		"--verify",
		`${payload.baseRef ?? "HEAD"}^{commit}`
	], invocation.signal, git)).stdout.trim();
	const root = await resolveRunsRoot(config.runsRoot);
	const runDirectory = join(root, `${basename(canonicalRepository)}-${payload.runId}`);
	const worktreesDirectory = join(runDirectory, "worktrees");
	const artifactDirectory = join(runDirectory, "artifacts");
	await Promise.all([mkdir(worktreesDirectory, {
		recursive: true,
		mode: 448
	}), mkdir(artifactDirectory, {
		recursive: true,
		mode: 448
	})]);
	await writeEvidence(join(artifactDirectory, "request.json"), `${JSON.stringify({
		...payload,
		repository: canonicalRepository,
		repositoryInitialized: repository.initialized,
		baseCommit
	}, null, 2)}\n`);
	const turn = (parent.session.events.findLast((event) => event.type === "turn/start")?.data.turn ?? 0) + 1;
	parent.session.append("turn/start", { turn });
	parent.session.append("user/message", createUserMessage({
		content: [{
			type: "text",
			text: payload.task
		}],
		source: { kind: "user" }
	}), { surfaceOp: "append" });
	parent.session.append("dual-eval/run-start", {
		runId: payload.runId,
		task: payload.task,
		repository: canonicalRepository,
		baseCommit,
		artifactDirectory,
		models: payload.models
	});
	const created = [];
	const cleanupErrors = [];
	let models = [];
	let failure;
	try {
		const worktrees = [];
		for (const route of payload.models) {
			const path = join(worktreesDirectory, `candidate-${String(route.index + 1).padStart(2, "0")}`);
			await runGit(ctx, canonicalRepository, [
				"worktree",
				"add",
				"--detach",
				path,
				baseCommit
			], invocation.signal, git);
			created.push(path);
			worktrees.push(path);
		}
		const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
		const signal = AbortSignal.any([invocation.signal, timeoutSignal]);
		models = await Promise.all(payload.models.map((route, index) => captureWorker(ctx, payload.runId, route, payload.task, baseCommit, worktrees[index], artifactDirectory, parent, signal, git, config)));
		if (signal.aborted) failure = errorText(signal.reason ?? /* @__PURE__ */ new Error("comparison run cancelled"));
	} catch (cause) {
		failure = errorText(cause);
	} finally {
		if (!config.keepWorktrees) {
			for (const path of created.reverse()) try {
				await runGit(ctx, canonicalRepository, [
					"worktree",
					"remove",
					"--force",
					path
				], void 0, git);
			} catch (cause) {
				cleanupErrors.push(`${path}: ${errorText(cause)}`);
			}
			try {
				await runGit(ctx, canonicalRepository, ["worktree", "prune"], void 0, git);
			} catch (cause) {
				cleanupErrors.push(`prune: ${errorText(cause)}`);
			}
		}
	}
	const status = failure === void 0 ? "completed" : invocation.signal.aborted ? "cancelled" : "error";
	const result = {
		runId: payload.runId,
		repository: canonicalRepository,
		repositoryInitialized: repository.initialized,
		baseCommit,
		artifactDirectory,
		status,
		elapsedMs: Date.now() - startedAt,
		worktreesKept: config.keepWorktrees || cleanupErrors.length > 0,
		cleanupErrors,
		models,
		...failure === void 0 ? {} : { error: failure }
	};
	try {
		await writeEvidence(join(artifactDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
	} catch (cause) {
		failure = failure === void 0 ? errorText(cause) : `${failure}; ${errorText(cause)}`;
	}
	parent.session.append("dual-eval/run-end", {
		runId: payload.runId,
		status: failure === void 0 ? status : invocation.signal.aborted ? "cancelled" : "error",
		elapsedMs: Date.now() - startedAt,
		worktreesKept: config.keepWorktrees || cleanupErrors.length > 0,
		cleanupErrors,
		...failure === void 0 ? {} : { error: failure }
	});
	parent.session.append("turn/end", {
		turn,
		reason: { kind: "completed" }
	});
}
function eventFor(events, type, runId) {
	return events.findLast((event) => event.type === type && "runId" in event.data && event.data.runId === runId);
}
async function adoptCandidate(ctx, payload, invocation, config) {
	const parent = invocation.agent;
	const events = parent.session.events;
	const start = eventFor(events, "dual-eval/run-start", payload.runId);
	const end = eventFor(events, "dual-eval/run-end", payload.runId);
	if (start === void 0 || end === void 0) throw new Error("找不到已完成的对比运行");
	if (end.data.status !== "completed") throw new Error("只有已完成的对比运行可以采纳");
	const existing = eventFor(events, "dual-eval/adopted", payload.runId);
	if (existing !== void 0) {
		if (existing.data.index === payload.index) return;
		throw new Error("这个对比运行已经采纳了另一个模型");
	}
	const model = start.data.models.find((candidate) => candidate.index === payload.index);
	const worker = events.findLast((event) => event.type === "dual-eval/worker-end" && event.data.runId === payload.runId && event.data.evidence.index === payload.index);
	if (model === void 0 || worker === void 0) throw new Error("找不到要采纳的模型证据");
	if (worker.data.evidence.error !== void 0 || worker.data.evidence.stopReason !== "completed") throw new Error("失败或未完成的模型结果不能采纳");
	const repository = await realpath(start.data.repository);
	const git = {
		command: config.gitCommand,
		graceMs: config.gitGraceMs,
		maxOutputBytes: config.gitMaxOutputBytes
	};
	if ((await runGit(ctx, repository, [
		"status",
		"--porcelain=v1",
		"--untracked-files=normal"
	], invocation.signal, git)).stdout.length > 0) throw new Error("采纳前主工作区必须保持干净，请先提交或暂存本地修改");
	if ((await runGit(ctx, repository, [
		"rev-parse",
		"--verify",
		"HEAD^{commit}"
	], invocation.signal, git)).stdout.trim() !== start.data.baseCommit) throw new Error("当前工作区 HEAD 已经变化，不能再采纳这个旧基线上的结果");
	const artifactDirectory = await realpath(start.data.artifactDirectory);
	const patchPath = await realpath(worker.data.evidence.patchPath);
	const patchRelative = relative(artifactDirectory, patchPath);
	if (patchRelative.startsWith("..") || isAbsolute(patchRelative)) throw new Error("候选补丁不属于这个对比运行的证据目录");
	const adoptionWorktree = join(dirname(artifactDirectory), `adopt-${String(payload.index + 1)}-${randomUUID()}`);
	let created = false;
	let commit;
	try {
		await runGit(ctx, repository, [
			"worktree",
			"add",
			"--detach",
			adoptionWorktree,
			start.data.baseCommit
		], invocation.signal, git);
		created = true;
		if ((await readFile(patchPath, "utf8")).trim() !== "") await runGit(ctx, adoptionWorktree, [
			"apply",
			"--index",
			"--binary",
			"--whitespace=nowarn",
			patchPath
		], invocation.signal, git);
		await runGit(ctx, adoptionWorktree, [
			"-c",
			"user.name=DeepSeek Harness",
			"-c",
			"user.email=deepseek-harness@localhost",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--allow-empty",
			"--no-verify",
			"--quiet",
			"-m",
			`Adopt ${model.label} from comparison ${payload.runId}`
		], invocation.signal, git);
		commit = (await runGit(ctx, adoptionWorktree, [
			"rev-parse",
			"--verify",
			"HEAD^{commit}"
		], invocation.signal, git)).stdout.trim();
		await runGit(ctx, repository, [
			"merge",
			"--ff-only",
			commit
		], invocation.signal, git);
		parent.session.append("dual-eval/adopted", {
			runId: payload.runId,
			index: payload.index,
			model,
			previousBaseCommit: start.data.baseCommit,
			commit
		});
	} finally {
		if (created) try {
			await runGit(ctx, repository, [
				"worktree",
				"remove",
				"--force",
				adoptionWorktree
			], void 0, git);
			await runGit(ctx, repository, ["worktree", "prune"], void 0, git);
		} catch {}
	}
}
/** Register the Host command and isolated subagent provider. */
function apply(ctx, config) {
	const resolved = config;
	const known = KNOWN_SESSION_EVENT_TYPES;
	for (const eventType of EVENT_TYPES) known.add(eventType);
	ctx.subagents.registerProvider(new IsolatedWorktreeProvider(PROVIDER_NAME));
	ctx.commands.register({
		name: COMMAND_NAME,
		description: "Run one coding task concurrently across selected models in isolated Git worktrees",
		input: { hint: "由对比测试界面生成" },
		recordInput: false,
		handler: async (invocation) => {
			try {
				await runComparison(ctx, parsePayload(invocation.rawInput, resolved.maxModels), invocation, resolved);
				return {
					kind: "success",
					text: "对比运行已完成"
				};
			} catch (cause) {
				return {
					kind: "error",
					text: errorText(cause)
				};
			}
		}
	});
	ctx.commands.register({
		name: ADOPT_COMMAND_NAME,
		description: "Commit one completed comparison candidate and advance the workspace baseline",
		input: { hint: "由对比结果卡片生成" },
		recordInput: false,
		handler: async (invocation) => {
			try {
				await adoptCandidate(ctx, parseAdoptionPayload(invocation.rawInput), invocation, resolved);
				return {
					kind: "success",
					text: "已采纳模型结果"
				};
			} catch (cause) {
				return {
					kind: "error",
					text: errorText(cause)
				};
			}
		}
	});
}
//#endregion
export { Config, apply, inject, name, parseNumstat, projectChildTrace };

//# sourceMappingURL=index.js.map