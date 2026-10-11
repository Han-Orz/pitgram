type TelegramChunk = {
    html: string;
    text: string;
};
/** Split renderer-produced Telegram HTML without cutting entities or leaving tags unbalanced. */
export declare function chunkTelegramHtml(html: string, maxLength?: number): TelegramChunk[];
/** Convert Markdown into Telegram's supported HTML subset and split it safely. */
export declare function renderTelegramMarkdown(markdown: string, maxLength?: number): TelegramChunk[];
export {};
