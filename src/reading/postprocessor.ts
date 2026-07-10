import type { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { foldCase } from '../core/matcher';
import type { LinkTarget, Mention, SuggestionProvider } from '../core/types';
import { buildSuggestionBox } from '../ui/suggestionBox';

export interface ReadingHost {
	getProvider(): SuggestionProvider | null;
	isPathEnabled(path: string): boolean;
	readingViewEnabled(): boolean;
	/** Replace [from, to) in the file at `path` with a link to `target`. */
	replaceInFile(
		path: string,
		from: number,
		to: number,
		mentionText: string,
		target: LinkTarget,
	): Promise<void>;
	ignoreTerm(term: string): void;
}

/** Rendered elements that must not be underlined in reading view. */
const SKIP_SELECTOR = 'a, code, pre, .tag, .math, .internal-embed, .frontmatter, .callout-title';

/**
 * Source-text ranges a reading-view match must not map into: existing
 * links, inline code, and bare URLs. Sections never include fenced code
 * blocks or frontmatter (those render through different processors).
 */
const SOURCE_EXCLUDED = /\[\[[^\]]*\]\]|`[^`\n]*`|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g;

interface SpanMeta {
	ctx: MarkdownPostProcessorContext;
	container: HTMLElement;
	mention: Mention;
	/** Index among same-term mentions within this section, in render order. */
	occurrence: number;
}

/**
 * Underlines mentions in reading view and shows the suggestion popover on
 * hover (or click/tap). Linking maps the rendered mention back to the
 * source: the n-th rendered occurrence of a term within a section
 * corresponds to the n-th plain-text (non-link, non-code) occurrence in
 * that section's source.
 */
export function registerReadingView(plugin: Plugin, host: ReadingHost): void {
	const meta = new WeakMap<HTMLElement, SpanMeta>();

	plugin.registerMarkdownPostProcessor((el, ctx) => {
		if (!host.readingViewEnabled() || !host.isPathEnabled(ctx.sourcePath)) return;
		const provider = host.getProvider();
		if (!provider) return;

		const counts = new Map<string, number>();
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n as Text);

		for (const node of textNodes) {
			if (node.parentElement?.closest(SKIP_SELECTOR)) continue;
			const text = node.nodeValue ?? '';
			const mentions = provider.findMentions(text, ctx.sourcePath);
			if (mentions.length === 0) continue;

			const fragment = createFragment();
			let last = 0;
			for (const mention of mentions) {
				fragment.append(text.slice(last, mention.start));
				const span = createSpan({ cls: 'ils-mention', text: mention.text });
				const key = foldCase(mention.text);
				const occurrence = counts.get(key) ?? 0;
				counts.set(key, occurrence + 1);
				meta.set(span, { ctx, container: el, mention, occurrence });
				fragment.append(span);
				last = mention.end;
			}
			fragment.append(text.slice(last));
			node.replaceWith(fragment);
		}
	});

	installPopover(plugin, host, meta);
}

function installPopover(plugin: Plugin, host: ReadingHost, meta: WeakMap<HTMLElement, SpanMeta>) {
	let popover: HTMLElement | null = null;
	let anchor: HTMLElement | null = null;
	let showTimer = 0;
	let hideTimer = 0;

	const hide = () => {
		window.clearTimeout(showTimer);
		window.clearTimeout(hideTimer);
		popover?.remove();
		popover = null;
		anchor = null;
	};

	const show = (span: HTMLElement) => {
		const m = meta.get(span);
		if (!m || !host.readingViewEnabled()) return;
		hide();
		anchor = span;
		const box = buildSuggestionBox(m.mention, {
			onLink: (target) => {
				hide();
				void linkFromReading(host, m, target);
			},
			onIgnore: () => {
				hide();
				host.ignoreTerm(m.mention.text);
			},
		});
		popover = createDiv({ cls: 'ils-popover' });
		popover.append(box);
		popover.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
		popover.addEventListener('mouseleave', scheduleHide);
		document.body.append(popover);

		const r = span.getBoundingClientRect();
		const p = popover.getBoundingClientRect();
		popover.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - p.width - 4))}px`;
		popover.style.top = `${Math.max(4, r.top - p.height - 4)}px`;
	};

	const scheduleHide = () => {
		window.clearTimeout(hideTimer);
		hideTimer = window.setTimeout(hide, 250);
	};

	plugin.registerDomEvent(document, 'mouseover', (event) => {
		const span = event.target instanceof HTMLElement ? event.target : null;
		if (!span || !meta.has(span)) return;
		if (span === anchor) {
			window.clearTimeout(hideTimer);
			return;
		}
		window.clearTimeout(showTimer);
		showTimer = window.setTimeout(() => show(span), 150);
	});
	plugin.registerDomEvent(document, 'mouseout', (event) => {
		const span = event.target instanceof HTMLElement ? event.target : null;
		if (!span || !meta.has(span)) return;
		window.clearTimeout(showTimer);
		if (span === anchor) scheduleHide();
	});
	// Tap support (mobile has no hover); also a quicker path on desktop.
	plugin.registerDomEvent(document, 'click', (event) => {
		const span = event.target instanceof HTMLElement ? event.target : null;
		if (!span || !meta.has(span)) return;
		event.preventDefault();
		event.stopPropagation();
		show(span);
	});
	plugin.register(hide);
}

async function linkFromReading(host: ReadingHost, m: SpanMeta, target: LinkTarget) {
	const provider = host.getProvider();
	const info = m.ctx.getSectionInfo(m.container);
	if (!provider || !info) return;

	const lines = info.text.split('\n');
	const sectionText = lines.slice(info.lineStart, info.lineEnd + 1).join('\n');
	const sectionOffset =
		lines.slice(0, info.lineStart).join('\n').length + (info.lineStart > 0 ? 1 : 0);

	const excluded: Array<{ start: number; end: number }> = [];
	for (const match of sectionText.matchAll(SOURCE_EXCLUDED)) {
		excluded.push({ start: match.index, end: match.index + match[0].length });
	}

	const key = foldCase(m.mention.text);
	const candidates = provider
		.findMentions(sectionText, m.ctx.sourcePath)
		.filter((x) => foldCase(x.text) === key)
		.filter((x) => !excluded.some((r) => r.start < x.end && r.end > x.start));
	const hit = candidates[m.occurrence];
	if (!hit) return;

	await host.replaceInFile(
		m.ctx.sourcePath,
		sectionOffset + hit.start,
		sectionOffset + hit.end,
		m.mention.text,
		target,
	);
}
