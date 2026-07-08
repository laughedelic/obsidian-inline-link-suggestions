import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	type PluginValue,
	ViewPlugin,
	type ViewUpdate,
} from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type { Mention, SuggestionProvider } from '../core/types';

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
	/** Show the link/ignore menu for a clicked mention. */
	onMentionClick(view: EditorView, range: MentionRange, event: MouseEvent): void;
}

/** A mention with absolute document positions. */
export interface MentionRange {
	from: number;
	to: number;
	mention: Mention;
}

export function createHighlighter(host: HighlighterHost) {
	class MentionHighlighter implements PluginValue {
		decorations: DecorationSet;
		ranges: MentionRange[] = [];

		constructor(view: EditorView) {
			this.decorations = this.compute(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
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
			const cursor = view.state.selection.main.head;

			for (const { from, to } of view.visibleRanges) {
				const excluded = excludedRanges(view, from, to);
				const text = view.state.doc.sliceString(from, to);
				for (const mention of provider.findMentions(text, filePath)) {
					const start = from + mention.start;
					const end = from + mention.end;
					if (excluded.some((r) => r.from < end && r.to > start)) continue;
					// Keep every mention for click hit-testing, but don't
					// underline the one the cursor is in (the word being
					// typed, or the one just clicked).
					this.ranges.push({ from: start, to: end, mention });
					if (cursor >= start && cursor <= end) continue;
					builder.add(start, end, mark);
				}
			}
			return builder.finish();
		}

		mentionAt(pos: number): MentionRange | undefined {
			return this.ranges.find((r) => r.from <= pos && pos <= r.to);
		}
	}

	return ViewPlugin.fromClass(MentionHighlighter, {
		decorations: (v) => v.decorations,
		eventHandlers: {
			// Resolved by document position, not event.target: the mousedown
			// preceding this click moves the cursor into the mention, which
			// removes its decoration and re-renders the span — so by click
			// time the DOM element no longer carries the mention class.
			click(event: MouseEvent, view: EditorView) {
				if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
				// A drag-selection also ends in a click; don't hijack it.
				if (!view.state.selection.main.empty) return;
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos === null) return;
				const range = this.mentionAt(pos);
				if (!range) return;
				// Ignore clicks in blank space past the end of a line that
				// merely resolve to a position inside the mention.
				const start = view.coordsAtPos(range.from);
				const end = view.coordsAtPos(range.to);
				if (start && end && start.top === end.top) {
					if (event.clientX < start.left - 2 || event.clientX > end.right + 2) return;
				}
				host.onMentionClick(view, range, event);
			},
		},
	});
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
