import {
	PluginSettingTab,
	setIcon,
	type App,
	type Setting,
	type SettingDefinitionItem,
} from 'obsidian';
import type InlineLinkSuggestionsPlugin from './main';

export interface InlineLinkSuggestionsSettings {
	enabled: boolean;
	/** Also underline mentions in reading view. */
	readingView: boolean;
	caseSensitive: boolean;
	minTermLength: number;
	includeAliases: boolean;
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
	ignoredTerms: [],
	excludedFolders: [],
	disabledFolders: [],
};

export class InlineLinkSuggestionsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: InlineLinkSuggestionsPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Enable suggestions',
				desc: 'Underline plain-text mentions of existing notes in the editor.',
				control: { type: 'toggle', key: 'enabled', defaultValue: DEFAULT_SETTINGS.enabled },
			},
			{
				name: 'Underline in reading view',
				desc: 'Also underline mentions in reading view. Already-rendered notes refresh when reopened.',
				control: {
					type: 'toggle',
					key: 'readingView',
					defaultValue: DEFAULT_SETTINGS.readingView,
				},
			},
			{
				name: 'Case-sensitive matching',
				desc: 'Only underline text that matches a note title or alias exactly, including case.',
				control: {
					type: 'toggle',
					key: 'caseSensitive',
					defaultValue: DEFAULT_SETTINGS.caseSensitive,
				},
			},
			{
				name: 'Include aliases',
				desc: 'Also match frontmatter aliases of notes.',
				control: {
					type: 'toggle',
					key: 'includeAliases',
					defaultValue: DEFAULT_SETTINGS.includeAliases,
				},
			},
			{
				name: 'Minimum term length',
				desc: 'Note titles and aliases shorter than this are never suggested.',
				control: {
					type: 'slider',
					key: 'minTermLength',
					min: 1,
					max: 10,
					step: 1,
					defaultValue: DEFAULT_SETTINGS.minTermLength,
				},
			},
			this.chipListSetting(
				'Excluded folders',
				'Notes in these folders are not suggested as link targets.',
				'Folder path…',
				this.plugin.settings.excludedFolders,
			),
			this.chipListSetting(
				'Disabled folders',
				'No suggestions are shown while editing notes in these folders.',
				'Folder path…',
				this.plugin.settings.disabledFolders,
			),
			this.chipListSetting(
				'Ignored terms',
				'Terms that are never underlined. You can also add to this list from any underlined mention.',
				'Term…',
				this.plugin.settings.ignoredTerms,
			),
		];
	}

	override getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof InlineLinkSuggestionsSettings];
	}

	override setControlValue(key: string, value: unknown): Promise<void> {
		Object.assign(this.plugin.settings, { [key]: value });
		return this.plugin.saveSettingsAndReindex();
	}

	/** A setting whose value is a list of removable chips plus an add-input. */
	private chipListSetting(
		name: string,
		desc: string,
		placeholder: string,
		values: string[],
	): SettingDefinitionItem {
		return {
			name,
			desc,
			// Let settings search find the setting by its current entries too.
			aliases: [...values],
			render: (setting: Setting) => this.renderChips(setting, name, placeholder, values),
		};
	}

	private renderChips(setting: Setting, name: string, placeholder: string, values: string[]) {
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
