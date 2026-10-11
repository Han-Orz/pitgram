export declare const NATIVE_CONTROL_TTL_MS: number;
export type NativeModelMenuScope = "scoped" | "all";
export type NativeControlAction = {
    kind: "model";
    provider: string;
    modelId: string;
    page: number;
    scope: NativeModelMenuScope;
} | {
    kind: "thinking";
    level: string;
} | {
    kind: "model-page";
    page: number;
    scope: NativeModelMenuScope;
} | {
    kind: "model-scope";
    scope: NativeModelMenuScope;
};
export interface NativeControlBinding {
    botId: number;
    userId: number;
    chatId: number;
    messageId: number;
    originCwd: string;
}
/** In-memory, single-use opaque references. A restart invalidates every menu. */
export declare class NativeControlRegistry {
    private readonly grants;
    issue(action: NativeControlAction, binding: NativeControlBinding, now?: number): string;
    invalidateMessage(binding: NativeControlBinding): void;
    consume(reference: string, binding: NativeControlBinding, now?: number): NativeControlAction | undefined;
    private prune;
}
