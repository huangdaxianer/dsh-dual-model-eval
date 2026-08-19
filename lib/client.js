window.__ModuleLoader__.load({
	id: "dsh-dual-model-eval",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/client/adoption-gate.ts
		const BLOCK_OWNER = "ui-dual-model-eval";
		function latestComparison(chat) {
			for (let index = chat.order.length - 1; index >= 0; index -= 1) {
				const key = chat.order[index];
				if (key === void 0) continue;
				const node = chat.nodes.get(key);
				if (node?.kind === "dual-eval-run") return node.data;
			}
		}
		/** Whether the latest comparison has a usable result but still needs an adoption. */
		function requiresComparisonAdoption(chat) {
			const run = latestComparison(chat);
			return run !== void 0 && run.status === "completed" && run.adopted === void 0 && run.workers.some((worker) => worker.evidence?.stopReason === "completed" && worker.evidence.error === void 0);
		}
		/** Keeps each listed session's composer block in sync with its latest comparison run. */
		var ComparisonAdoptionGate = class {
			sessions;
			blocks;
			reason;
			sessionStops = /* @__PURE__ */ new Map();
			listStop;
			constructor(sessions, blocks, reason) {
				this.sessions = sessions;
				this.blocks = blocks;
				this.reason = reason;
			}
			/** Begin observing the list and every listed session. */
			start() {
				this.reconcile();
				this.listStop = this.sessions.list.subscribe(() => {
					this.reconcile();
				});
				return () => {
					this.dispose();
				};
			}
			reconcile() {
				const ids = new Set(this.sessions.list.getSnapshot().ids);
				for (const sessionId of ids) {
					if (this.sessionStops.has(sessionId)) continue;
					const session = this.sessions.binding(sessionId)?.session;
					if (session === void 0) continue;
					const publish = () => {
						this.blocks.setFor(sessionId, BLOCK_OWNER, requiresComparisonAdoption(session.getSnapshot().chat) ? { reason: this.reason() } : void 0);
					};
					publish();
					this.sessionStops.set(sessionId, session.subscribe(publish));
				}
				for (const [sessionId, stop] of this.sessionStops) {
					if (ids.has(sessionId)) continue;
					stop();
					this.blocks.setFor(sessionId, BLOCK_OWNER, void 0);
					this.sessionStops.delete(sessionId);
				}
			}
			dispose() {
				this.listStop?.();
				this.listStop = void 0;
				for (const [sessionId, stop] of this.sessionStops) {
					stop();
					this.blocks.setFor(sessionId, BLOCK_OWNER, void 0);
				}
				this.sessionStops.clear();
			}
		};
		//#endregion
		//#region \0dsh-css:ComparisonView.module.css.mjs
		const css$2 = ".ls0ERq_chatNode{min-width:0;width:min(var(--dual-eval-available-width,calc(100% + 112px)), calc(100vw - 24px));color:var(--dsw-alias-label-primary);position:relative;left:50%;transform:translate(-50%)}.ls0ERq_runCards{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);min-width:0;max-width:100%}.ls0ERq_runError,.ls0ERq_workerError{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xs-13);border-radius:8px;padding:9px 11px}.ls0ERq_runError{margin-bottom:10px}.ls0ERq_runError p{margin:0}.ls0ERq_runError p+p{margin-top:5px}.ls0ERq_workerGrid{align-items:stretch;gap:12px;min-width:100%;padding:1px;display:grid;overflow-x:auto}.ls0ERq_workerCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;box-shadow:var(--dsw-shadow-lv1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:14px;flex-direction:column;display:flex;overflow:hidden}.ls0ERq_workerHeader{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent);justify-content:space-between;align-items:flex-start;gap:8px;min-height:48px;padding:8px 10px 7px;display:flex}.ls0ERq_workerIdentity{gap:8px;min-width:0;display:flex}.ls0ERq_workerIndex{background:var(--dsw-alias-bg-module-platform);width:28px;height:28px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-strong-13);font-variant-numeric:tabular-nums;border-radius:7px;flex:none;place-items:center;display:grid}.ls0ERq_workerNames{min-width:0}.ls0ERq_workerNames h3{font:var(--dsw-font-s-strong-14);text-overflow:ellipsis;white-space:nowrap;margin:0;line-height:18px;overflow:hidden}.ls0ERq_workerNames code{max-width:250px;color:var(--dsw-alias-label-caption);text-overflow:ellipsis;white-space:nowrap;margin-top:0;font-size:10px;line-height:13px;display:block;overflow:hidden}.ls0ERq_statusLabel{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);white-space:nowrap;align-items:center;gap:6px;margin-top:2px;display:inline-flex}.ls0ERq_workerWaiting{flex-direction:column;flex:1;gap:9px;min-height:180px;padding:18px 14px;display:flex}.ls0ERq_waitingLine,.ls0ERq_waitingLineShort{background:var(--dsw-alias-bg-skeleton);border-radius:4px;height:8px}.ls0ERq_waitingLineShort{width:62%}.ls0ERq_workerBody{flex-direction:column;flex:1;gap:8px;padding:6px 10px 10px;display:flex}.ls0ERq_changeUnknown{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);border-radius:10px;padding:7px 9px}.ls0ERq_additions{color:var(--dsw-alias-state-success-primary);font-weight:600}.ls0ERq_deletions{color:var(--dsw-alias-state-error-primary);font-weight:600}.ls0ERq_fileArtifactRow{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);width:100%;min-width:0;min-height:38px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);font-variant-numeric:tabular-nums;cursor:pointer;border-radius:10px;justify-content:space-between;align-items:center;gap:12px;padding:8px 10px;transition:border-color .12s,background .12s;display:flex}.ls0ERq_fileArtifactRow:not(:disabled):hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}.ls0ERq_fileArtifactRow:disabled{cursor:default;opacity:.6}.ls0ERq_fileArtifactCount,.ls0ERq_fileArtifactDiff{align-items:center;min-width:0;display:inline-flex}.ls0ERq_fileArtifactCount{text-overflow:ellipsis;white-space:nowrap;gap:7px;overflow:hidden}.ls0ERq_fileArtifactDiff{flex:none;gap:10px}.ls0ERq_fileDialogModal{border-radius:16px;gap:0;width:min(980px,100vw - 40px);height:min(720px,100vh - 40px);padding-bottom:0}.ls0ERq_fileDialogContent{flex:1;min-height:0}.ls0ERq_fileDialogContent>div:last-child{flex:1;gap:12px;min-height:0;margin-top:0;padding:0 20px 20px}.ls0ERq_fileDialogToolbar{justify-content:space-between;align-items:center;gap:16px;min-width:0;display:flex}.ls0ERq_fileDialogToolbar p{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);margin:0}.ls0ERq_downloadButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);min-height:30px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-strong-13);cursor:pointer;border-radius:8px;flex:none;justify-content:center;align-items:center;gap:6px;padding:5px 9px;display:inline-flex}.ls0ERq_downloadButton:not(:disabled):hover{border-color:var(--dsw-static-deepseek-500);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ls0ERq_downloadButton:disabled{cursor:default;opacity:.55}.ls0ERq_fileDialogLayout{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;flex:1;grid-template-columns:minmax(190px,250px) minmax(0,1fr);min-width:0;min-height:0;display:grid;overflow:hidden}.ls0ERq_fileListPane{border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);flex-direction:column;min-width:0;min-height:0;display:flex}.ls0ERq_fileListTitle{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xs-13);flex:none;padding:10px 12px 8px}.ls0ERq_fileList{flex-direction:column;flex:1;gap:2px;min-height:0;padding:0 6px 8px;display:flex;overflow:auto}.ls0ERq_fileList button{width:100%;min-width:0;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);text-align:left;cursor:pointer;background:0 0;border:0;border-radius:7px;align-items:center;gap:7px;padding:7px 8px;display:flex}.ls0ERq_fileList button:hover{background:var(--dsw-alias-interactive-bg-hover)}.ls0ERq_fileList button[data-selected]{background:color-mix(in srgb, var(--dsw-static-deepseek-500) 10%, transparent);color:var(--dsw-static-deepseek-500)}.ls0ERq_fileList button span{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.ls0ERq_filePreviewPane{flex-direction:column;min-width:0;min-height:0;display:flex}.ls0ERq_filePreviewHeader{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:space-between;align-items:center;gap:12px;min-width:0;min-height:48px;padding:8px 10px 8px 14px;display:flex}.ls0ERq_filePreviewHeader code{min-width:0;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.ls0ERq_filePreviewBody{background:var(--dsw-alias-markdown-code-block);flex:1;min-width:0;min-height:0;position:relative;overflow:auto}.ls0ERq_filePreviewBody pre{box-sizing:border-box;width:max-content;min-width:100%;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-markdown-code-block-small);tab-size:2;white-space:pre;margin:0;padding:16px}.ls0ERq_filePreviewState,.ls0ERq_filePreviewError,.ls0ERq_filePreviewTruncated{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xs-13);margin:0;padding:18px}.ls0ERq_filePreviewError{color:var(--dsw-alias-state-error-primary)}.ls0ERq_filePreviewTruncated{background:color-mix(in srgb, var(--dsw-alias-bg-layer-2) 94%, transparent);color:var(--dsw-alias-state-warn-label);padding:8px 14px;position:sticky;bottom:0}.ls0ERq_processDetails,.ls0ERq_responseSection{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:10px;overflow:hidden}.ls0ERq_processDetails>summary{min-width:0;min-height:34px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none;align-items:center;padding:6px 8px;display:flex;overflow:hidden}.ls0ERq_processDetails>summary::marker{color:var(--dsw-alias-label-caption)}.ls0ERq_liveBadge{background:color-mix(in srgb, var(--dsw-static-deepseek-500) 13%, transparent);color:var(--dsw-static-deepseek-500);font:var(--dsw-font-xs-13);border-radius:8px;padding:1px 5px}.ls0ERq_processSummaryStats,.ls0ERq_processExpandedStats{min-width:0;color:var(--dsw-alias-label-caption);font:var(--dsw-font-xs-13);font-variant-numeric:tabular-nums;flex-wrap:wrap;align-items:center;gap:4px;display:flex}.ls0ERq_processSummaryStats{white-space:nowrap;flex-wrap:nowrap;flex:none}.ls0ERq_currentToolTicker{min-width:0;height:18px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);flex:1 1 0;align-items:center;display:inline-flex;overflow:hidden}.ls0ERq_currentToolTicker:before{color:var(--dsw-alias-border-l2);content:\"·\";flex:none;margin:0 6px 0 4px}.ls0ERq_currentToolTickerInner{flex:1;align-items:center;gap:5px;width:100%;min-width:0;animation:.36s cubic-bezier(.22,1,.36,1) ls0ERq_dual-eval-current-tool-in;display:inline-flex;overflow:hidden}.ls0ERq_currentToolName,.ls0ERq_currentToolSeparator{white-space:nowrap;flex:none}.ls0ERq_currentToolSeparator{color:var(--dsw-alias-border-l2)}.ls0ERq_currentToolDetail{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}@keyframes ls0ERq_dual-eval-current-tool-in{0%{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}.ls0ERq_processSummaryStats span:not(:last-child):after,.ls0ERq_processExpandedStats span:not(:last-child):after{color:var(--dsw-alias-border-l2);content:\"·\";margin-left:4px}.ls0ERq_processExpandedStats{border-bottom:1px solid var(--dsw-alias-border-l1);padding:7px 2px 8px}.ls0ERq_processBody{border-top:1px solid var(--dsw-alias-border-l1);flex-direction:column;gap:3px;max-height:440px;padding:2px 9px 10px;display:flex;overflow:auto}.ls0ERq_toolRow{flex-direction:column;min-width:0;display:flex}.ls0ERq_toolRowHeader{position:relative;overflow:hidden}.ls0ERq_toolRow[data-running] .ls0ERq_toolRowHeader:after{background:linear-gradient(90deg, transparent, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent), transparent);content:\"\";pointer-events:none;width:180px;animation:2.4s ease-out infinite ls0ERq_dual-eval-tool-sweep;position:absolute;inset:0 auto 0 -180px}@keyframes ls0ERq_dual-eval-tool-sweep{0%{left:-180px}88%,to{left:100%}}.ls0ERq_toolLeading{flex-shrink:0}.ls0ERq_toolChevron{color:var(--dsw-alias-label-secondary)}.ls0ERq_toolTitle{font-weight:400}.ls0ERq_toolSeparator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.ls0ERq_toolSummary{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden}.ls0ERq_toolSummary[data-error]{color:var(--dsw-alias-state-error-primary)}.ls0ERq_toolIoCard{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);max-height:260px;font:var(--dsw-font-markdown-code-block-small);border-radius:12px;flex-direction:column;margin:4px 0 4px 4px;display:flex;overflow:auto}.ls0ERq_toolIoSection{grid-template-columns:max-content minmax(0,1fr);align-items:baseline;gap:14px;padding:11px 14px;display:grid}.ls0ERq_toolIoSection pre{min-width:0;color:var(--dsw-alias-label-secondary);font:inherit;white-space:pre-wrap;word-break:break-word;margin:0}.ls0ERq_toolIoSection pre[data-error]{color:var(--dsw-alias-state-error-primary)}.ls0ERq_toolIoLabel{color:var(--dsw-alias-label-caption)}.ls0ERq_toolIoDivider{background:var(--dsw-alias-border-l2);flex:none;height:1px}.ls0ERq_responseSection h4{border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-strong-13);margin:0;padding:8px 10px}.ls0ERq_responseBody{max-height:520px;padding:9px 10px 10px;font-size:13px;line-height:20px;overflow:auto}.ls0ERq_emptyEvidence,.ls0ERq_truncated{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xs-13);margin:6px 2px}.ls0ERq_truncated{color:var(--dsw-alias-state-warn-label)}.ls0ERq_adoptionFooter{flex-direction:column;gap:8px;margin-top:auto;padding-top:2px;display:flex}.ls0ERq_adoptButton{border:1px solid var(--dsw-alias-border-l2);width:100%;min-height:34px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);font:var(--dsw-font-xs-strong-13);cursor:pointer;border-radius:9px;padding:7px 12px;transition:border-color .12s,background .12s,color .12s}.ls0ERq_adoptButton:not(:disabled):hover{border-color:var(--dsw-static-deepseek-500);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.ls0ERq_adoptButton[data-adopted]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.ls0ERq_adoptButton:disabled{cursor:default;opacity:.62}.ls0ERq_adoptError{color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xs-13);margin:0 2px}@media (width<=720px){.ls0ERq_chatNode{width:100%;left:auto;transform:none}.ls0ERq_workerGrid{grid-template-columns:minmax(290px,1fr)!important}.ls0ERq_fileDialogModal{width:calc(100vw - 20px);height:calc(100vh - 20px)}.ls0ERq_fileDialogToolbar{flex-direction:column;align-items:stretch;gap:8px}.ls0ERq_fileDialogLayout{grid-template-rows:minmax(100px,30%) minmax(0,1fr);grid-template-columns:minmax(0,1fr)}.ls0ERq_fileListPane{border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}}@media (width>=721px) and (width<=1000px){.ls0ERq_chatNode{width:100%;left:auto;transform:none}}@media (prefers-reduced-motion:reduce){.ls0ERq_adoptButton,.ls0ERq_fileArtifactRow,.ls0ERq_currentToolTickerInner,.ls0ERq_toolRow[data-running] .ls0ERq_toolRowHeader:after{transition:none;animation:none}}";
		const tagId$2 = "dsh-dual-model-eval/ComparisonView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-dual-model-eval";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var _dsh_css_ComparisonView_module_css_default = {
			"runError": "ls0ERq_runError",
			"filePreviewPane": "ls0ERq_filePreviewPane",
			"toolIoLabel": "ls0ERq_toolIoLabel",
			"toolIoDivider": "ls0ERq_toolIoDivider",
			"changeUnknown": "ls0ERq_changeUnknown",
			"workerError": "ls0ERq_workerError",
			"downloadButton": "ls0ERq_downloadButton",
			"workerWaiting": "ls0ERq_workerWaiting",
			"filePreviewError": "ls0ERq_filePreviewError",
			"adoptionFooter": "ls0ERq_adoptionFooter",
			"fileDialogModal": "ls0ERq_fileDialogModal",
			"fileDialogToolbar": "ls0ERq_fileDialogToolbar",
			"dual-eval-current-tool-in": "ls0ERq_dual-eval-current-tool-in",
			"waitingLine": "ls0ERq_waitingLine",
			"fileArtifactRow": "ls0ERq_fileArtifactRow",
			"processBody": "ls0ERq_processBody",
			"currentToolDetail": "ls0ERq_currentToolDetail",
			"dual-eval-tool-sweep": "ls0ERq_dual-eval-tool-sweep",
			"toolSeparator": "ls0ERq_toolSeparator",
			"deletions": "ls0ERq_deletions",
			"fileArtifactCount": "ls0ERq_fileArtifactCount",
			"waitingLineShort": "ls0ERq_waitingLineShort",
			"currentToolTicker": "ls0ERq_currentToolTicker",
			"toolIoCard": "ls0ERq_toolIoCard",
			"responseBody": "ls0ERq_responseBody",
			"toolRowHeader": "ls0ERq_toolRowHeader",
			"truncated": "ls0ERq_truncated",
			"processExpandedStats": "ls0ERq_processExpandedStats",
			"workerBody": "ls0ERq_workerBody",
			"fileDialogLayout": "ls0ERq_fileDialogLayout",
			"fileListTitle": "ls0ERq_fileListTitle",
			"fileList": "ls0ERq_fileList",
			"adoptError": "ls0ERq_adoptError",
			"chatNode": "ls0ERq_chatNode",
			"adoptButton": "ls0ERq_adoptButton",
			"filePreviewState": "ls0ERq_filePreviewState",
			"toolChevron": "ls0ERq_toolChevron",
			"workerCard": "ls0ERq_workerCard",
			"processDetails": "ls0ERq_processDetails",
			"statusLabel": "ls0ERq_statusLabel",
			"filePreviewTruncated": "ls0ERq_filePreviewTruncated",
			"fileListPane": "ls0ERq_fileListPane",
			"workerIdentity": "ls0ERq_workerIdentity",
			"currentToolTickerInner": "ls0ERq_currentToolTickerInner",
			"runCards": "ls0ERq_runCards",
			"currentToolName": "ls0ERq_currentToolName",
			"currentToolSeparator": "ls0ERq_currentToolSeparator",
			"workerGrid": "ls0ERq_workerGrid",
			"workerNames": "ls0ERq_workerNames",
			"workerIndex": "ls0ERq_workerIndex",
			"filePreviewBody": "ls0ERq_filePreviewBody",
			"toolLeading": "ls0ERq_toolLeading",
			"toolTitle": "ls0ERq_toolTitle",
			"toolSummary": "ls0ERq_toolSummary",
			"fileDialogContent": "ls0ERq_fileDialogContent",
			"fileArtifactDiff": "ls0ERq_fileArtifactDiff",
			"toolIoSection": "ls0ERq_toolIoSection",
			"filePreviewHeader": "ls0ERq_filePreviewHeader",
			"additions": "ls0ERq_additions",
			"liveBadge": "ls0ERq_liveBadge",
			"emptyEvidence": "ls0ERq_emptyEvidence",
			"workerHeader": "ls0ERq_workerHeader",
			"toolRow": "ls0ERq_toolRow",
			"processSummaryStats": "ls0ERq_processSummaryStats",
			"responseSection": "ls0ERq_responseSection"
		};
		//#endregion
		//#region src/client/ComparisonView.tsx
		function errorText(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function workerStatus(worker, t) {
			const evidence = worker.evidence;
			if (evidence === void 0) return worker.started ? {
				label: t("worker.running"),
				dot: "ongoing"
			} : {
				label: t("worker.pending"),
				dot: "warning"
			};
			if (evidence.error !== void 0 || evidence.stopReason === "error") return {
				label: t("worker.failed"),
				dot: "error"
			};
			return {
				label: t("worker.completed"),
				dot: "done"
			};
		}
		function compactNumber(value) {
			if (value < 1e3) return String(value);
			if (value < 1e6) return `${String(Math.round(value / 100) / 10)}K`;
			return `${String(Math.round(value / 1e5) / 10)}M`;
		}
		function duration(ms) {
			if (ms < 6e4) return `${String(Math.round(ms / 100) / 10)}s`;
			const whole = Math.round(ms / 1e3);
			return `${String(Math.floor(whole / 60))}m${String(whole % 60)}s`;
		}
		function processSummaryStats(metrics, elapsedMs, running, t) {
			const groups = [t("process.elapsed", { duration: duration(elapsedMs) })];
			if (!running) groups.push(t("process.tools", { count: metrics?.toolCalls ?? 0 }));
			return groups;
		}
		function processExpandedStats(metrics, t) {
			if (metrics === void 0) return [];
			const totalInput = metrics.inputTokens + metrics.cacheReadTokens + metrics.cacheWriteTokens;
			const groups = [t("process.steps", { count: metrics.steps })];
			if (totalInput > 0 || metrics.outputTokens > 0) groups.push(t("process.tokens", {
				input: compactNumber(totalInput),
				output: compactNumber(metrics.outputTokens)
			}));
			if (totalInput > 0) groups.push(t("process.cache", { percent: Math.round(metrics.cacheReadTokens / totalInput * 100) }));
			if (metrics.ttftSteps > 0) groups.push(t("process.ttft", { duration: duration(metrics.ttftMs / metrics.ttftSteps) }));
			if (metrics.decodeMs > 0 && metrics.outputTokens > 0) groups.push(t("process.speed", { speed: String(Math.round(metrics.outputTokens / (metrics.decodeMs / 1e3) * 10) / 10) }));
			return groups;
		}
		function toolSummary(tool) {
			try {
				const parsed = JSON.parse(tool.argsRaw);
				if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return tool.argsRaw;
				const args = parsed;
				for (const key of [
					"cmd",
					"command",
					"path",
					"filePath",
					"file_path",
					"query",
					"pattern",
					"url"
				]) {
					const value = args[key];
					if (typeof value === "string" && value !== "") return value.split("\n")[0] ?? "";
				}
				return Object.keys(args).slice(0, 3).join(", ");
			} catch {
				return tool.argsRaw.split("\n")[0] ?? "";
			}
		}
		function toolOutput(tool) {
			return tool.content.filter((block) => block.type === "text").map((block) => block.text).join("");
		}
		function latestObservedTool(tools) {
			return tools.at(-1);
		}
		function changedFilePaths(evidence) {
			const declared = evidence.changes?.files ?? [];
			if (declared.length > 0) return declared;
			const paths = /* @__PURE__ */ new Set();
			for (const line of evidence.patchPreview.split("\n")) {
				if (!line.startsWith("diff --git ")) continue;
				const marker = line.lastIndexOf(" b/");
				if (marker < 0) continue;
				const path = line.slice(marker + 3).replace(/^"|"$/gu, "");
				if (path !== "" && path !== "/dev/null") paths.add(path);
			}
			if (paths.size > 0) return [...paths];
			for (const line of evidence.status.split("\n")) {
				if (line.length < 4) continue;
				const path = (line.slice(3).split(" -> ").at(-1) ?? "").trim().replace(/^"|"$/gu, "");
				if (path !== "") paths.add(path);
			}
			return [...paths];
		}
		function ToolTraceRow({ tool }) {
			const [open, setOpen] = (0, react.useState)(false);
			const output = toolOutput(tool);
			const args = tool.argsRaw === "{}" ? "" : tool.argsRaw;
			const expandable = args !== "" || output !== "";
			const running = tool.endedAt === void 0;
			const summary = (tool.isError ? output.split("\n")[0] || tool.error?.code || tool.error?.name || tool.name : void 0) ?? toolSummary(tool);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: _dsh_css_ComparisonView_module_css_default.toolRow,
				"data-error": tool.isError || void 0,
				"data-running": running || void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: _dsh_css_ComparisonView_module_css_default.toolRowHeader,
					leadingClassName: _dsh_css_ComparisonView_module_css_default.toolLeading,
					titleClassName: _dsh_css_ComparisonView_module_css_default.toolTitle,
					chevronClassName: _dsh_css_ComparisonView_module_css_default.toolChevron,
					icon: tool.isError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }) : running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 14 }),
					title: tool.name,
					open: open && expandable,
					expandable,
					expandOnRowClick: true,
					keepContentWhenOpen: true,
					onToggle: () => {
						setOpen((value) => !value);
					},
					collapsedContent: summary !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: _dsh_css_ComparisonView_module_css_default.toolSeparator,
						"aria-hidden": true
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: _dsh_css_ComparisonView_module_css_default.toolSummary,
						"data-error": tool.isError || void 0,
						children: summary
					})] }),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_css_ComparisonView_module_css_default.toolIoCard,
						children: [
							args !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: _dsh_css_ComparisonView_module_css_default.toolIoSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: _dsh_css_ComparisonView_module_css_default.toolIoLabel,
									children: "IN"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: args })]
							}),
							args !== "" && output !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_css_ComparisonView_module_css_default.toolIoDivider }),
							output !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: _dsh_css_ComparisonView_module_css_default.toolIoSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: _dsh_css_ComparisonView_module_css_default.toolIoLabel,
									children: "OUT"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
									"data-error": tool.isError || void 0,
									children: output
								})]
							})
						]
					})
				})
			});
		}
		function ResponseSection({ worker, t }) {
			const evidence = worker.evidence;
			if (evidence === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: _dsh_css_ComparisonView_module_css_default.responseSection,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("worker.response") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_css_ComparisonView_module_css_default.responseBody,
					children: [evidence.response === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_css_ComparisonView_module_css_default.emptyEvidence,
						children: t("worker.emptyResponse")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: evidence.response }), evidence.responseTruncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_css_ComparisonView_module_css_default.truncated,
						children: t("worker.truncated")
					})]
				})]
			});
		}
		function useWorkerElapsed(worker) {
			const [now, setNow] = (0, react.useState)(() => Date.now());
			const running = worker.started && worker.evidence === void 0;
			(0, react.useEffect)(() => {
				if (!running || worker.startedAt === void 0) return;
				const timer = window.setInterval(() => {
					setNow(Date.now());
				}, 1e3);
				return () => {
					window.clearInterval(timer);
				};
			}, [running, worker.startedAt]);
			if (worker.evidence !== void 0) return worker.evidence.elapsedMs;
			const observed = worker.progress?.elapsedMs ?? 0;
			if (worker.startedAt === void 0) return observed;
			return Math.max(observed, now - worker.startedAt);
		}
		function ProcessDetails({ worker, t }) {
			const evidence = worker.evidence;
			const progress = worker.progress;
			const elapsedMs = useWorkerElapsed(worker);
			if (!worker.started) return null;
			const tools = evidence?.tools ?? progress?.tools ?? [];
			const metrics = evidence?.metrics ?? progress?.metrics;
			const toolsTruncated = evidence?.toolsTruncated ?? progress?.toolsTruncated ?? false;
			const running = evidence === void 0;
			const summaryStats = processSummaryStats(metrics, elapsedMs, running, t);
			const expandedStats = processExpandedStats(metrics, t);
			const currentTool = running ? latestObservedTool(tools) : void 0;
			const currentToolDetail = currentTool === void 0 ? "" : toolSummary(currentTool);
			const currentToolLabel = currentTool === void 0 ? "" : [currentTool.name, currentToolDetail].filter((value) => value !== "").join(" · ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: _dsh_css_ComparisonView_module_css_default.processDetails,
				"aria-label": t("process.title"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
					title: t("process.title"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: _dsh_css_ComparisonView_module_css_default.processSummaryStats,
						children: summaryStats.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: value }, value))
					}), currentTool !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: _dsh_css_ComparisonView_module_css_default.currentToolTicker,
						"aria-live": "polite",
						title: currentToolLabel,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: _dsh_css_ComparisonView_module_css_default.currentToolTickerInner,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 13 }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: _dsh_css_ComparisonView_module_css_default.currentToolName,
									children: currentTool.name
								}),
								currentToolDetail !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: _dsh_css_ComparisonView_module_css_default.currentToolSeparator,
									"aria-hidden": true,
									children: "·"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: _dsh_css_ComparisonView_module_css_default.currentToolDetail,
									children: currentToolDetail
								})] })
							]
						})
					}, currentTool.callId)]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_css_ComparisonView_module_css_default.processBody,
					children: [
						(running || expandedStats.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: _dsh_css_ComparisonView_module_css_default.processExpandedStats,
							children: [running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: _dsh_css_ComparisonView_module_css_default.liveBadge,
								children: t("process.live")
							}), expandedStats.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: value }, value))]
						}),
						tools.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: _dsh_css_ComparisonView_module_css_default.emptyEvidence,
							children: running ? t("process.waiting") : t("process.empty")
						}) : tools.map((tool) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolTraceRow, { tool }, tool.callId)),
						toolsTruncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: _dsh_css_ComparisonView_module_css_default.truncated,
							children: t("process.truncated")
						})
					]
				})]
			});
		}
		function FilePreviewDialog({ run, worker, files, open, onClose, previewFile, downloadFile, downloadWorkspace, t }) {
			const [selectedPath, setSelectedPath] = (0, react.useState)(files[0] ?? "");
			const [preview, setPreview] = (0, react.useState)();
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const [downloading, setDownloading] = (0, react.useState)();
			const requestBase = {
				artifactDirectory: run.artifactDirectory,
				runId: run.runId,
				index: worker.route.index
			};
			(0, react.useEffect)(() => {
				if (!open) return;
				if (selectedPath === "" || !files.includes(selectedPath)) setSelectedPath(files[0] ?? "");
			}, [
				files,
				open,
				selectedPath
			]);
			(0, react.useEffect)(() => {
				if (!open || selectedPath === "") return;
				let active = true;
				setLoading(true);
				setPreview(void 0);
				setError(void 0);
				previewFile({
					...requestBase,
					path: selectedPath
				}).then((value) => {
					if (active) setPreview(value);
				}).catch((cause) => {
					if (active) setError(t("files.error", { message: errorText(cause) }));
				}).finally(() => {
					if (active) setLoading(false);
				});
				return () => {
					active = false;
				};
			}, [
				open,
				previewFile,
				run.artifactDirectory,
				run.runId,
				selectedPath,
				t,
				worker.route.index
			]);
			const startDownload = async (kind) => {
				setDownloading(kind);
				setError(void 0);
				try {
					if (kind === "workspace") await downloadWorkspace(requestBase);
					else await downloadFile({
						...requestBase,
						path: selectedPath
					});
				} catch (cause) {
					setError(t("files.downloadFailed", { message: errorText(cause) }));
				} finally {
					setDownloading(void 0);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose,
				title: t("files.dialogTitle", { model: worker.route.label }),
				closeLabel: t("files.close"),
				className: _dsh_css_ComparisonView_module_css_default.fileDialogModal ?? "",
				contentClassName: _dsh_css_ComparisonView_module_css_default.fileDialogContent ?? "",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_css_ComparisonView_module_css_default.fileDialogToolbar,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("files.workspaceHint") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: _dsh_css_ComparisonView_module_css_default.downloadButton,
						disabled: downloading !== void 0,
						onClick: () => {
							startDownload("workspace");
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutline16, { size: 16 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: downloading === "workspace" ? t("files.downloading") : t("files.downloadWorkspace") })]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_css_ComparisonView_module_css_default.fileDialogLayout,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
						className: _dsh_css_ComparisonView_module_css_default.fileListPane,
						"aria-label": t("changes.fileList"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_css_ComparisonView_module_css_default.fileListTitle,
							children: t("changes.files", { count: files.length })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_css_ComparisonView_module_css_default.fileList,
							children: files.map((path) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								"data-selected": path === selectedPath || void 0,
								title: path,
								onClick: () => {
									setSelectedPath(path);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 15 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: path })]
							}, path))
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: _dsh_css_ComparisonView_module_css_default.filePreviewPane,
						"aria-label": t("files.preview"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: _dsh_css_ComparisonView_module_css_default.filePreviewHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								title: selectedPath,
								children: selectedPath
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: _dsh_css_ComparisonView_module_css_default.downloadButton,
								disabled: downloading !== void 0 || preview?.deleted === true || selectedPath === "",
								onClick: () => {
									startDownload("file");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, { size: 16 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: downloading === "file" ? t("files.downloading") : t("files.downloadFile") })]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: _dsh_css_ComparisonView_module_css_default.filePreviewBody,
							children: [
								loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_css_ComparisonView_module_css_default.filePreviewState,
									children: t("files.loading")
								}),
								!loading && error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_css_ComparisonView_module_css_default.filePreviewError,
									children: error
								}),
								!loading && error === void 0 && preview?.deleted === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_css_ComparisonView_module_css_default.filePreviewState,
									children: t("files.deleted")
								}),
								!loading && error === void 0 && preview?.binary === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_css_ComparisonView_module_css_default.filePreviewState,
									children: t("files.binary", { size: compactNumber(preview.size) })
								}),
								!loading && error === void 0 && preview !== void 0 && !preview.deleted && !preview.binary && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: preview.content }), preview.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_css_ComparisonView_module_css_default.filePreviewTruncated,
									children: t("files.truncated")
								})] })
							]
						})]
					})]
				})]
			});
		}
		function ChangeSummary({ run, worker, changes, files, previewFile, downloadFile, downloadWorkspace, t }) {
			const [open, setOpen] = (0, react.useState)(false);
			if (changes === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: _dsh_css_ComparisonView_module_css_default.changeUnknown,
				children: t("changes.unknown")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: _dsh_css_ComparisonView_module_css_default.fileArtifactRow,
				"aria-label": t("changes.aria", {
					count: changes.filesChanged,
					additions: changes.additions,
					deletions: changes.deletions
				}),
				disabled: files.length === 0,
				onClick: () => {
					setOpen(true);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: _dsh_css_ComparisonView_module_css_default.fileArtifactCount,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 15 }), t("changes.files", { count: changes.filesChanged })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: _dsh_css_ComparisonView_module_css_default.fileArtifactDiff,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: _dsh_css_ComparisonView_module_css_default.additions,
						children: ["+", compactNumber(changes.additions)]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: _dsh_css_ComparisonView_module_css_default.deletions,
						children: ["-", compactNumber(changes.deletions)]
					})]
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FilePreviewDialog, {
				run,
				worker,
				files,
				open,
				onClose: () => {
					setOpen(false);
				},
				previewFile,
				downloadFile,
				downloadWorkspace,
				t
			})] });
		}
		function AdoptionFooter({ run, worker, transport, t }) {
			const [pending, setPending] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const selected = run.adopted?.index === worker.route.index;
			const anotherSelected = run.adopted !== void 0 && !selected;
			const evidence = worker.evidence;
			const adoptable = run.status === "completed" && evidence?.stopReason === "completed" && evidence.error === void 0;
			const label = selected ? t("action.adopted") : anotherSelected ? t("action.otherAdopted") : pending ? t("action.adopting") : t("action.adopt");
			const onAdopt = async () => {
				setPending(true);
				setError(void 0);
				try {
					await transport.adopt(run.runId, worker.route.index);
				} catch (cause) {
					setError(t("action.adoptFailed", { message: errorText(cause) }));
				} finally {
					setPending(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
				className: _dsh_css_ComparisonView_module_css_default.adoptionFooter,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChangeSummary, {
						run,
						worker,
						changes: evidence?.changes,
						files: evidence === void 0 ? [] : changedFilePaths(evidence),
						previewFile: transport.previewFile,
						downloadFile: transport.downloadFile,
						downloadWorkspace: transport.downloadWorkspace,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: _dsh_css_ComparisonView_module_css_default.adoptButton,
						"data-adopted": selected || void 0,
						"data-dual-eval-adopt": worker.route.index,
						disabled: !adoptable || pending || run.adopted !== void 0,
						onClick: () => {
							onAdopt();
						},
						children: label
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_css_ComparisonView_module_css_default.adoptError,
						children: error
					})
				]
			});
		}
		function WorkerCard({ run, worker, transport, t }) {
			const status = workerStatus(worker, t);
			const evidence = worker.evidence;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: _dsh_css_ComparisonView_module_css_default.workerCard,
				"data-dual-eval-model": worker.route.model,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: _dsh_css_ComparisonView_module_css_default.workerHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_css_ComparisonView_module_css_default.workerIdentity,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: _dsh_css_ComparisonView_module_css_default.workerIndex,
							children: String(worker.route.index + 1).padStart(2, "0")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: _dsh_css_ComparisonView_module_css_default.workerNames,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: worker.route.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("code", { children: [
								worker.route.provider,
								"/",
								worker.route.model
							] })]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_css_ComparisonView_module_css_default.statusLabel,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: status.dot }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: status.label })]
					})]
				}), !worker.started ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_css_ComparisonView_module_css_default.workerWaiting,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_css_ComparisonView_module_css_default.waitingLine }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_css_ComparisonView_module_css_default.waitingLineShort })]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_css_ComparisonView_module_css_default.workerBody,
					children: [
						evidence?.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_css_ComparisonView_module_css_default.workerError,
							children: evidence.error
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProcessDetails, {
							worker,
							t
						}),
						evidence !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResponseSection, {
							worker,
							t
						}),
						evidence !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdoptionFooter, {
							run,
							worker,
							transport,
							t
						})
					]
				})]
			});
		}
		function RunCards({ run, transport, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: _dsh_css_ComparisonView_module_css_default.runCards,
				"aria-label": t("comparison.results"),
				children: [(run.error !== void 0 || run.cleanupErrors.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_css_ComparisonView_module_css_default.runError,
					children: [run.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: run.error }), run.cleanupErrors.map((error) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: error }, error))]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: _dsh_css_ComparisonView_module_css_default.workerGrid,
					style: { gridTemplateColumns: `repeat(${String(run.workers.length)}, minmax(310px, 1fr))` },
					children: run.workers.map((worker) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkerCard, {
						run,
						worker,
						transport,
						t
					}, `${run.runId}-${String(worker.route.index)}`))
				})]
			});
		}
		/** Render one durable side-by-side comparison directly inside the ordinary Chat flow. */
		function ComparisonRunNode({ node, adopt, previewFile, downloadFile, downloadWorkspace, t }) {
			const rootRef = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				const root = rootRef.current;
				const viewport = root?.closest("[data-conversation-scroll]");
				if (root === null || viewport === null || viewport === void 0) return;
				const updateWidth = () => {
					if (viewport.clientWidth > 0) root.style.setProperty("--dual-eval-available-width", `${String(Math.max(0, viewport.clientWidth - 24))}px`);
				};
				updateWidth();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(updateWidth);
				observer.observe(viewport);
				return () => {
					observer.disconnect();
				};
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: rootRef,
				className: _dsh_css_ComparisonView_module_css_default.chatNode,
				"data-dual-eval-run": node.data.runId,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunCards, {
					run: node.data,
					transport: {
						adopt,
						previewFile,
						downloadFile,
						downloadWorkspace
					},
					t
				})
			});
		}
		//#endregion
		//#region src/client/comparison-view-model.ts
		function buildSnapshot(state) {
			return {
				runId: state.runId,
				task: state.task,
				repository: state.repository,
				baseCommit: state.baseCommit,
				artifactDirectory: state.artifactDirectory,
				startedAt: state.startedAt,
				status: state.status,
				...state.elapsedMs === void 0 ? {} : { elapsedMs: state.elapsedMs },
				worktreesKept: state.worktreesKept,
				cleanupErrors: state.cleanupErrors,
				...state.error === void 0 ? {} : { error: state.error },
				...state.adopted === void 0 ? {} : { adopted: state.adopted },
				workers: [...state.workers.values()].sort((left, right) => left.route.index - right.route.index)
			};
		}
		function eventRunId(match) {
			return match.event.data.runId;
		}
		function mergeProgress(current, next) {
			let tools = next.tools ?? current?.tools ?? [];
			const changedTool = next.tool;
			if (changedTool !== void 0) {
				const index = tools.findIndex((tool) => tool.callId === changedTool.callId);
				tools = index < 0 ? [...tools, changedTool] : tools.map((tool, candidate) => candidate === index ? changedTool : tool);
			}
			return {
				childSessionId: next.childSessionId,
				elapsedMs: next.elapsedMs,
				metrics: next.metrics,
				tools,
				toolsTruncated: next.toolsTruncated
			};
		}
		const dualEvalRunDefinition = {
			kind: "dual-eval-run",
			target: "chat",
			match: (event) => {
				if (event.type === "dual-eval/run-start") return {
					id: event.data.runId,
					role: "start"
				};
				if (event.type === "dual-eval/worker-start" || event.type === "dual-eval/worker-progress" || event.type === "dual-eval/worker-end" || event.type === "dual-eval/run-end" || event.type === "dual-eval/adopted") return {
					id: event.data.runId,
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "dual-eval/run-start") throw new Error("dual-eval run started without run-start");
				return {
					runId: match.event.data.runId,
					task: match.event.data.task,
					repository: match.event.data.repository,
					baseCommit: match.event.data.baseCommit,
					artifactDirectory: match.event.data.artifactDirectory,
					startedAt: match.event.time,
					status: "running",
					worktreesKept: false,
					cleanupErrors: [],
					workers: new Map(match.event.data.models.map((route) => [route.index, {
						route,
						started: false
					}]))
				};
			},
			update: (context, match) => {
				const state = context.state;
				if (eventRunId(match) !== state.runId) return state;
				if (match.event.type === "dual-eval/worker-start") {
					const workers = new Map(state.workers);
					workers.set(match.event.data.model.index, {
						route: match.event.data.model,
						started: true,
						startedAt: match.event.time
					});
					return {
						...state,
						workers
					};
				}
				if (match.event.type === "dual-eval/worker-progress") {
					const workers = new Map(state.workers);
					const index = match.event.data.progress.index;
					const current = workers.get(index);
					if (current === void 0) return state;
					workers.set(index, {
						...current,
						started: true,
						progress: mergeProgress(current.progress, match.event.data.progress)
					});
					return {
						...state,
						workers
					};
				}
				if (match.event.type === "dual-eval/worker-end") {
					const workers = new Map(state.workers);
					const index = match.event.data.evidence.index;
					const previous = workers.get(index);
					workers.set(index, {
						route: match.event.data.evidence,
						started: true,
						...previous?.startedAt === void 0 ? {} : { startedAt: previous.startedAt },
						evidence: match.event.data.evidence
					});
					return {
						...state,
						workers
					};
				}
				if (match.event.type === "dual-eval/run-end") return {
					...state,
					status: match.event.data.status,
					elapsedMs: match.event.data.elapsedMs,
					worktreesKept: match.event.data.worktreesKept,
					cleanupErrors: match.event.data.cleanupErrors,
					...match.event.data.error === void 0 ? {} : { error: match.event.data.error }
				};
				if (match.event.type === "dual-eval/adopted") return {
					...state,
					adopted: {
						index: match.event.data.index,
						commit: match.event.data.commit
					}
				};
				return state;
			},
			buildViewNode: (context) => {
				if (context.state === void 0 || context.start === void 0) return null;
				return {
					key: context.key,
					kind: "dual-eval-run",
					id: context.id,
					target: "chat",
					anchorSeq: context.start.event.seq,
					location: context.start.location,
					visibility: "visible",
					data: buildSnapshot(context.state)
				};
			}
		};
		//#endregion
		//#region src/client/locales.ts
		const NS = "dualEval";
		const zh = {
			"trigger.compare": "对比 · {count}",
			"trigger.compareAria": "对比测试，已选择 {count} 个模型",
			"trigger.modelAria": "模型：{model}",
			"trigger.fallback": "选择模型",
			"menu.aria": "模型与对比测试",
			"compare.title": "对比测试",
			"compare.description": "同一任务将在独立 Git 工作树中并发运行",
			"compare.selected": "已选择 {count}/{max}",
			"compare.minimum": "至少选择 2 个模型",
			"compare.maximum": "最多选择 {max} 个模型",
			"group.effort": "推理强度",
			"effort.default": "提供方默认",
			"status.loading": "正在加载模型…",
			"status.submitting": "正在启动对比…",
			"empty.models": "没有可用模型",
			"action.retry": "重试",
			"error.load": "模型目录加载失败：{message}",
			"submit.images": "对比测试暂不支持图片，请先移除图片后再试。",
			"submit.minimum": "对比测试至少需要选择 2 个模型。",
			"submit.maximum": "选择的模型超过当前服务端上限。",
			"submit.busy": "当前对比任务仍在运行，请等待结束。",
			"submit.adoptRequired": "需要采纳一个结果才能继续发消息",
			"submit.transport": "无法启动对比测试：{message}",
			"comparison.results": "模型对比结果",
			"worker.pending": "等待启动",
			"worker.running": "运行中",
			"worker.completed": "已结束",
			"worker.failed": "失败",
			"worker.response": "最终回复",
			"worker.emptyResponse": "模型没有返回文本",
			"worker.truncated": "界面已截断；完整内容见证据文件。",
			"changes.unknown": "旧运行未记录改动统计",
			"changes.files": "{count} 个文件",
			"changes.fileList": "改动文件",
			"changes.aria": "{count} 个文件，增加 {additions} 行，删除 {deletions} 行",
			"files.dialogTitle": "{model} 的改动文件",
			"files.close": "关闭文件预览",
			"files.preview": "文件内容预览",
			"files.workspaceHint": "候选工作区包含原始基线与该模型的全部修改；下载包不包含 .git 元数据。",
			"files.downloadWorkspace": "下载完整 Worktree",
			"files.downloadFile": "下载此文件",
			"files.downloading": "准备下载…",
			"files.loading": "正在重建并读取文件…",
			"files.deleted": "这个文件已被该模型删除。",
			"files.binary": "这是一个二进制文件（{size} 字节），可直接下载查看。",
			"files.truncated": "预览已截断；下载文件可获取完整内容。",
			"files.error": "无法读取文件：{message}",
			"files.downloadFailed": "下载失败：{message}",
			"process.title": "工具调用过程",
			"process.live": "实时",
			"process.elapsed": "耗时 {duration}",
			"process.steps": "{count} 步",
			"process.tools": "{count} 次工具",
			"process.tokens": "Token {input} 入 / {output} 出",
			"process.cache": "缓存命中 {percent}%",
			"process.ttft": "首 Token {duration}",
			"process.speed": "{speed} Token/s",
			"process.empty": "这次运行未记录到工具调用；旧运行只保留了最终结果。",
			"process.waiting": "正在等待第一次工具调用；模型步骤和工具轨迹会实时出现在这里。",
			"process.truncated": "工具列表已截断；完整轨迹仍保留在子 Session 中。",
			"action.adopt": "采纳此结果",
			"action.adopting": "正在采纳…",
			"action.adopted": "已采纳 · 后续轮次从这里继续",
			"action.otherAdopted": "已采纳另一模型",
			"action.adoptFailed": "采纳失败：{message}"
		};
		const en = {
			"trigger.compare": "Compare · {count}",
			"trigger.compareAria": "Comparison mode, {count} models selected",
			"trigger.modelAria": "Model: {model}",
			"trigger.fallback": "Select model",
			"menu.aria": "Models and comparison mode",
			"compare.title": "Comparison mode",
			"compare.description": "Run the same task concurrently in isolated Git worktrees",
			"compare.selected": "{count}/{max} selected",
			"compare.minimum": "Select at least 2 models",
			"compare.maximum": "Select up to {max} models",
			"group.effort": "Reasoning effort",
			"effort.default": "Provider default",
			"status.loading": "Loading models…",
			"status.submitting": "Starting comparison…",
			"empty.models": "No models available",
			"action.retry": "Retry",
			"error.load": "Failed to load model directory: {message}",
			"submit.images": "Comparison mode does not support images yet. Remove them and try again.",
			"submit.minimum": "Select at least 2 models for a comparison.",
			"submit.maximum": "The selected models exceed the current server limit.",
			"submit.busy": "The current comparison is still running.",
			"submit.adoptRequired": "Adopt one result before sending another message",
			"submit.transport": "Could not start comparison: {message}",
			"comparison.results": "Model comparison results",
			"worker.pending": "Waiting",
			"worker.running": "Running",
			"worker.completed": "Settled",
			"worker.failed": "Failed",
			"worker.response": "Final response",
			"worker.emptyResponse": "The model returned no text",
			"worker.truncated": "The UI is truncated; see the evidence file for the full content.",
			"changes.unknown": "Change statistics were not recorded for this older run",
			"changes.files": "{count} files",
			"changes.fileList": "Changed files",
			"changes.aria": "{count} files, {additions} lines added and {deletions} deleted",
			"files.dialogTitle": "Files changed by {model}",
			"files.close": "Close file preview",
			"files.preview": "File content preview",
			"files.workspaceHint": "The candidate workspace includes the original baseline and all model edits. The archive excludes .git metadata.",
			"files.downloadWorkspace": "Download full worktree",
			"files.downloadFile": "Download file",
			"files.downloading": "Preparing…",
			"files.loading": "Reconstructing and reading the file…",
			"files.deleted": "This file was deleted by the model.",
			"files.binary": "This is a binary file ({size} bytes). Download it to inspect the contents.",
			"files.truncated": "The preview is truncated. Download the file for its complete contents.",
			"files.error": "Could not read file: {message}",
			"files.downloadFailed": "Download failed: {message}",
			"process.title": "Tool calls",
			"process.live": "Live",
			"process.elapsed": "{duration}",
			"process.steps": "{count} steps",
			"process.tools": "{count} tools",
			"process.tokens": "{input} in / {output} out",
			"process.cache": "{percent}% cache hit",
			"process.ttft": "{duration} first token",
			"process.speed": "{speed} tokens/s",
			"process.empty": "No Tool calls were captured. Older runs only retain the final result.",
			"process.waiting": "Waiting for the first Tool call. Model steps and Tool activity update here live.",
			"process.truncated": "The Tool list is truncated; the full trajectory remains in the child Session.",
			"action.adopt": "Adopt this result",
			"action.adopting": "Adopting…",
			"action.adopted": "Adopted · later rounds continue here",
			"action.otherAdopted": "Another model was adopted",
			"action.adoptFailed": "Adoption failed: {message}"
		};
		//#endregion
		//#region node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region src/client/selection-runtime.ts
		const EMPTY_STATE = {
			enabled: false,
			selected: [],
			submitting: false
		};
		function choiceKey(choice) {
			return `${choice.provider}\u0000${choice.model}\u0000${choice.reasoningEffort ?? ""}`;
		}
		/** Flatten one Host directory into complete routes suitable for comparison. */
		function choicesOf(state) {
			return state.groups.flatMap((group) => group.models.map((model) => {
				const reasoningEffort = state.current?.provider === group.id && state.current.model === model.id ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort : model.reasoning?.defaultEffort;
				return {
					label: model.name,
					providerLabel: group.name,
					provider: group.id,
					model: model.id,
					...reasoningEffort === void 0 ? {} : { reasoningEffort }
				};
			}));
		}
		/** Client-owned ephemeral comparison selection, isolated by parent session. */
		var ComparisonSelectionRuntime = class {
			maxModels;
			stores = /* @__PURE__ */ new Map();
			constructor(maxModels = 4) {
				this.maxModels = maxModels;
			}
			storeFor(sessionId) {
				let store = this.stores.get(sessionId);
				if (store === void 0) {
					store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(EMPTY_STATE);
					this.stores.set(sessionId, store);
				}
				return store;
			}
			setEnabled(sessionId, enabled, directory) {
				const store = this.storeFor(sessionId);
				if (!enabled) {
					store.update((draft) => {
						draft.enabled = false;
					});
					return;
				}
				const available = choicesOf(directory);
				const current = available.find((choice) => choice.provider === directory.current?.provider && choice.model === directory.current.model);
				const selected = [];
				if (current !== void 0) selected.push(current);
				for (const choice of available) {
					if (selected.length >= Math.min(2, this.maxModels)) break;
					if (!selected.some((existing) => choiceKey(existing) === choiceKey(choice))) selected.push(choice);
				}
				store.set({
					enabled: true,
					selected,
					submitting: false
				});
			}
			toggleChoice(sessionId, choice) {
				this.storeFor(sessionId).update((draft) => {
					const key = choiceKey(choice);
					const index = draft.selected.findIndex((candidate) => choiceKey(candidate) === key);
					if (index >= 0) draft.selected.splice(index, 1);
					else if (draft.selected.length < this.maxModels) draft.selected.push(choice);
				});
			}
			setSubmitting(sessionId, submitting) {
				this.storeFor(sessionId).update((draft) => {
					draft.submitting = submitting;
				});
			}
			selection(sessionId) {
				return this.storeFor(sessionId).getSnapshot().selected.map((choice) => ({
					provider: choice.provider,
					model: choice.model,
					...choice.reasoningEffort === void 0 ? {} : { reasoningEffort: choice.reasoningEffort }
				}));
			}
		};
		//#endregion
		//#region \0dsh-css:ComparisonMenuExtension.module.css.mjs
		const css$1 = ".hctwya_root{border-top:1px solid var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);margin-top:2px;padding-top:4px}.hctwya_compareSwitch{width:100%;min-height:58px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:10px;align-items:center;gap:12px;padding:8px 10px;display:flex}.hctwya_compareSwitch:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.hctwya_compareSwitch:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:-2px}.hctwya_compareSwitch:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.hctwya_switchCopy{flex-direction:column;flex:1;min-width:0;display:flex}.hctwya_switchTitle{font-size:14px;font-weight:600;line-height:20px}.hctwya_switchDescription{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.hctwya_switchTrack{background:var(--dsw-alias-bg-skeleton);border-radius:12px;flex:none;align-items:center;width:32px;height:18px;padding:2px;transition:background .14s;display:flex}.hctwya_switchTrackOn{background:var(--dsw-alias-state-success-primary)}.hctwya_switchThumb{background:var(--dsw-alias-bg-layer-1);width:14px;height:14px;box-shadow:var(--dsw-shadow-lv1);border-radius:50%;transition:transform .14s}.hctwya_switchTrackOn .hctwya_switchThumb{transform:translate(14px)}.hctwya_compareSummary{color:var(--dsw-alias-label-tertiary);justify-content:space-between;gap:8px;padding:7px 9px 3px;font-size:11px;line-height:16px;display:flex}.hctwya_summaryWarning{color:var(--dsw-alias-state-warn-label)}.hctwya_summaryHint{color:var(--dsw-alias-label-caption)}.hctwya_groups{max-height:min(300px,100vh - 320px);overflow-y:auto}.hctwya_group+.hctwya_group{margin-top:4px}.hctwya_groupTitle{z-index:1;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);padding:6px 9px 3px;font-size:11px;font-weight:600;line-height:17px;position:sticky;top:0}.hctwya_option{width:100%;min-height:38px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:9px;outline:none;align-items:center;gap:8px;padding:5px 9px;display:flex}.hctwya_option:hover:not(:disabled),.hctwya_option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.hctwya_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.hctwya_selected{background:var(--dsw-alias-bg-module-platform)}.hctwya_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}.hctwya_modelName{text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:20px;overflow:hidden}.hctwya_description{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.hctwya_check{width:18px;color:var(--dsw-alias-label-primary);flex:none;place-items:center;display:grid}.hctwya_status{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:12px;line-height:18px}.hctwya_error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;gap:8px;margin:4px 0;padding:7px 8px;font-size:11px;line-height:17px;display:flex}.hctwya_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:0;padding:0;font-weight:600}@media (prefers-reduced-motion:reduce){.hctwya_switchTrack,.hctwya_switchThumb{transition:none}}";
		const tagId$1 = "dsh-dual-model-eval/ComparisonMenuExtension.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-dual-model-eval";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var _dsh_css_ComparisonMenuExtension_module_css_default = {
			"root": "hctwya_root",
			"retry": "hctwya_retry",
			"groupTitle": "hctwya_groupTitle",
			"summaryHint": "hctwya_summaryHint",
			"selected": "hctwya_selected",
			"error": "hctwya_error",
			"option": "hctwya_option",
			"switchTrackOn": "hctwya_switchTrackOn",
			"summaryWarning": "hctwya_summaryWarning",
			"compareSwitch": "hctwya_compareSwitch",
			"switchCopy": "hctwya_switchCopy",
			"switchTrack": "hctwya_switchTrack",
			"compareSummary": "hctwya_compareSummary",
			"modelName": "hctwya_modelName",
			"optionCopy": "hctwya_optionCopy",
			"switchTitle": "hctwya_switchTitle",
			"description": "hctwya_description",
			"switchThumb": "hctwya_switchThumb",
			"check": "hctwya_check",
			"group": "hctwya_group",
			"status": "hctwya_status",
			"switchDescription": "hctwya_switchDescription",
			"groups": "hctwya_groups"
		};
		//#endregion
		//#region src/client/ComparisonMenuExtension.tsx
		/** Additive comparison controls inside the standard model selector menu. */
		function ComparisonMenuExtension({ locked, maxModels, directory, comparison, load, setEnabled, toggleChoice, t }) {
			const models = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
			const compare = (0, react.useSyncExternalStore)((fn) => comparison.subscribe(fn), () => comparison.getSnapshot());
			const id = (0, react.useId)();
			const choices = (0, react.useMemo)(() => choicesOf(models), [models]);
			const selectedKeys = (0, react.useMemo)(() => new Set(compare.selected.map(choiceKey)), [compare.selected]);
			const busy = locked || models.status === "selecting" || compare.submitting;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: _dsh_css_ComparisonMenuExtension_module_css_default.root,
				"aria-label": t("compare.title"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					role: "switch",
					"aria-checked": compare.enabled,
					className: _dsh_css_ComparisonMenuExtension_module_css_default.compareSwitch,
					disabled: busy,
					onClick: () => {
						setEnabled(!compare.enabled);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: _dsh_css_ComparisonMenuExtension_module_css_default.switchCopy,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: _dsh_css_ComparisonMenuExtension_module_css_default.switchTitle,
							children: t("compare.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: _dsh_css_ComparisonMenuExtension_module_css_default.switchDescription,
							children: t("compare.description")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: clsx(_dsh_css_ComparisonMenuExtension_module_css_default.switchTrack, compare.enabled && _dsh_css_ComparisonMenuExtension_module_css_default.switchTrackOn),
						"aria-hidden": true,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_css_ComparisonMenuExtension_module_css_default.switchThumb })
					})]
				}), compare.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_css_ComparisonMenuExtension_module_css_default.compareSummary,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("compare.selected", {
							count: compare.selected.length,
							max: maxModels
						}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: compare.selected.length < 2 ? _dsh_css_ComparisonMenuExtension_module_css_default.summaryWarning : _dsh_css_ComparisonMenuExtension_module_css_default.summaryHint,
							children: compare.selected.length < 2 ? t("compare.minimum") : compare.selected.length >= maxModels ? t("compare.maximum", { max: maxModels }) : ""
						})]
					}),
					models.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_css_ComparisonMenuExtension_module_css_default.status,
						children: t("status.loading")
					}),
					compare.submitting && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_css_ComparisonMenuExtension_module_css_default.status,
						children: t("status.submitting")
					}),
					models.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_css_ComparisonMenuExtension_module_css_default.error,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.load", { message: models.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_css_ComparisonMenuExtension_module_css_default.retry,
							onClick: load,
							children: t("action.retry")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: clsx(_dsh_css_ComparisonMenuExtension_module_css_default.groups, "scrollable"),
						children: models.groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: _dsh_css_ComparisonMenuExtension_module_css_default.group,
							role: "group",
							"aria-labelledby": `${id}-${group.id}`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: _dsh_css_ComparisonMenuExtension_module_css_default.groupTitle,
								id: `${id}-${group.id}`,
								children: group.name
							}), group.models.map((model) => {
								const choice = choices.find((candidate) => candidate.provider === group.id && candidate.model === model.id);
								if (choice === void 0) return null;
								const checked = selectedKeys.has(choiceKey(choice));
								const atLimit = !checked && compare.selected.length >= maxModels;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									role: "checkbox",
									"aria-checked": checked,
									className: clsx(_dsh_css_ComparisonMenuExtension_module_css_default.option, checked && _dsh_css_ComparisonMenuExtension_module_css_default.selected),
									disabled: busy || atLimit,
									onClick: () => {
										toggleChoice(choice);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: _dsh_css_ComparisonMenuExtension_module_css_default.optionCopy,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_css_ComparisonMenuExtension_module_css_default.modelName,
											children: model.name
										}), model.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_css_ComparisonMenuExtension_module_css_default.description,
											children: model.description
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: _dsh_css_ComparisonMenuExtension_module_css_default.check,
										children: checked ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : null
									})]
								}, model.id);
							})]
						}, group.id))
					}),
					models.status === "ready" && choices.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_css_ComparisonMenuExtension_module_css_default.status,
						children: t("empty.models")
					})
				] })]
			});
		}
		//#endregion
		//#region \0dsh-css:ModelSelect.module.css.mjs
		const css = ".KcIUkG_root{min-width:0;position:relative}.KcIUkG_trigger{min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}.KcIUkG_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.KcIUkG_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.KcIUkG_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.KcIUkG_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.KcIUkG_triggerEffort{color:var(--dsw-alias-label-caption);flex:none}.KcIUkG_chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}.KcIUkG_chevronOpen{transform:rotate(180deg)}.KcIUkG_menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:min(240px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}.KcIUkG_status,.KcIUkG_empty{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}.KcIUkG_error,.KcIUkG_warning{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}.KcIUkG_warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}.KcIUkG_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}.KcIUkG_groups{min-height:0;overflow-y:auto}.KcIUkG_group+.KcIUkG_group{margin-top:4px}.KcIUkG_groupTitle{z-index:1;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);padding:5px 8px 3px;font-size:12px;font-weight:500;line-height:18px;position:sticky;top:0}.KcIUkG_option{width:100%;min-height:38px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:10px;outline:none;align-items:center;gap:8px;padding:6px 8px;display:flex}.KcIUkG_option:hover:not(:disabled),.KcIUkG_option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.KcIUkG_selected{background:0 0}.KcIUkG_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.KcIUkG_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}.KcIUkG_modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:20px;overflow:hidden}.KcIUkG_description{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;overflow:hidden}.KcIUkG_check{color:var(--dsw-alias-label-primary);flex:0 0 18px;place-items:center;display:grid}.KcIUkG_cell{width:100%;height:40px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:10px;align-items:center;gap:8px;padding:0 10px;font-size:14px;line-height:22px;display:flex}.KcIUkG_cell:hover{background:var(--dsw-alias-interactive-bg-hover)}.KcIUkG_cellLabel{text-overflow:ellipsis;white-space:nowrap;flex:auto;min-width:0;overflow:hidden}.KcIUkG_cellValue{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:0 auto;overflow:hidden}.KcIUkG_cellChevron{color:var(--dsw-alias-label-tertiary);flex:none}";
		const tagId = "dsh-dual-model-eval/ModelSelect.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-dual-model-eval";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var _dsh_css_ModelSelect_module_css_default = {
			"groups": "KcIUkG_groups",
			"option": "KcIUkG_option",
			"optionCopy": "KcIUkG_optionCopy",
			"root": "KcIUkG_root",
			"trigger": "KcIUkG_trigger",
			"check": "KcIUkG_check",
			"selected": "KcIUkG_selected",
			"warning": "KcIUkG_warning",
			"cell": "KcIUkG_cell",
			"cellLabel": "KcIUkG_cellLabel",
			"triggerEffort": "KcIUkG_triggerEffort",
			"cellValue": "KcIUkG_cellValue",
			"error": "KcIUkG_error",
			"chevronOpen": "KcIUkG_chevronOpen",
			"menu": "KcIUkG_menu",
			"description": "KcIUkG_description",
			"chevron": "KcIUkG_chevron",
			"triggerLabel": "KcIUkG_triggerLabel",
			"modelName": "KcIUkG_modelName",
			"retry": "KcIUkG_retry",
			"group": "KcIUkG_group",
			"status": "KcIUkG_status",
			"empty": "KcIUkG_empty",
			"cellChevron": "KcIUkG_cellChevron",
			"groupTitle": "KcIUkG_groupTitle"
		};
		//#endregion
		//#region src/client/ModelSelect.tsx
		/**
		* ModelSelect: the composer's named model seat (`conversation.input.model`).
		* Two-level selection per figma 496:26454's MenuDropdown: the root menu is
		* the Model / Effort row pair (label + current value + a right chevron),
		* each drilling into its own list — the provider-grouped model list over
		* the shared directory, and the effort levels. The trigger (313:14108's
		* ToggleButton) shows both: model name + effort in the caption tone.
		* Data and submission ride the SAME per-session ModelDirectory as the
		* /model popup; exact-model reasoning metadata and the selected effort come
		* from the Host rather than a client-owned vocabulary. A rejected selection
		* announces through the shared transient Toast anchored to the composer
		* card; the in-menu strip with Retry remains the catalog-load surface.
		*/
		/**
		* Render the composer model seat.
		* @param props - owner share (locked) + injected face (shared directory
		* store/verbs) + the standard locale seat.
		* @returns the trigger and, while open, the two-level menu.
		*/
		function ModelSelect({ locked, available, directory, load, select, t, maxModels, comparison, setEnabled, toggleChoice, dualT }) {
			const state = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const lastActionRef = (0, react.useRef)("load");
			const [toast, setToast] = (0, react.useState)(null);
			const toastSeq = (0, react.useRef)(0);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const itemRefs = (0, react.useRef)([]);
			const id = (0, react.useId)();
			const choices = (0, react.useMemo)(() => state.groups.flatMap((group) => group.models.map((model) => ({
				group,
				model,
				selection: {
					provider: group.id,
					model: model.id,
					...model.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort }
				}
			}))), [state.groups]);
			const currentChoice = choices[state.current === null ? -1 : choices.findIndex((c) => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)];
			const reasoning = currentChoice?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("effort.providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => reasoning === void 0 ? [] : [...reasoning.defaultEffort === void 0 ? [{
				key: "provider-default",
				effort: void 0,
				label: t("effort.providerDefault")
			}] : [], ...reasoning.efforts.map((effort) => ({
				key: `effort:${effort.id}`,
				effort: effort.id,
				label: effort.name,
				...effort.description === void 0 ? {} : { description: effort.description }
			}))], [reasoning, t]);
			const busy = state.status === "selecting";
			const reload = () => {
				lastActionRef.current = "load";
				load();
			};
			(0, react.useEffect)(() => {
				if (available) {
					lastActionRef.current = "load";
					load();
				}
			}, [available, load]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			if (!available) return null;
			const show = () => {
				setPane("root");
				setOpen(true);
				reload();
			};
			const close = (restoreFocus = false) => {
				setOpen(false);
				setPane("root");
				if (restoreFocus) queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			const moveFocus = (offset) => {
				const items = itemRefs.current.filter((item) => item !== null);
				if (items.length === 0) return;
				const active = items.findIndex((item) => item === document.activeElement);
				items[(Math.max(active, 0) + offset + items.length) % items.length]?.focus();
			};
			const onRootKeyDown = (event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane !== "root") setPane("root");
					else close(true);
					return;
				}
				if (!open) return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					moveFocus(event.key === "ArrowDown" ? 1 : -1);
				}
			};
			const onBlur = (event) => {
				if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
				close();
			};
			const settleSelection = (accepted) => {
				if (accepted) {
					if (rootRef.current !== null) close(true);
					return;
				}
				const message = directory.getSnapshot().error;
				if (message !== null) {
					toastSeq.current += 1;
					setToast({
						seq: toastSeq.current,
						text: t("error.action", { message })
					});
				}
			};
			const choose = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					close(true);
					return;
				}
				lastActionRef.current = "select";
				select(selection).then(settleSelection);
			};
			const chooseEffort = (effort) => {
				if (state.current === null) return;
				if (effectiveEffort === effort) {
					close(true);
					return;
				}
				const selection = {
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				};
				lastActionRef.current = "select";
				select(selection).then(settleSelection);
			};
			const modelLabel = currentChoice?.model.name ?? t("trigger.fallback");
			const triggerLabel = effortLabel === void 0 ? modelLabel : `${modelLabel} · ${effortLabel}`;
			const triggerAria = currentChoice === void 0 ? t("trigger.selectAria") : effortLabel === void 0 ? t("trigger.aria", { model: modelLabel }) : t("trigger.ariaEffort", {
				model: modelLabel,
				effort: effortLabel
			});
			itemRefs.current = [];
			let itemIndex = 0;
			const itemRef = () => {
				const at = itemIndex++;
				return (node) => {
					itemRefs.current[at] = node;
				};
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: _dsh_css_ModelSelect_module_css_default.root,
				onKeyDown: onRootKeyDown,
				onBlur,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						ref: triggerRef,
						type: "button",
						className: _dsh_css_ModelSelect_module_css_default.trigger,
						"aria-label": triggerAria,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-controls": open ? `${id}-menu` : void 0,
						title: triggerLabel,
						disabled: locked,
						onClick: () => {
							if (open) close();
							else show();
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: _dsh_css_ModelSelect_module_css_default.triggerLabel,
								children: modelLabel
							}),
							effortLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: _dsh_css_ModelSelect_module_css_default.triggerEffort,
								children: effortLabel
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: clsx(_dsh_css_ModelSelect_module_css_default.chevron, open && _dsh_css_ModelSelect_module_css_default.chevronOpen) })
						]
					}),
					open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						id: `${id}-menu`,
						className: _dsh_css_ModelSelect_module_css_default.menu,
						role: "menu",
						"aria-label": t("menu.aria"),
						"aria-busy": state.status === "loading" || busy,
						children: [
							pane === "root" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									ref: itemRef(),
									type: "button",
									role: "menuitem",
									className: _dsh_css_ModelSelect_module_css_default.cell,
									onClick: () => {
										setPane("model");
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_css_ModelSelect_module_css_default.cellLabel,
											children: t("menu.model")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_css_ModelSelect_module_css_default.cellValue,
											children: modelLabel
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { className: _dsh_css_ModelSelect_module_css_default.cellChevron })
									]
								}),
								reasoning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									ref: itemRef(),
									type: "button",
									role: "menuitem",
									className: _dsh_css_ModelSelect_module_css_default.cell,
									onClick: () => {
										setPane("effort");
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_css_ModelSelect_module_css_default.cellLabel,
											children: t("menu.effort")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_css_ModelSelect_module_css_default.cellValue,
											children: effortLabel
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { className: _dsh_css_ModelSelect_module_css_default.cellChevron })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComparisonMenuExtension, {
									locked,
									maxModels,
									directory,
									comparison,
									load,
									setEnabled,
									toggleChoice,
									t: dualT
								})
							] }),
							pane === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								state.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: _dsh_css_ModelSelect_module_css_default.status,
									children: t("status.loading")
								}),
								state.error !== null && lastActionRef.current === "load" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: _dsh_css_ModelSelect_module_css_default.error,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: _dsh_css_ModelSelect_module_css_default.retry,
										onClick: reload,
										children: t("retry")
									})]
								}),
								state.failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: _dsh_css_ModelSelect_module_css_default.warning,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("warning.groupLoad", {
										name: failure.name,
										message: failure.message
									}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: _dsh_css_ModelSelect_module_css_default.retry,
										onClick: reload,
										children: t("retry")
									})]
								}, failure.id)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: clsx(_dsh_css_ModelSelect_module_css_default.groups, "scrollable"),
									children: state.groups.map((group) => {
										const headingId = `${id}-${group.id}`;
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
											role: "group",
											"aria-labelledby": headingId,
											className: _dsh_css_ModelSelect_module_css_default.group,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: _dsh_css_ModelSelect_module_css_default.groupTitle,
												id: headingId,
												children: group.name
											}), group.models.map((model) => {
												const selected = state.current?.provider === group.id && state.current.model === model.id;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
													ref: itemRef(),
													type: "button",
													role: "menuitemradio",
													"aria-checked": selected,
													className: clsx(_dsh_css_ModelSelect_module_css_default.option, selected && _dsh_css_ModelSelect_module_css_default.selected),
													title: model.name,
													disabled: busy,
													onClick: () => {
														choose({
															provider: group.id,
															model: model.id
														});
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: _dsh_css_ModelSelect_module_css_default.optionCopy,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: _dsh_css_ModelSelect_module_css_default.modelName,
															children: model.name
														}), model.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: _dsh_css_ModelSelect_module_css_default.description,
															children: model.description
														})]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: _dsh_css_ModelSelect_module_css_default.check,
														children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : null
													})]
												}, model.id);
											})]
										}, group.id);
									})
								}),
								state.status === "ready" && choices.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: _dsh_css_ModelSelect_module_css_default.empty,
									children: t("empty.models")
								})
							] }),
							pane === "effort" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [state.error !== null && lastActionRef.current === "load" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: _dsh_css_ModelSelect_module_css_default.error,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: _dsh_css_ModelSelect_module_css_default.retry,
									onClick: reload,
									children: t("action.reload")
								})]
							}), effortChoices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: _dsh_css_ModelSelect_module_css_default.empty,
								children: t("empty.efforts")
							}) : effortChoices.map((level) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								ref: itemRef(),
								type: "button",
								role: "menuitemradio",
								"aria-checked": effectiveEffort === level.effort,
								className: clsx(_dsh_css_ModelSelect_module_css_default.option, effectiveEffort === level.effort && _dsh_css_ModelSelect_module_css_default.selected),
								disabled: busy,
								onClick: () => {
									chooseEffort(level.effort);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: _dsh_css_ModelSelect_module_css_default.optionCopy,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: _dsh_css_ModelSelect_module_css_default.modelName,
										children: level.label
									}), level.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: _dsh_css_ModelSelect_module_css_default.description,
										children: level.description
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: _dsh_css_ModelSelect_module_css_default.check,
									children: effectiveEffort === level.effort ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : null
								})]
							}, level.key))] })
						]
					}),
					toast !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
						text: toast.text,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {}),
						anchor: rootRef.current?.closest("[data-composer-card]") ?? null,
						onDone: () => {
							setToast(null);
						}
					}, toast.seq)
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const MAX_MODELS = 4;
		const RUNNING_BLOCK_OWNER = "dsh-dual-model-eval-running";
		function encodeRequest(value) {
			const bytes = new TextEncoder().encode(JSON.stringify(value));
			let binary = "";
			for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
			return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
		}
		function transportError(error) {
			return error instanceof Error ? error.message : String(error);
		}
		const FILES_ENDPOINT = "/dual-model-eval-files";
		async function postJson(path, value) {
			const response = await fetch(`${FILES_ENDPOINT}/${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(value)
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${String(response.status)}`);
			return payload;
		}
		async function downloadCandidate(value) {
			const download = await postJson("prepare", value);
			const anchor = document.createElement("a");
			anchor.href = download.url;
			anchor.download = download.filename;
			anchor.hidden = true;
			document.body.append(anchor);
			anchor.click();
			anchor.remove();
		}
		function HiddenCommandRow(_props) {
			return null;
		}
		/** Backport independently owned composer blocks when the installed Harness has only the legacy setter. */
		function ownedBlocks(blocks) {
			if (typeof blocks.setFor === "function") return {
				setFor: blocks.setFor.bind(blocks),
				dispose: () => {}
			};
			const original = blocks.set;
			const bySession = /* @__PURE__ */ new Map();
			const setFor = (sessionId, owner, block) => {
				let owners = bySession.get(sessionId);
				if (owners === void 0) {
					owners = /* @__PURE__ */ new Map();
					bySession.set(sessionId, owners);
				}
				if (block === void 0) owners.delete(owner);
				else owners.set(owner, block);
				if (owners.size === 0) bySession.delete(sessionId);
				original.call(blocks, sessionId, [...owners.values()].at(-1));
			};
			blocks.set = (sessionId, block) => {
				setFor(sessionId, "legacy", block);
			};
			return {
				setFor,
				dispose: () => {
					blocks.set = original;
					bySession.clear();
				}
			};
		}
		function markEngaged(session) {
			session.handleBlank?.(false);
		}
		/** Wrap the public per-session input facade so comparison mode owns ordinary composer submit. */
		function installSubmissionCompatibility(ctx, sessions, comparison, blocks, t) {
			const conversation = ctx.conversation;
			const restores = /* @__PURE__ */ new Map();
			const attach = (sessionId) => {
				if (restores.has(sessionId)) return;
				const binding = sessions.binding(sessionId);
				if (binding === void 0) return;
				const input = conversation.input.for(binding.ctx);
				const original = input.submit;
				const wasOwn = Object.hasOwn(input, "submit");
				input.submit = function submitComparison(mode) {
					const selected = comparison.storeFor(sessionId).getSnapshot();
					if (!selected.enabled) {
						original.call(input, mode);
						return;
					}
					if (selected.submitting) {
						input.notify("error", t("submit.busy"));
						return;
					}
					if (requiresComparisonAdoption(binding.session.getSnapshot().chat)) {
						blocks.setFor(sessionId, "dsh-dual-model-eval-adoption", { reason: t("submit.adoptRequired") });
						input.notify("error", t("submit.adoptRequired"));
						return;
					}
					const snapshot = input.state.getSnapshot();
					if (snapshot.draft.trim() === "" && snapshot.imageIds.length === 0) return;
					if (snapshot.imageIds.length > 0) {
						input.notify("error", t("submit.images"));
						return;
					}
					if (selected.selected.length < 2) {
						input.notify("error", t("submit.minimum"));
						return;
					}
					if (selected.selected.length > MAX_MODELS) {
						input.notify("error", t("submit.maximum"));
						return;
					}
					const text = snapshot.draft;
					const models = selected.selected.map((choice, index) => ({
						index,
						...choice
					}));
					const line = `/compare-models ${encodeRequest({
						version: 1,
						runId: crypto.randomUUID(),
						task: text,
						models
					})}`;
					markEngaged(binding.session);
					comparison.setSubmitting(sessionId, true);
					blocks.setFor(sessionId, RUNNING_BLOCK_OWNER, { reason: t("submit.busy") });
					input.setDraft("");
					ctx.remote.commands.execute(sessionId, line).then((result) => {
						if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
						if (result.value === void 0) throw new Error("compare-models command is unavailable");
						if (result.value.result.kind === "error") throw new Error(result.value.result.text);
					}).catch((error) => {
						if (input.state.getSnapshot().draft === "") input.setDraft(text);
						input.notify("error", t("submit.transport", { message: transportError(error) }));
					}).finally(() => {
						comparison.setSubmitting(sessionId, false);
						blocks.setFor(sessionId, RUNNING_BLOCK_OWNER, void 0);
					});
				};
				restores.set(sessionId, () => {
					if (wasOwn) input.submit = original;
					else delete input.submit;
				});
			};
			const reconcile = () => {
				const ids = new Set(sessions.list.getSnapshot().ids);
				for (const sessionId of ids) attach(sessionId);
				for (const [sessionId, restore] of restores) {
					if (ids.has(sessionId)) continue;
					restore();
					restores.delete(sessionId);
				}
			};
			reconcile();
			const stop = sessions.list.subscribe(reconcile);
			return () => {
				stop();
				for (const restore of restores.values()) restore();
				restores.clear();
			};
		}
		const inject = [
			"slots",
			"locale",
			"sessions",
			"remote",
			"remote.commands",
			"conversation",
			"conversationEvents",
			"modelDirectories"
		];
		/** Mount the comparison UI, compatibility seams, and durable result cards. */
		function apply(ctx) {
			const comparison = new ComparisonSelectionRuntime(MAX_MODELS);
			const sessions = ctx.sessions;
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-dual-model-eval: dictionaries");
			ctx.effect(() => ctx.conversationEvents.register(dualEvalRunDefinition), "dsh-dual-model-eval: event definition");
			const conversation = ctx.conversation;
			const blocks = ownedBlocks(conversation.blocks);
			ctx.effect(() => () => {
				blocks.dispose();
			}, "dsh-dual-model-eval: composer block compatibility");
			const adoptionGate = new ComparisonAdoptionGate(sessions, blocks, () => t("submit.adoptRequired"));
			ctx.effect(() => adoptionGate.start(), "dsh-dual-model-eval: adoption composer gate");
			ctx.effect(() => installSubmissionCompatibility(ctx, sessions, comparison, blocks, t), "dsh-dual-model-eval: composer submission compatibility");
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "dual-eval-run",
				locale: NS,
				inject: (sessionId) => ({
					adopt: async (runId, index) => {
						const line = `/compare-models-adopt ${encodeRequest({
							version: 1,
							runId,
							index
						})}`;
						const result = await ctx.remote.commands.execute(sessionId, line);
						if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
						if (result.value === void 0) throw new Error("compare-models-adopt command is unavailable");
						if (result.value.result.kind === "error") throw new Error(result.value.result.text);
					},
					previewFile: (request) => postJson("preview", request),
					downloadFile: (request) => downloadCandidate({
						...request,
						kind: "file"
					}),
					downloadWorkspace: (request) => downloadCandidate({
						...request,
						kind: "workspace"
					})
				})
			}, ComparisonRunNode));
			ctx.slots.inject("conversation.chat.commandview", function* hideComparisonCommands() {
				yield ctx.slots.register({
					name: "conversation.chat.commandview",
					key: "compare-models"
				}, HiddenCommandRow);
				yield ctx.slots.register({
					name: "conversation.chat.commandview",
					key: "compare-models-adopt"
				}, HiddenCommandRow);
			});
			ctx.inject(["slots", "modelDirectories"], (scope) => {
				const modelT = scope.locale.bind("model");
				const dualT = scope.locale.bind(NS);
				const models = scope.modelDirectories;
				const scopedSessions = scope.sessions;
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						const available = scopedSessions.subagentAddress(sessionId) === void 0;
						return {
							available,
							directory: directory.store,
							comparison: comparison.storeFor(sessionId),
							maxModels: MAX_MODELS,
							load: () => {
								if (available) directory.load().catch(() => {});
							},
							select: (selection) => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
							setEnabled: (enabled) => {
								comparison.setEnabled(sessionId, enabled, directory.store.getSnapshot());
							},
							toggleChoice: (choice) => {
								comparison.toggleChoice(sessionId, choice);
							},
							t: modelT,
							dualT
						};
					}
				}, ModelSelect));
			});
		}
		//#endregion
		exports.ComparisonAdoptionGate = ComparisonAdoptionGate;
		exports.ComparisonSelectionRuntime = ComparisonSelectionRuntime;
		exports.apply = apply;
		exports.choicesOf = choicesOf;
		exports.dualEvalRunDefinition = dualEvalRunDefinition;
		exports.inject = inject;
		exports.requiresComparisonAdoption = requiresComparisonAdoption;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map