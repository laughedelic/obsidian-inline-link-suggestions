import {
	PluginSettingTab,
	Setting,
	setIcon,
	type App,
	type SettingDefinitionItem,
	type SettingDefinitionList,
} from 'obsidian';
import {
	DEFAULT_APPEARANCE,
	type UnderlineAppearance,
	type UnderlineColor,
	type UnderlineStyle,
} from './appearance';
import type InlineLinkSuggestionsPlugin from './main';

export interface InlineLinkSuggestionsSettings extends UnderlineAppearance {
	enabled: boolean;
	/** Also underline mentions in reading view. */
	readingView: boolean;
	caseSensitive: boolean;
	minTermLength: number;
	includeAliases: boolean;
	includeFrontmatterTitles: boolean;
	/** Vault-wide terms the user chose to never suggest. */
	ignoredTerms: string[];
	/** Folder prefixes whose notes are excluded as link targets. */
	excludedFolders: string[];
	/** Folder prefixes where no suggestions are shown while editing. */
	disabledFolders: string[];
}

export const DEFAULT_SETTINGS: InlineLinkSuggestionsSettings = {
	enabled: true,
	readingView: false,
	caseSensitive: false,
	minTermLength: 3,
	includeAliases: true,
	includeFrontmatterTitles: true,
	ignoredTerms: [],
	excludedFolders: [],
	disabledFolders: [],
	...DEFAULT_APPEARANCE,
};

/**
 * The SettingTab methods that only exist on Obsidian 1.13. Calls go through
 * this view of the tab rather than through `this`, so nothing here claims an
 * API newer than the manifest's minAppVersion — and so they no-op if anything
 * on an older version ever reaches them.
 */
interface SettingTabSince113 {
	update?(): void;
	refreshDomState?(): void;
}

/** The settings whose value is a list of strings the user edits row by row. */
type ListKey = 'excludedFolders' | 'disabledFolders' | 'ignoredTerms';

/** `excludedFolders.2` addresses the third entry of that list. */
const LIST_ENTRY_KEY = /^(excludedFolders|disabledFolders|ignoredTerms)\.(\d+)$/;

/** Keys that only change how a mention is drawn, so they skip the reindex. */
const APPEARANCE_KEYS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_APPEARANCE));

const UNDERLINE_STYLES: Record<UnderlineStyle, string> = {
	dotted: 'Dotted',
	dashed: 'Dashed',
	solid: 'Solid',
	wavy: 'Wavy',
};

const UNDERLINE_COLORS: Record<UnderlineColor, string> = {
	faint: 'Faint (theme)',
	muted: 'Muted (theme)',
	accent: 'Accent (theme)',
	custom: 'Custom…',
};

const THICKNESS_LABELS: Record<number, string> = { 1: 'Thin', 2: 'Medium', 3: 'Thick' };

/**
 * A live sample of what a mention looks like. It's a real .ils-mention, so it
 * picks up every appearance change at once, without re-rendering the tab.
 */
function underlineSample(): DocumentFragment {
	const fragment = createFragment();
	const sample = fragment.createDiv({ cls: 'ils-underline-sample' });
	sample.appendText('Mentions look like ');
	// Two words with descenders: that is where an underline looks worst.
	sample.createSpan({ cls: 'ils-mention', text: 'this suggestion' });
	sample.appendText('.');
	return fragment;
}

