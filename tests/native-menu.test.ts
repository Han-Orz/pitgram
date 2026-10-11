import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const testHome = await mkdtemp(join(os.tmpdir(), "pitgram-native-menu-"));
const originalHomedir = os.homedir;
os.homedir = () => testHome;
syncBuiltinESMExports();
const { default: pitgram } = await import("../dist/index.js");
await mkdir(join(testHome, ".pi", "agent"), { recursive: true });
await writeFile(join(testHome, ".pi", "agent", "telegram.json"), JSON.stringify({
	botToken: "TEST_TOKEN", botId: 17, allowedUserId: 42, lastUpdateId: 0,
}));
const modelNames = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
await writeFile(join(testHome, ".pi", "agent", "models.json"), JSON.stringify({
	providers: { fixture: { models: modelNames.map(id => ({ id })) } },
}));

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(predicate: () => boolean | Promise<boolean>) {
	for (let i = 0; i < 400; i++) {
		if (await predicate()) return;
		await pause(5);
	}
	assert.fail("Timed out waiting for native menu flow");
}

test("direct /model and /thinking menus change Pi settings without submitting prompts", async () => {
	const originalFetch = globalThis.fetch;
	const handlers = new Map<string, any>();
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const sentPrompts: unknown[] = [];
	const calls: Array<{ method: string; body: any }> = [];
	const models = modelNames.map(id => ({ provider: "fixture", id, reasoning: true,
		...(id === "ten" ? { thinkingLevelMap: { low: null, max: null } } : {}) }));
	const modelOne = models[0];
	const modelTwo = models[1];
	let activeModel: any = modelOne;
	let thinking = "medium";
	let idle = true;
	let setModelResult = true;
	let modelSetCalls = 0;
	let updateId = 1;
	let messageId = 500;
	let incoming: any[] = [{ update_id: updateId, message: {
		message_id: 100, date: 1700000000, chat: { id: 42, type: "private" },
		from: { id: 42, is_bot: false, first_name: "Fixture" }, text: "/model",
	} }];
	let wakePoll: (() => void) | undefined;
	const enqueue = (update: any) => {
		incoming.push(update);
		const wake = wakePoll;
		wakePoll = undefined;
		wake?.();
	};
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		const method = url.split("/").pop()!;
		const body = init?.body ? JSON.parse(String(init.body)) : {};
		calls.push({ method, body });
		let result: any = true;
		if (method === "getUpdates") {
			if (incoming.length) result = incoming.splice(0);
			else result = await new Promise(resolve => {
				const onAbort = () => resolve([]);
				wakePoll = () => {
					init?.signal?.removeEventListener("abort", onAbort);
					resolve(incoming.splice(0));
				};
				init?.signal?.addEventListener("abort", onAbort, { once: true });
			});
		} else if (method === "sendMessage") result = { message_id: ++messageId };
		else if (!["deleteWebhook", "answerCallbackQuery", "editMessageText", "sendChatAction"].includes(method)) {
			throw new Error(`Unexpected Telegram API method ${method}`);
		}
		return { ok: true, json: async () => ({ ok: true, result }) } as Response;
	}) as typeof fetch;

	const ctx: any = {
		mode: "tui", cwd: process.cwd(), isIdle: () => idle, abort() {},
		get model() { return activeModel; },
		modelRegistry: {
			getAll: () => models, getAvailable: () => models,
			find: (provider: string, id: string) => models.find(m => m.provider === provider && m.id === id),
			isUsingOAuth: () => false,
		},
		ui: { setStatus() {}, notify() {}, theme: { fg: (_name: string, text: string) => text } },
	};
	pitgram({
		on: (name: string, handler: any) => handlers.set(name, handler),
		registerTool: (tool: any) => tools.set(tool.name, tool),
		registerCommand: (name: string, command: any) => commands.set(name, command),
		sendUserMessage: (content: any) => sentPrompts.push(content),
		setModel: async (model: any) => { modelSetCalls++; if (!setModelResult) return false; activeModel = model; return true; },
		getThinkingLevel: () => thinking,
		setThinkingLevel: (level: string) => { thinking = level; },
	} as any);

	try {
		await handlers.get("session_start")({}, ctx);
		await eventually(() => calls.some(call => call.method === "editMessageText"));
		const findButton = (label: string, expectedMessageId?: number) => {
			const latest = [...calls].reverse().find(call => call.method === "editMessageText" && call.body.reply_markup?.inline_keyboard
				&& (expectedMessageId === undefined || call.body.message_id === expectedMessageId));
			assert.ok(latest, "menu keyboard should be present");
			const buttons = latest.body.reply_markup.inline_keyboard.flat();
			const button = buttons.find((item: any) => item.text.includes(label));
			assert.ok(button, `button ${label} should be present`);
			return { button, menuMessageId: latest.body.message_id };
		};
		const click = (button: any, menuMessageId: number, fromId = 42, senderBotId = 17) => {
			updateId++;
			enqueue({ update_id: updateId, callback_query: {
				id: `native-${updateId}`, from: { id: fromId, is_bot: false, first_name: "Fixture" },
				message: { message_id: menuMessageId, date: 1700000001, chat: { id: 42, type: "private" }, from: { id: senderBotId, is_bot: true, first_name: "Bot" } },
				data: button.callback_data,
			} });
		};

		let selected = findButton("fixture/two");
		const modelMenuMessageId = selected.menuMessageId;
		click(selected.button, selected.menuMessageId);
		await eventually(() => activeModel === modelTwo && calls.some(call => call.method === "answerCallbackQuery" && call.body.text?.startsWith("Model:")));
		assert.equal(sentPrompts.length, 0, "control callbacks never submit a prompt");

		selected = findButton("fixture/one");
		const setsBeforeReject = modelSetCalls;
		click(selected.button, selected.menuMessageId, 999);
		await eventually(() => calls.some(call => call.method === "answerCallbackQuery" && call.body.callback_query_id === `native-${updateId}`));
		assert.equal(modelSetCalls, setsBeforeReject, "unpaired callback user cannot change the model");
		selected = findButton("fixture/one", modelMenuMessageId);
		click(selected.button, selected.menuMessageId, 42, 18);
		await eventually(() => calls.some(call => call.method === "answerCallbackQuery" && call.body.callback_query_id === `native-${updateId}`));
		assert.equal(modelSetCalls, setsBeforeReject, "a callback from another bot is rejected");

		selected = findButton("›", modelMenuMessageId);
		click(selected.button, selected.menuMessageId);
		await eventually(() => calls.some(call => call.method === "editMessageText" && call.body.message_id === modelMenuMessageId && call.body.text === "Select model (2/2)"));
		selected = findButton("fixture/nine", modelMenuMessageId);
		const previousModelMenuEdits = calls.filter(call => call.method === "editMessageText" && call.body.message_id === modelMenuMessageId).length;
		idle = false;
		click(selected.button, selected.menuMessageId);
		await eventually(() => calls.some(call => call.method === "answerCallbackQuery" && call.body.callback_query_id === `native-${updateId}` && call.body.text?.includes("busy")));
		assert.equal(activeModel, modelTwo, "busy Pi leaves its model unchanged");
		await eventually(() => calls.filter(call => call.method === "editMessageText" && call.body.message_id === modelMenuMessageId).length > previousModelMenuEdits);
		idle = true;
		selected = findButton("fixture/ten", modelMenuMessageId);
		click(selected.button, selected.menuMessageId);
		await eventually(() => activeModel === models[9] && calls.some(call => call.method === "answerCallbackQuery" && call.body.text === "Model: fixture/ten"));

		updateId++;
		enqueue({ update_id: updateId, message: {
			message_id: 101, date: 1700000002, chat: { id: 42, type: "private" },
			from: { id: 42, is_bot: false, first_name: "Fixture" }, text: "/thinking",
		} });
		await eventually(() => calls.some(call => call.method === "editMessageText" && call.body.text?.includes("Select thinking level")));
		assert.ok(findButton("✓ medium").button, "the active thinking level is marked");
		assert.throws(() => findButton("low"), /button low should be present/, "unsupported model tiers are omitted");
		selected = findButton("high");
		click(selected.button, selected.menuMessageId);
		await eventually(() => thinking === "high" && calls.some(call => call.method === "answerCallbackQuery" && call.body.text === "Thinking: high"));
		assert.equal(sentPrompts.length, 0);

		selected = findButton("‹", modelMenuMessageId);
		const beforePreviousPage = calls.filter(call => call.method === "editMessageText" && call.body.message_id === modelMenuMessageId).length;
		click(selected.button, selected.menuMessageId);
		await eventually(() => calls.filter(call => call.method === "editMessageText" && call.body.message_id === modelMenuMessageId).length > beforePreviousPage
			&& [...calls].reverse().find(call => call.method === "editMessageText" && call.body.message_id === modelMenuMessageId)?.body.text === "Select model (1/2)");
		selected = findButton("fixture/one", modelMenuMessageId);
		setModelResult = false;
		click(selected.button, selected.menuMessageId);
		await eventually(() => calls.some(call => call.method === "answerCallbackQuery" && /switch was rejected/.test(call.body.text ?? "")));
		assert.equal(activeModel, models[9], "failed model switches leave the active model unchanged");
	} finally {
		await handlers.get("session_shutdown")({}, ctx);
		globalThis.fetch = originalFetch;
		os.homedir = originalHomedir;
		syncBuiltinESMExports();
		await rm(testHome, { recursive: true, force: true });
	}
});
