//#region src/invariant.ts
const PACKAGE_NAME = "dsh-dual-model-eval";
const name = "client-ui-dual-model-eval-invariant";
const inject = ["invariants"];
function owned(event) {
	return event.type.startsWith("dual-eval/");
}
function record(event, fail) {
	const data = event.data;
	if (typeof data !== "object" || data === null || Array.isArray(data)) fail(`${event.type} data must be an object`);
	return data;
}
function stringId(value, label, fail) {
	if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
	return value;
}
function indexOf(value, label, fail) {
	if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer`);
	return value;
}
function clone(source, event, fail) {
	const next = new Map(source);
	if (event.type === "dual-eval/run-start") return next;
	const runId = stringId(record(event, fail).runId, `${event.type} runId`, fail);
	const run = source.get(runId);
	if (run !== void 0) next.set(runId, {
		ended: run.ended,
		...run.adopted === void 0 ? {} : { adopted: run.adopted },
		workers: new Map(run.workers)
	});
	return next;
}
function openRun(trace, runId, event, fail) {
	const run = trace.get(runId);
	if (run === void 0) fail(`${event.type} has no matching run-start for ${runId}`);
	if (run.ended) fail(`${event.type} appears after run-end for ${runId}`);
	return run;
}
function applyEvent(trace, event, fail) {
	const data = record(event, fail);
	const runId = stringId(data.runId, `${event.type} runId`, fail);
	if (event.type === "dual-eval/run-start") {
		if (trace.has(runId)) fail(`dual-eval/run-start repeats ${runId}`);
		if (!Array.isArray(data.models) || data.models.length < 2) fail("dual-eval/run-start requires at least two models");
		const workers = /* @__PURE__ */ new Map();
		for (const model of data.models) {
			if (typeof model !== "object" || model === null) fail("dual-eval/run-start model must be an object");
			const index = indexOf(model.index, "dual-eval model index", fail);
			if (workers.has(index)) fail(`dual-eval/run-start repeats model index ${String(index)}`);
			workers.set(index, "pending");
		}
		trace.set(runId, {
			ended: false,
			workers
		});
		return;
	}
	const known = trace.get(runId);
	if (event.type === "dual-eval/adopted") {
		if (known === void 0) fail(`dual-eval/adopted has no matching run-start for ${runId}`);
		if (!known.ended) fail(`dual-eval/adopted appears before run-end for ${runId}`);
		const index = indexOf(data.index, "dual-eval adopted index", fail);
		if (known.workers.get(index) !== "ended") fail(`dual-eval/adopted has no completed worker index ${String(index)}`);
		if (known.adopted !== void 0 && known.adopted !== index) fail(`dual-eval run ${runId} was already adopted`);
		known.adopted = index;
		return;
	}
	const run = openRun(trace, runId, event, fail);
	if (event.type === "dual-eval/worker-start") {
		if (typeof data.model !== "object" || data.model === null) fail("dual-eval/worker-start model must be an object");
		const index = indexOf(data.model.index, "dual-eval worker index", fail);
		if (run.workers.get(index) !== "pending") fail(`dual-eval/worker-start has invalid state for index ${String(index)}`);
		run.workers.set(index, "running");
		return;
	}
	if (event.type === "dual-eval/worker-progress") {
		if (typeof data.progress !== "object" || data.progress === null) fail("dual-eval/worker-progress progress must be an object");
		const index = indexOf(data.progress.index, "dual-eval worker index", fail);
		if (run.workers.get(index) !== "running") fail(`dual-eval/worker-progress has no running worker index ${String(index)}`);
		return;
	}
	if (event.type === "dual-eval/worker-end") {
		if (typeof data.evidence !== "object" || data.evidence === null) fail("dual-eval/worker-end evidence must be an object");
		const index = indexOf(data.evidence.index, "dual-eval worker index", fail);
		if (run.workers.get(index) !== "running") fail(`dual-eval/worker-end has no open worker index ${String(index)}`);
		run.workers.set(index, "ended");
		return;
	}
	if (event.type === "dual-eval/run-end") {
		if (data.status !== "completed" && data.status !== "cancelled" && data.status !== "error") fail(`dual-eval/run-end status ${String(data.status)} is invalid`);
		if (data.status === "completed") {
			const incomplete = [...run.workers].filter(([, state]) => state !== "ended").map(([index]) => index);
			if (incomplete.length > 0) fail(`completed dual-eval run leaves workers ${incomplete.join(", ")} incomplete`);
		}
		run.ended = true;
		return;
	}
	fail(`unknown dual-eval event type ${event.type}`);
}
const install = Object.assign((ctx, fail) => {
	const traces = /* @__PURE__ */ new WeakMap();
	const staged = /* @__PURE__ */ new WeakMap();
	const seed = (session) => {
		const trace = /* @__PURE__ */ new Map();
		for (const event of session.events.filter(owned)) applyEvent(trace, event, fail);
		traces.set(session, trace);
		return trace;
	};
	ctx.sessions.list().forEach(seed);
	ctx.on("session/created", (session) => {
		seed(session);
	}, { global: true });
	ctx.on("internal/dispatch", (_mode, eventName, args) => {
		if (eventName !== "session/event") return;
		const [session, event] = args;
		if (!owned(event)) return;
		const trace = clone(traces.get(session), event, fail);
		applyEvent(trace, event, fail);
		staged.set(event, {
			session,
			trace
		});
	}, { global: true });
	ctx.on("session/event", (session, event) => {
		if (!owned(event)) return;
		const candidate = staged.get(event);
		if (candidate === void 0 || candidate.session !== session) return fail("dual-eval event published without staged validation");
		staged.delete(event);
		traces.set(session, candidate.trace);
	}, { global: true });
}, { inject: ["sessions"] });
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };

//# sourceMappingURL=invariant.js.map