import test from "node:test";
import assert from "node:assert/strict";
import { NativeControlRegistry, NATIVE_CONTROL_TTL_MS } from "../dist/native-controls.js";

const binding = { botId: 17, userId: 42, chatId: 42, messageId: 501, originCwd: "/workspace/project" };

test("native control references are bound, single-use, and short-lived", () => {
	const registry = new NativeControlRegistry();
	const reference = registry.issue({ kind: "model", provider: "fixture", modelId: "m1", page: 0, scope: "all" }, binding, 1000);
	assert.match(reference, /^pc:[a-f0-9]{32}$/);
	assert.deepEqual(registry.consume(reference, binding, 1001), { kind: "model", provider: "fixture", modelId: "m1", page: 0, scope: "all" });
	assert.equal(registry.consume(reference, binding, 1002), undefined, "replay is rejected");

	for (const altered of [
		{ ...binding, botId: 18 },
		{ ...binding, userId: 43 },
		{ ...binding, chatId: 43 },
		{ ...binding, messageId: 502 },
		{ ...binding, originCwd: "/other" },
	]) {
		const reference = registry.issue({ kind: "thinking", level: "high" }, binding, 2000);
		assert.equal(registry.consume(reference, altered, 2001), undefined, "references reject mismatched actors, messages, and workspaces");
		assert.equal(registry.consume(reference, binding, 2002), undefined, "mismatched attempts consume the reference");
	}

	const expired = registry.issue({ kind: "thinking", level: "low" }, binding, 3000);
	assert.equal(registry.consume(expired, binding, 3000 + NATIVE_CONTROL_TTL_MS), undefined);
});
