import { PluginSettingTab, Setting, setIcon, type App } from 'obsidian';
import type InlineLinkSuggestionsPlugin from './main';

export interface InlineLinkSuggestionsSettings {
	enabled: boolean;
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

	display(): void {
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
