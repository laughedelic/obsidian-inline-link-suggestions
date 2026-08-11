import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
	debounce,
	type Editor,
	editorInfoField,
	Menu,
	type MenuPositionDef,
	Notice,
	parseFrontMatterAliases,
	Plugin,
	TFile,
} from 'obsidian';
import { dedupeTargets, LiteralMatcher } from './core/matcher';
import type { LinkTarget, NoteEntry, SuggestionProvider } from './core/types';
import {
	createHighlighter,
	type Highlighter,
	type HighlighterHost,
	type MentionRange,
} from './editor/highlighter';
import { registerReadingView } from './reading/postprocessor';
import { underlineVars } from './appearance';
import {
	DEFAULT_SETTINGS,
	InlineLinkSuggestionsSettingTab,
	type InlineLinkSuggestionsSettings,
} from './settings';

/** Frontmatter `title` property, if it's a non-empty string. */
function frontmatterTitle(frontmatter: Record<string, unknown> | undefined): string | undefined {
	const title = frontmatter?.title;
	if (typeof title !== 'string') return undefined;
	const trimmed = title.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export default class InlineLinkSuggestionsPlugin extends Plugin {
	settings: InlineLinkSuggestionsSettings = DEFAULT_SETTINGS;
	private matcher: LiteralMatcher | null = null;
	private requestReindex = debounce(() => this.rebuildIndex(), 500, true);
	/**
	 * Mutable extension slot: swapping its contents and calling
	 * workspace.updateOptions() makes CM recreate the view plugin, which is
	 * how open editors pick up a rebuilt index.
	 */
	private editorExtension: Extension[] = [];
	/** Current highlighter; the commands query it for the mention at the cursor. */
	private highlighter: Highlighter | null = null;

	async onload() {
		await this.loadSettings();
		this.applyUnderlineStyle();
		this.addSettingTab(new InlineLinkSuggestionsSettingTab(this.app, this));

		this.registerEditorExtension(this.editorExtension);

		registerReadingView(this, {
			getProvider: () => (this.settings.enabled ? this.matcher : null),
			isPathEnabled: (path) => this.isPathEnabled(path),
			readingViewEnabled: () => this.settings.enabled && this.settings.readingView,
			replaceInFile: (path, from, to, mentionText, target) =>
				this.replaceInFile(path, from, to, mentionText, target),
			ignoreTerm: (term) => void this.addIgnoredTerm(term),
		});

		this.addCommand({
			id: 'toggle-suggestions',
			name: 'Toggle suggestions',
			callback: async () => {
				this.settings.enabled = !this.settings.enabled;
				await this.saveSettingsAndReindex();
				new Notice(`Inline link suggestions ${this.settings.enabled ? 'on' : 'off'}`);
			},
		});

		// Keyboard path for what the popup offers. Deliberately unbound by
		// default: the user picks the keys in Settings → Hotkeys.
		this.addCommand({
			id: 'link-mention-at-cursor',
			name: 'Link mention at cursor',
			editorCheckCallback: (checking, editor) => {
				const found = this.mentionAtCursor(editor);
				if (!found) return false;
				if (!checking) this.linkOrPickTarget(found.view, found.range);
				return true;
			},
		});

		this.addCommand({
			id: 'ignore-mention-at-cursor',
			name: 'Ignore mention at cursor',
			editorCheckCallback: (checking, editor) => {
				const found = this.mentionAtCursor(editor);
				if (!found) return false;
				if (!checking) void this.addIgnoredTerm(found.range.mention.text);
				return true;
			},
		});

		// Index once the vault is fully resolved, then keep it fresh.
		this.app.workspace.onLayoutReady(() => {
			this.rebuildIndex();
			// 'changed' fires on every edit of any note; only reindex when the
			// file's matchable terms (title/aliases) actually changed.
			this.registerEvent(
				this.app.metadataCache.on('changed', (file) => {
					if (this.termSignatures.get(file.path) !== this.termSignature(file)) {
						this.requestReindex();
					}
				}),
			);
			this.registerEvent(this.app.vault.on('create', this.requestReindex));
			this.registerEvent(this.app.vault.on('delete', this.requestReindex));
			this.registerEvent(this.app.vault.on('rename', this.requestReindex));
		});
	}

	/** Per-file signature of the terms it contributes to the index. */
	private termSignatures = new Map<string, string>();

	private termSignature(file: TFile): string {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const aliases = parseFrontMatterAliases(frontmatter) ?? [];
		const title = frontmatterTitle(frontmatter);
		return [file.basename, ...aliases, title ?? ''].join(' ');
	}

	private rebuildIndex() {
		if (!this.settings.enabled) {
			this.matcher = null;
			this.refreshEditors();
			return;
		}
		const excluded = this.settings.excludedFolders.map((f) =>
			f.endsWith('/') ? f : `${f}/`,
		);
		const notes: NoteEntry[] = [];
		this.termSignatures.clear();
		for (const file of this.app.vault.getMarkdownFiles()) {
			this.termSignatures.set(file.path, this.termSignature(file));
			if (excluded.some((folder) => file.path.startsWith(folder))) continue;
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			notes.push({
				path: file.path,
				title: file.basename,
				aliases: parseFrontMatterAliases(frontmatter) ?? [],
				frontmatterTitle: frontmatterTitle(frontmatter),
			});
		}
		this.matcher = new LiteralMatcher(notes, {
			caseSensitive: this.settings.caseSensitive,
			minTermLength: this.settings.minTermLength,
			includeAliases: this.settings.includeAliases,
			includeFrontmatterTitles: this.settings.includeFrontmatterTitles,
			ignoredTerms: this.settings.ignoredTerms,
		});
		this.refreshEditors();
	}

	private refreshEditors() {
		const host: HighlighterHost = {
			getProvider: (): SuggestionProvider | null =>
				this.settings.enabled ? this.matcher : null,
			isPathEnabled: (path) => this.isPathEnabled(path),
			linkMention: (view, range, target) => this.linkMention(view, range, target),
			ignoreTerm: (term) => void this.addIgnoredTerm(term),
			showMentionMenu: (view, range, event) => this.showMentionMenu(view, range, event),
		};
		this.editorExtension.length = 0;
		this.highlighter = this.settings.enabled ? createHighlighter(host) : null;
		if (this.highlighter) this.editorExtension.push(this.highlighter.extension);
		this.app.workspace.updateOptions();
	}

	private isPathEnabled(path: string): boolean {
		return (
			this.settings.enabled &&
			!this.settings.disabledFolders.some((f) =>
				path.startsWith(f.endsWith('/') ? f : `${f}/`),
			)
		);
	}

	/** The underlined mention the cursor sits in, if there is one. */
	private mentionAtCursor(editor: Editor): { view: EditorView; range: MentionRange } | null {
		// `Editor.cm` is the underlying CM6 view; it's absent in the legacy
		// editor, which this plugin's decorations don't run in anyway.
		const view = (editor as Editor & { cm?: EditorView }).cm;
		if (!view || !this.highlighter) return null;
		const range = this.highlighter.mentionAt(view, view.state.selection.main.head);
		return range ? { view, range } : null;
	}

	/**
	 * Unambiguous mentions link straight away; ambiguous ones open the same
	 * menu as a mobile tap, anchored below the mention.
	 */
	private linkOrPickTarget(view: EditorView, range: MentionRange) {
		const [only, ...rest] = dedupeTargets(range.mention.targets);
		if (only && rest.length === 0) {
			this.linkMention(view, range, only);
			return;
		}
		const coords = view.coordsAtPos(range.from) ?? view.dom.getBoundingClientRect();
		this.showMentionMenu(view, range, { x: coords.left, y: coords.bottom });
	}

	private showMentionMenu(view: EditorView, range: MentionRange, at: MouseEvent | MenuPositionDef) {
		const { mention } = range;
		const menu = new Menu();
		// Not `instanceof MouseEvent`: in a popout window the event comes from
		// a different global, where that check is false.
		const fromPointer = 'clientX' in at;
		// The keyboard path needs arrow-key navigation, so it gets the DOM
		// menu; a tap keeps whatever menu the platform would normally use.
		if (!fromPointer) menu.setUseNativeMenu(false);

		for (const target of dedupeTargets(mention.targets)) {
			menu.addItem((item) =>
				item
					.setTitle(`Link to "${target.title}"`)
					.setIcon('link')
					.onClick(() => this.linkMention(view, range, target)),
			);
		}

		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(`Ignore "${mention.text}" everywhere`)
				.setIcon('x-circle')
				.onClick(() => this.addIgnoredTerm(mention.text)),
		);

		if ('clientX' in at) menu.showAtMouseEvent(at);
		else menu.showAtPosition(at);
	}

	async addIgnoredTerm(term: string) {
		if (this.settings.ignoredTerms.includes(term)) return;
		this.settings.ignoredTerms.push(term);
		await this.saveSettingsAndReindex();
	}

	private linkMention(view: EditorView, range: MentionRange, target: LinkTarget) {
		const sourcePath = view.state.field(editorInfoField).file?.path ?? '';
		const file = this.app.vault.getAbstractFileByPath(target.path);
		if (!(file instanceof TFile)) return;

		// Verify the document still contains the mention at this range (it
		// could have changed between decoration and click).
		const { from, to, mention } = range;
		if (to > view.state.doc.length) return;
		if (view.state.doc.sliceString(from, to) !== mention.text) return;

		const alias = mention.text === target.title ? undefined : mention.text;
		const link = this.app.fileManager.generateMarkdownLink(file, sourcePath, undefined, alias);
		view.dispatch({ changes: { from, to, insert: link } });
	}

	/** Reading view: replace [from, to) in the file with a generated link. */
	private async replaceInFile(
		path: string,
		from: number,
		to: number,
		mentionText: string,
		target: LinkTarget,
	) {
		const file = this.app.vault.getAbstractFileByPath(path);
		const targetFile = this.app.vault.getAbstractFileByPath(target.path);
		if (!(file instanceof TFile) || !(targetFile instanceof TFile)) return;
		await this.app.vault.process(file, (data) => {
			// The rendered section may be stale; never replace blindly.
			if (data.slice(from, to) !== mentionText) return data;
			const alias = mentionText === target.title ? undefined : mentionText;
			const link = this.app.fileManager.generateMarkdownLink(targetFile, path, undefined, alias);
			return data.slice(0, from) + link + data.slice(to);
		});
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<InlineLinkSuggestionsSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettingsAndReindex() {
		await this.saveData(this.settings);
		this.requestReindex();
	}

	/** Appearance settings only: no index or decoration change is needed. */
	async saveSettingsAndRestyle() {
		await this.saveData(this.settings);
		this.applyUnderlineStyle();
	}

	/**
	 * Write the appearance settings as CSS custom properties on <body>, where
	 * styles.css picks them up (its own fallbacks are the defaults). Cleared on
	 * unload so nothing of the plugin is left behind in the DOM.
	 */
	private applyUnderlineStyle() {
		for (const [name, value] of Object.entries(underlineVars(this.settings))) {
			document.body.style.setProperty(name, value);
		}
	}

	onunload() {
		for (const name of Object.keys(underlineVars(this.settings))) {
			document.body.style.removeProperty(name);
		}
	}
}
