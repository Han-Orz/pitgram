import test from "node:test";
import assert from "node:assert/strict";
import { renderTelegramMarkdown } from "../dist/telegram-markdown.js";

test("Telegram Markdown renders common formatting through its supported HTML subset", () => {
	const output = renderTelegramMarkdown([
		"# Heading",
		"",
		"A **bold** and _italic_ word with a [link](https://example.com/path?a=1&b=2).",
		"",
		"Inline `code`.",
		"",
		"```ts",
		"const value = 1 < 2;",
		"```",
		"",
		"- first item",
		"- **second** item",
		"  - nested item",
		"",
		"1. ordered one",
		"2. ordered two",
		"",
		"> quoted text",
	].join("\n")).map(chunk => chunk.html).join("");

	assert.match(output, /<b>Heading<\/b>/);
	assert.match(output, /<(?:b|strong)>bold<\/(?:b|strong)>/);
	assert.match(output, /<(?:i|em)>italic<\/(?:i|em)>/);
	assert.match(output, /<a href="https:\/\/example\.com\/path\?a=1&amp;b=2">link<\/a>/);
	assert.match(output, /<code>code<\/code>/);
	assert.match(output, /<pre><code(?: class="language-ts")?>const value = 1 &lt; 2;\s*<\/code><\/pre>/);
	assert.match(output, /• first item/);
	assert.match(output, /• <(?:b|strong)>second<\/(?:b|strong)> item/);
	assert.match(output, /  • nested item/);
	assert.match(output, /1\. ordered one/);
	assert.match(output, /2\. ordered two/);
	assert.match(output, /<blockquote>\s*quoted text\s*<\/blockquote>/);
	assert.doesNotMatch(output, /<(?:h[1-6]|ul|ol|li|p|img)\b/i);
});

test("raw HTML is escaped and unsafe Markdown links are not emitted as HTML links", () => {
	const output = renderTelegramMarkdown("<b>literal</b> [unsafe](javascript:alert(1))").map(chunk => chunk.html).join("");
	assert.match(output, /&lt;b&gt;literal&lt;\/b&gt;/);
	assert.doesNotMatch(output, /href="javascript:/i);
});

test("long formatted replies split at Telegram's limit with balanced tags and intact Unicode", () => {
	const markdown = `**${"A🙂&<".repeat(1_100)}**`;
	const chunks = renderTelegramMarkdown(markdown);
	assert.ok(chunks.length > 1);
	for (const chunk of chunks) {
		assert.ok(chunk.text.length <= 4096);
		assert.ok(!/[\uD800-\uDBFF]$/.test(chunk.text));
		assert.ok(!/^[\uDC00-\uDFFF]/.test(chunk.text));
		const stack: string[] = [];
		for (const match of chunk.html.matchAll(/<\/?([a-z]+)(?:\s[^<>]*?)?>/gi)) {
			const tag = match[1].toLowerCase();
			if (match[0].startsWith("</")) assert.equal(stack.pop(), tag);
			else stack.push(tag);
		}
		assert.deepEqual(stack, []);
	}
	assert.equal(chunks.map(chunk => chunk.text).join("").trimEnd(), `A🙂&<`.repeat(1_100));
});
