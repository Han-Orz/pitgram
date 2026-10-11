import { randomUUID } from "node:crypto";

export const NATIVE_CONTROL_TTL_MS = 10 * 60 * 1000;

export type NativeModelMenuScope = "scoped" | "all";

export type NativeControlAction =
	| { kind: "model"; provider: string; modelId: string; page: number; scope: NativeModelMenuScope }
	| { kind: "thinking"; level: string }
	| { kind: "model-page"; page: number; scope: NativeModelMenuScope }
	| { kind: "model-scope"; scope: NativeModelMenuScope };

interface NativeControlGrant {
	action: NativeControlAction;
	botId: number;
	userId: number;
	chatId: number;
	messageId: number;
	originCwd: string;
	expiresAt: number;
}

export interface NativeControlBinding {
	botId: number;
	userId: number;
	chatId: number;
	messageId: number;
	originCwd: string;
}

/** In-memory, single-use opaque references. A restart invalidates every menu. */
export class NativeControlRegistry {
	private readonly grants = new Map<string, NativeControlGrant>();

	issue(action: NativeControlAction, binding: NativeControlBinding, now = Date.now()): string {
		this.prune(now);
		if (this.grants.size >= 4096) throw new Error("Too many active native control references");
		const token = randomUUID().replaceAll("-", "");
		this.grants.set(token, { action: structuredClone(action), ...binding, expiresAt: now + NATIVE_CONTROL_TTL_MS });
		return `pc:${token}`;
	}

	invalidateMessage(binding: NativeControlBinding): void {
		for (const [token, grant] of this.grants) {
			if (grant.botId === binding.botId && grant.userId === binding.userId
				&& grant.chatId === binding.chatId && grant.messageId === binding.messageId) this.grants.delete(token);
		}
	}

	consume(reference: string, binding: NativeControlBinding, now = Date.now()): NativeControlAction | undefined {
		const match = /^pc:([a-f0-9]{32})$/.exec(reference);
		if (!match) return undefined;
		const grant = this.grants.get(match[1]);
		this.grants.delete(match[1]);
		if (!grant || grant.expiresAt <= now
			|| grant.botId !== binding.botId || grant.userId !== binding.userId
			|| grant.chatId !== binding.chatId || grant.messageId !== binding.messageId
			|| grant.originCwd !== binding.originCwd) return undefined;
		return structuredClone(grant.action);
	}

	private prune(now: number): void {
		for (const [token, grant] of this.grants) if (grant.expiresAt <= now) this.grants.delete(token);
	}
}
