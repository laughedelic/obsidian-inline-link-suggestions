import { PluginSettingTab, Setting, type App } from 'obsidian';
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
}

export const DEFAULT_SETTINGS: InlineLinkSuggestionsSettings = {
	enabled: true,
	caseSensitive: false,
	minTermLength: 3,
	includeAliases: true,
	ignoredTerms: [],
	excludedFolders: [],
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

		new Setting(containerEl)
			.setName('Excluded folders')
			.setDesc('Notes in these folders are not suggested as link targets, one folder per line.')
			.addTextArea((text) =>
				text
					.setPlaceholder('Templates/\narchive/')
					.setValue(this.plugin.settings.excludedFolders.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = splitLines(value);
						await this.plugin.saveSettingsAndReindex();
					}),
			);

		new Setting(containerEl)
			.setName('Ignored terms')
			.setDesc(
				'Terms that are never underlined, one per line. Add to this list from the menu on any underlined mention.',
			)
			.addTextArea((text) =>
				text
					.setPlaceholder('Daily\ninbox')
					.setValue(this.plugin.settings.ignoredTerms.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.ignoredTerms = splitLines(value);
						await this.plugin.saveSettingsAndReindex();
					}),
			);
	}
}

function splitLines(value: string): string[] {
	return value
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}
