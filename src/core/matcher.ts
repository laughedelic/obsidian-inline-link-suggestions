import { AhoCorasick } from './ahocorasick';
import type { LinkTarget, MatcherOptions, Mention, NoteEntry, SuggestionProvider } from './types';

const WORD_BEFORE = /[\p{L}\p{N}_]$/u;
const WORD_AFTER = /^[\p{L}\p{N}_]/u;

/** Collapse targets that resolve to the same note (title + alias both matched). */
export function dedupeTargets(targets: LinkTarget[]): LinkTarget[] {
	const seen = new Set<string>();
	return targets.filter((t) => !seen.has(t.path) && seen.add(t.path));
}

/**
 * Case-fold a string per UTF-16 code unit, keeping offsets stable: a unit
 * whose lowercase form is longer than one unit (e.g. "İ") is kept as-is.
 */
export function foldCase(s: string): string {
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const lower = s[i]!.toLowerCase();
		out += lower.length === 1 ? lower : s[i]!;
	}
	return out;
}

/**
 * Literal title/alias matcher. Immutable once constructed — rebuild on
 * vault changes (cheap: ~10k notes builds in well under 100ms).
 */
export class LiteralMatcher implements SuggestionProvider {
	private ac = new AhoCorasick();
	/** patternId -> targets sharing that term. */
	private targetsByPattern: LinkTarget[][] = [];
	private caseSensitive: boolean;
	readonly termCount: number;

	constructor(notes: NoteEntry[], options: MatcherOptions = {}) {
		this.caseSensitive = options.caseSensitive ?? false;
		const minLength = options.minTermLength ?? 3;
		const includeAliases = options.includeAliases ?? true;
		const ignored = new Set<string>();
		for (const term of options.ignoredTerms ?? []) ignored.add(foldCase(term.trim()));

		// term (folded when insensitive) -> pattern id
		const patternIds = new Map<string, number>();
		const addTerm = (term: string, note: NoteEntry, isAlias: boolean) => {
			term = term.trim();
			if (term.length < minLength) return;
			if (ignored.has(foldCase(term))) return;
			const key = this.caseSensitive ? term : foldCase(term);
			let id = patternIds.get(key);
			if (id === undefined) {
				id = this.ac.add(key);
				patternIds.set(key, id);
				this.targetsByPattern[id] = [];
			}
			this.targetsByPattern[id]!.push({ path: note.path, title: note.title, term, isAlias });
		};

		for (const note of notes) {
			addTerm(note.title, note, false);
			if (includeAliases) for (const alias of note.aliases) addTerm(alias, note, true);
		}
		this.ac.build();
		this.termCount = patternIds.size;
	}

	findMentions(text: string, excludePath?: string): Mention[] {
		const haystack = this.caseSensitive ? text : foldCase(text);
		const raw: Array<{ start: number; end: number; patternId: number }> = [];
		this.ac.scan(haystack, (m) => {
			// word-boundary check on the original text
			if (WORD_BEFORE.test(text.slice(Math.max(0, m.start - 2), m.start))) return;
			if (WORD_AFTER.test(text.slice(m.end, m.end + 2))) return;
			raw.push(m);
		});

		// Leftmost-longest, non-overlapping. Merge same-span matches into one
		// mention with multiple targets.
		raw.sort((a, b) => a.start - b.start || b.end - a.end);
		const mentions: Mention[] = [];
		let lastEnd = 0;
		for (const m of raw) {
			const targets = this.targetsByPattern[m.patternId]!.filter(
				(t) => t.path !== excludePath,
			);
			if (targets.length === 0) continue;
			const current = mentions[mentions.length - 1];
			if (current && current.start === m.start && current.end === m.end) {
				current.targets.push(...targets);
				continue;
			}
			if (m.start < lastEnd) continue;
			mentions.push({ start: m.start, end: m.end, text: text.slice(m.start, m.end), targets });
			lastEnd = m.end;
		}
		return mentions;
	}
}