export class InlineLinkSuggestionsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: InlineLinkSuggestionsPlugin,
	) {
		super(app, plugin);
	}

	/** @see SettingTabSince113 */
	private get since113(): SettingTabSince113 {
		return this;
	}

	// ---------------------------------------------------------------------
	// Declarative settings (Obsidian 1.13+). Obsidian renders these itself and
	// indexes them for settings search; display() below is never called when
	// this returns a non-empty array.
	// ---------------------------------------------------------------------

	getSettingDefinitions(): SettingDefinitionItem[] {
		const styleDesc = underlineSample();
		styleDesc.appendText('Line drawn under a mention.');

		return [
			{
				name: 'Enable suggestions',
				desc: 'Underline plain-text mentions of existing notes in the editor.',
				control: { type: 'toggle', key: 'enabled' },
			},
			{
				name: 'Underline in reading view',
				desc: 'Also underline mentions in reading view. Already-rendered notes refresh when reopened.',
				control: { type: 'toggle', key: 'readingView' },
			},
			{
				type: 'group',
				heading: 'Appearance',
				items: [
					{
						name: 'Underline style',
						desc: styleDesc,
						control: {
							type: 'dropdown',
							key: 'underlineStyle',
							options: UNDERLINE_STYLES,
						},
					},
					{
						name: 'Underline thickness',
						control: {
							type: 'slider',
							key: 'underlineThickness',
							min: 1,
							max: 3,
							step: 1,
							displayFormat: (value) => THICKNESS_LABELS[value] ?? String(value),
						},
					},
					{
						name: 'Underline color',
						desc: 'The first three follow your theme; hovering a mention always uses the accent color.',
						control: {
							type: 'dropdown',
							key: 'underlineColor',
							options: UNDERLINE_COLORS,
						},
					},
					{
						name: 'Custom color',
						desc: 'Used in both light and dark mode — pick one that works in each.',
						// setControlValue() calls refreshDomState() so this
						// re-evaluates as soon as the color mode changes.
						visible: () => this.plugin.settings.underlineColor === 'custom',
						control: { type: 'color', key: 'underlineCustomColor' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Matching',
				items: [
					{
						name: 'Case-sensitive matching',
						desc: 'Only underline text that matches a note title or alias exactly, including case.',
						control: { type: 'toggle', key: 'caseSensitive' },
					},
					{
						name: 'Include aliases',
						desc: 'Also match frontmatter aliases of notes.',
						control: { type: 'toggle', key: 'includeAliases' },
					},
					{
						name: 'Include frontmatter titles',
						desc: 'Also match a note\'s frontmatter `title` property.',
						control: { type: 'toggle', key: 'includeFrontmatterTitles' },
					},
					{
						name: 'Minimum term length',
						desc: 'Note titles and aliases shorter than this are never suggested.',
						control: { type: 'slider', key: 'minTermLength', min: 1, max: 10, step: 1 },
					},
				],
			},
			this.listDefinition(
				'excludedFolders',
				'Excluded folders',
				'Notes in these folders are not suggested as link targets.',
				'Folder path…',
			),
			this.listDefinition(
				'disabledFolders',
				'Disabled folders',
				'No suggestions are shown while editing notes in these folders.',
				'Folder path…',
			),
			this.listDefinition(
				'ignoredTerms',
				'Ignored terms',
				'Terms that are never underlined. You can also add to this list from any underlined mention.',
				'Term…',
			),
		];
	}

	/** One editable row per entry, plus the add/delete affordances. */
	private listDefinition(
		key: ListKey,
		heading: string,
		desc: string,
		placeholder: string,
	): SettingDefinitionList {
		const values = this.plugin.settings[key];
		const save = async () => {
			await this.plugin.saveSettingsAndReindex();
			// The number of rows changed, so the definitions have to be rebuilt.
			this.since113.update?.();
		};
		return {
			type: 'list',
			heading,
			emptyState: desc,
			items: values.map((_value, index) => ({
				name: '',
				// The row is the value; there is nothing extra to match on.
				searchable: false,
				control: { type: 'text', key: `${key}.${index}`, placeholder },
			})),
			onDelete: (index) => {
				values.splice(index, 1);
				void save();
			},
			addItem: {
				name: `Add to ${heading.toLowerCase()}`,
				action: () => {
					values.push('');
					void save();
				},
			},
		};
	}

	getControlValue(key: string): unknown {
		const entry = this.listEntry(key);
		if (entry) return entry.values[entry.index];
		return this.plugin.settings[key as keyof InlineLinkSuggestionsSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const entry = this.listEntry(key);
		if (entry) {
			entry.values[entry.index] = String(value).trim();
			await this.plugin.saveSettingsAndReindex();
			return;
		}

		Object.assign(this.plugin.settings, { [key]: value });
		if (APPEARANCE_KEYS.has(key)) {
			await this.plugin.saveSettingsAndRestyle();
			// Picking a color mode shows or hides the custom color row.
			this.since113.refreshDomState?.();
		} else {
			await this.plugin.saveSettingsAndReindex();
		}
	}

	private listEntry(key: string): { values: string[]; index: number } | null {
		const match = LIST_ENTRY_KEY.exec(key);
		if (!match) return null;
		return { values: this.plugin.settings[match[1] as ListKey], index: Number(match[2]) };
	}

	// ---------------------------------------------------------------------
	// Imperative fallback, only reached on Obsidian older than 1.13.
	// ---------------------------------------------------------------------

	display(): void {
		this.renderImperative();
	}

	/**
	 * The body of display(), as a non-deprecated method: the appearance
	 * settings re-render the tab when the color mode changes.
	 */
	private renderImperative(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable suggestions')
			.setDesc('Underline plain-text mentions of existing notes in the editor.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettingsAndReindex();
				}),
			);

		new Setting(containerEl)
			.setName('Underline in reading view')
			.setDesc(
				'Also underline mentions in reading view. Already-rendered notes refresh when reopened.',
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.readingView).onChange(async (value) => {
					this.plugin.settings.readingView = value;
					await this.plugin.saveSettingsAndReindex();
				}),
			);

		this.appearanceSettings();

		new Setting(containerEl).setName('Matching').setHeading();

		new Setting(containerEl)
			.setName('Case-sensitive matching')
			.setDesc('Only underline text that matches a note title or alias exactly, including case.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
					this.plugin.settings.caseSensitive = value;
					await this.plugin.saveSettingsAndReindex();
				}),
			);

		new Setting(containerEl)
			.setName('Include aliases')
			.setDesc('Also match frontmatter aliases of notes.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeAliases).onChange(async (value) => {
					this.plugin.settings.includeAliases = value;
					await this.plugin.saveSettingsAndReindex();
				}),
			);

		new Setting(containerEl)
			.setName('Include frontmatter titles')
			.setDesc('Also match a note\'s frontmatter `title` property.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeFrontmatterTitles).onChange(async (value) => {
					this.plugin.settings.includeFrontmatterTitles = value;
					await this.plugin.saveSettingsAndReindex();
				}),
			);

		new Setting(containerEl)
			.setName('Minimum term length')
			.setDesc('Note titles and aliases shorter than this are never suggested.')
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.minTermLength)
					.onChange(async (value) => {
						this.plugin.settings.minTermLength = value;
						await this.plugin.saveSettingsAndReindex();
					}),
			);

		this.chipListSetting(
			'Excluded folders',
			'Notes in these folders are not suggested as link targets.',
			'Folder path…',
			this.plugin.settings.excludedFolders,
		);

		this.chipListSetting(
			'Disabled folders',
			'No suggestions are shown while editing notes in these folders.',
			'Folder path…',
			this.plugin.settings.disabledFolders,
		);

		this.chipListSetting(
			'Ignored terms',
			'Terms that are never underlined. You can also add to this list from any underlined mention.',
			'Term…',
			this.plugin.settings.ignoredTerms,
		);
	}

	/**
	 * Underline style, thickness and color, with a live sample above them.
	 */
	private appearanceSettings() {
		const { containerEl } = this;
		const save = () => this.plugin.saveSettingsAndRestyle();

		const heading = new Setting(containerEl).setName('Appearance').setHeading();
		heading.descEl.appendChild(underlineSample());

		new Setting(containerEl)
			.setName('Underline style')
			.setDesc('Line drawn under a mention.')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(UNDERLINE_STYLES)
					.setValue(this.plugin.settings.underlineStyle)
					.onChange(async (value) => {
						this.plugin.settings.underlineStyle = value as UnderlineStyle;
						await save();
					}),
			);

		new Setting(containerEl)
			.setName('Underline thickness')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ '1': 'Thin', '2': 'Medium', '3': 'Thick' })
					.setValue(String(this.plugin.settings.underlineThickness))
					.onChange(async (value) => {
						this.plugin.settings.underlineThickness = Number(value);
						await save();
					}),
			);

		new Setting(containerEl)
			.setName('Underline color')
			.setDesc('The first three follow your theme; hovering a mention always uses the accent color.')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(UNDERLINE_COLORS)
					.setValue(this.plugin.settings.underlineColor)
					.onChange(async (value) => {
						this.plugin.settings.underlineColor = value as UnderlineColor;
						await save();
						// Show or hide the custom color picker below.
						this.renderImperative();
					}),
			);

		if (this.plugin.settings.underlineColor === 'custom') {
			new Setting(containerEl)
				.setName('Custom color')
				.setDesc('Used in both light and dark mode — pick one that works in each.')
				.addColorPicker((picker) =>
					picker
						.setValue(this.plugin.settings.underlineCustomColor)
						.onChange(async (value) => {
							this.plugin.settings.underlineCustomColor = value;
							await save();
						}),
				);
		}
	}

	/** A setting whose value is a list of removable chips plus an add-input. */
	private chipListSetting(name: string, desc: string, placeholder: string, values: string[]) {
		const setting = new Setting(this.containerEl).setName(name).setDesc(desc);
		setting.settingEl.addClass('ils-chip-setting');
		const chips = setting.controlEl.createDiv({ cls: 'ils-chips' });

		const save = () => this.plugin.saveSettingsAndReindex();

		const render = () => {
			chips.empty();
			for (const value of values) {
				const chip = chips.createSpan({ cls: 'ils-chip' });
				chip.createSpan({ cls: 'ils-chip-text', text: value });
				const remove = chip.createEl('button', {
					cls: 'ils-chip-remove',
					attr: { 'aria-label': `Remove ${value}` },
				});
				setIcon(remove, 'x');
				remove.addEventListener('click', () => {
					values.remove(value);
					void save();
					render();
				});
			}

			const input = chips.createEl('input', {
				cls: 'ils-chip-input',
				type: 'text',
				attr: { placeholder, 'aria-label': `Add to ${name.toLowerCase()}` },
			});
			input.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter') return;
				const value = input.value.trim();
				if (!value) return;
				event.preventDefault();
				if (!values.includes(value)) {
					values.push(value);
					void save();
				}
				render();
				chips.querySelector('input')?.focus();
			});
		};
		render();
	}
}
