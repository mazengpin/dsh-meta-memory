window.__ModuleLoader__.load({
	id: "dsh-meta-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		// src/client/index.ts
		/**
		* Client half of `dsh-meta-memory` — the ONE sidebar entry the fusion adds.
		*
		* WHAT IT REGISTERS, AND THE TWO THINGS THAT MUST DIFFER FROM UPSTREAM
		*
		* 1. A tab TYPE through the sidebar-right registry: `{ id, kind, priority }`.
		*    The `id` is this package's own namespace and the `kind` is `meta-memory` —
		*    neither is a member's, and neither is a product kind. That is not
		*    fastidiousness: a kind may carry one `builtin` and one `extension`
		*    registration at once, the extension is the one IN FORCE, and everything
		*    else colliding on a kind throws. So a fused plugin that reused a product
		*    kind, or claimed `priority: 'builtin'`, could take that kind over and hide
		*    whatever shipped under it. This tab therefore declares
		*    `priority: 'extension'` with its own kind, and cannot shadow anything.
		*
		* 2. The keyed body for that tab, in slot `sidebar.right.pane.tab`, keyed by the
		*    definition's own `id` — the seat looks the body up under the definition id,
		*    so the two are one value declared once and referenced, not two spellings
		*    that have to be kept equal by hand.
		*
		* NO STATIC `react` IMPORT, ON PURPOSE: the browser module-loader factory hands
		* the artifact a `require` that resolves the shell's frozen module table, so
		* `require('react')` inside the component is the supported way to reach React
		* from a bundle that must not carry its own copy. It also keeps this package's
		* typecheck free of a React type dependency it does not otherwise need.
		*
		* @module dsh-meta-memory/client
		*/
		/** The loader row and browser bundle id. */
		const name = "dsh-meta-memory";
		/** The three client services this half reads. */
		const inject = ["slots", "sidebarRightTabs"];
		/** The tab definition's identity, and the keyed slot's key. ONE value, two uses. */
		const TAB_ID = "dsh-meta-memory:memory";
		/** This plugin's OWN tab kind. Never a product kind, never a member's. */
		const TAB_KIND = "meta-memory";
		/**
		* The priority band. `extension` is the band for a type from outside the product
		* and is the only band that may take over a `builtin` kind — which is exactly why
		* this plugin declares its own kind as well, so the band cannot be used to
		* shadow one.
		*/
		const TAB_PRIORITY = "extension";
		/** The route root the panel reads. Kept as one constant so it cannot drift from the host half. */
		const ROUTES = {
			/** Route prefix owned by the host half. */
			root: "/meta-memory",
			/** The census payload. */
			census: "/meta-memory/api/census",
			/** The fused status payload. */
			status: "/meta-memory/api/status"
		};
		/**
		* The tab body: a small census panel that shows the fused surface's own claim
		* and lets a reader reload it. It renders its summary imperatively into one node,
		* so the panel needs no hooks and no build-time React types.
		* @returns the panel element.
		*/
		function MemoryPane() {
			const h = require("react").createElement;
			const style = {
				font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
				padding: "12px 14px",
				whiteSpace: "pre-wrap",
				color: "inherit"
			};
			const load = (node) => {
				const el = node;
				if (el === null) return;
				el.textContent = "loading /meta-memory/api/census …";
				fetch(ROUTES.census).then((response) => response.json()).then((payload) => {
					const numerator = payload["numerator"];
					const denominator = payload["denominator"];
					const unmeasured = payload["unmeasured"];
					const censusAt = payload["censusAt"];
					const rows = Array.isArray(payload["rows"]) ? payload["rows"] : [];
					const lines = [
						"Memory — dsh-meta-memory",
						"",
						`capabilities carried: ${String(numerator)} / ${String(denominator)}`,
						`unmeasured (with reasons): ${String(unmeasured)}`,
						`census at: ${String(censusAt)}`,
						"",
						...rows.map((row) => {
							const state = row["state"] === "present" ? "PRESENT" : "UNMEASURED";
							return `${String(row["id"]).padEnd(12)} ${state.padEnd(10)} ${String(row["title"])}`;
						})
					];
					el.textContent = lines.join("\n");
				}).catch((error) => {
					el.textContent = `/meta-memory/api/census did not answer: ${error instanceof Error ? error.message : String(error)}`;
				});
			};
			return h("div", {
				style,
				"data-meta-memory-panel": "census"
			}, h("div", { ref: (node) => load(node) }, "loading /meta-memory/api/census …"), h("button", {
				type: "button",
				style: {
					marginTop: "10px",
					font: "inherit",
					padding: "2px 8px"
				},
				onClick: (event) => {
					const sibling = ((event?.currentTarget)?.parentElement)?.firstElementChild;
					load(sibling);
				}
			}, "Reload census"));
		}
		/**
		* Mount the client half.
		* @param ctx - the host client context.
		*/
		function apply(ctx) {
			ctx.sidebarRightTabs ?? (typeof ctx.get === "function" && ctx.get("sidebarRightTabs"));
			ctx.logger?.warn?.("dsh-meta-memory: the Memory tab is RETIRED — dsh-memento owns the single memory surface; /meta-memory/api/* routes are unaffected");
			ctx.logger?.info("dsh-meta-memory: sidebar tab %s registered as kind %s in band %s", TAB_ID, TAB_KIND, TAB_PRIORITY);
		}
		exports.MemoryPane = MemoryPane;
		exports.ROUTES = ROUTES;
		exports.TAB_ID = TAB_ID;
		exports.TAB_KIND = TAB_KIND;
		exports.TAB_PRIORITY = TAB_PRIORITY;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
