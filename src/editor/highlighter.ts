import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	hoverTooltip,
	type PluginValue,
	ViewPlugin,
	type ViewUpdate,
} from '@codemirror/view';
import { editorInfoField, Platform, setIcon } from 'obsidian';
import { dedupeTargets } from '../core/matcher';
import type { LinkTarget, Mention, SuggestionProvider } from '../core/types';

/**
 * Syntax nodes whose text must never be underlined: existing links, tags,
 * code, frontmatter, math, comments, HTML — and any formatting markers.
 */
const EXCLUDED_NODE = /link|url|hashtag|code|frontmatter|math|tag|comment|escape|html|formatting/i;

export interface HighlighterHost {
	/** Current suggestion provider, or null while the index is building. */
	getProvider(): SuggestionProvider | null;
	/** Whether suggestions are enabled for this file path. */
	isPathEnabled(path: string): boolean;
	/** Wrap the mention in a link to the given target. */
	linkMention(view: EditorView, range: MentionRange, target: LinkTarget): void;
	/** Persist a term on the ignore list. */
	ignoreTerm(term: string): void;
	/** Mobile fallback: tap opens a native menu instead of the hover popup. */
	showMentionMenu(view: EditorView, range: MentionRange, event: MouseEvent): void;
}

/** A mention with absolute document positions. */
export interface MentionRange {
	from: number;
	to: number;
	mention: Mention;
}

export function createHighlighter(host: HighlighterHost): Extension {
	class MentionHighlighter implements PluginValue {
		decorations: DecorationSet;
		ranges: MentionRange[] = [];

		constructor(view: EditorView) {
			this.decorations = this.compute(view);
		}

		// Decorations deliberately do not depend on the selection: hiding the
		// underline under the cursor would destroy the clicked span between
		// mousedown and mouseup, and Chromium never fires `click` when the
		// mousedown target has left the DOM.
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) {
				this.decorations = this.compute(update.view);
			}
		}

		compute(view: EditorView): DecorationSet {
			this.ranges = [];
			const provider = host.getProvider();
			const filePath = view.state.field(editorInfoField).file?.path;
			if (!provider || filePath === undefined || !host.isPathEnabled(filePath)) {
				return Decoration.none;
			}

			const builder = new RangeSetBuilder<Decoration>();
			const mark = Decoration.mark({ class: 'ils-mention' });

			for (const { from, to } of view.visibleRanges) {
				const excluded = excludedRanges(view, from, to);
				const text = view.state.doc.sliceString(from, to);
				for (const mention of provider.findMentions(text, filePath)) {
					const start = from + mention.start;
					const end = from + mention.end;
					if (excluded.some((r) => r.from < end && r.to > start)) continue;
					this.ranges.push({ from: start, to: end, mention });
					builder.add(start, end, mark);
				}
			}
			return builder.finish();
		}

		mentionAt(pos: number): MentionRange | undefined {
			return this.ranges.find((r) => r.from <= pos && pos <= r.to);
		}
	}

	const highlighter = ViewPlugin.fromClass(MentionHighlighter, {
		decorations: (v) => v.decorations,
		eventHandlers: {
			// Mobile has no hover; a tap on the underline opens a native menu.
			// On desktop a plain click just places the cursor as usual.
			click(event: MouseEvent, view: EditorView) {
				if (!Platform.isMobile) return;
				if (!view.state.selection.main.empty) return;
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos === null) return;
				const range = this.mentionAt(pos);
				if (!range) return;
				// Claim this tap: without stopPropagation it bubbles on to
				// document and immediately closes the menu we just opened.
				event.stopPropagation();
				host.showMentionMenu(view, range, event);
				return true;
			},
		},
	});

	// Desktop: hovering an underline shows the suggestion above the text.
	// Clicking the [[Target]] chip links it; the ✕ ignores the term.
	const hover = hoverTooltip(
		(view, pos) => {
			const range = view.plugin(highlighter)?.mentionAt(pos);
			if (!range) return null;
			return {
				pos: range.from,
				end: range.to,
				above: true,
				create: () => ({ dom: buildTooltip(view, range, host) }),
			};
		},
		{ hoverTime: 150 },
	);

	return [highlighter, hover];
}

function buildTooltip(view: EditorView, range: MentionRange, host: HighlighterHost): HTMLElement {
	const dom = document.createElement('div');
	dom.className = 'ils-tooltip';

	for (const target of dedupeTargets(range.mention.targets)) {
		const link = dom.createEl('button', { cls: 'ils-tooltip-link' });
		link.createSpan({ text: `[[${target.title}]]` });
		link.setAttribute('aria-label', `Link to ${target.path}`);
		link.addEventListener('click', (e) => {
			e.preventDefault();
			host.linkMention(view, range, target);
		});
	}

	const ignore = dom.createEl('button', { cls: 'ils-tooltip-ignore' });
	setIcon(ignore, 'x');
	ignore.setAttribute('aria-label', `Ignore "${range.mention.text}" everywhere`);
	ignore.addEventListener('click', (e) => {
		e.preventDefault();
		host.ignoreTerm(range.mention.text);
	});

	return dom;
}

function excludedRanges(
	view: EditorView,
	from: number,
	to: number,
): Array<{ from: number; to: number }> {
	const ranges: Array<{ from: number; to: number }> = [];
	syntaxTree(view.state).iterate({
		from,
		to,
		enter(node) {
			if (EXCLUDED_NODE.test(node.type.name)) {
				ranges.push({ from: node.from, to: node.to });
				return false;
			}
			return undefined;
		},
	});
	return ranges;
}
