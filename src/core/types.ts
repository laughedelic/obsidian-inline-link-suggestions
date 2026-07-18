/**
 * A note that can be linked to. Pure data — no Obsidian types so the core
 * stays testable outside the app.
 */
export interface NoteEntry {
	/** Vault path, e.g. "Projects/My Note.md" */
	path: string;
	/** Basename without extension — the note title. */
	title: string;
	/** Frontmatter aliases. */
	aliases: string[];
	/** Frontmatter `title` property, if set. */
	frontmatterTitle?: string;
}

/** One possible link target for a matched span of text. */
export interface LinkTarget {
	path: string;
	title: string;
	/** The term (title or alias) that matched. */
	term: string;
	isAlias: boolean;
}

/** A plain-text mention of one or more existing notes. */
export interface Mention {
	/** Offset range in the scanned text. */
	start: number;
	end: number;
	/** The original text slice. */
	text: string;
	/** Candidate notes; more than one when titles/aliases collide. */
	targets: LinkTarget[];
}

export interface MatcherOptions {
	/** Match "kubernetes" against note "Kubernetes" when false. Default false. */
	caseSensitive?: boolean;
	/** Terms shorter than this are never suggested. Default 3. */
	minTermLength?: number;
	/** Include frontmatter aliases as matchable terms. Default true. */
	includeAliases?: boolean;
	/** Include the frontmatter `title` property as a matchable term. Default true. */
	includeFrontmatterTitles?: boolean;
	/** Terms the user opted out of, compared case-folded. */
	ignoredTerms?: Iterable<string>;
}

/**
 * A source of link suggestions for a stretch of text. The literal
 * title/alias matcher is the first implementation; a semantic provider can
 * plug into the same decoration pipeline later (Phase 2).
 */
export interface SuggestionProvider {
	/**
	 * Find mentions in `text`. `excludePath` suppresses targets pointing at
	 * the note being edited (no self-links).
	 */
	findMentions(text: string, excludePath?: string): Mention[];
}
