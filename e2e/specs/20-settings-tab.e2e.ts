/**
 * The settings tab ships two renderings of the same settings: the declarative
 * definitions Obsidian 1.13 renders itself, and display() for older versions.
 * These assertions are deliberately version-agnostic — run the suite with
 * OBSIDIAN_VERSIONS="earliest/earliest latest/latest" to cover both paths.
 *
 * The settings modal isn't attached to the document in this harness, so the
 * assertions read the tab's own containerEl instead of querying the document.
 * Each callback runs in the app, so it can't close over anything from here.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PLUGIN_ID = 'inline-link-suggestions';

interface SettingTabInternals {
	containerEl: HTMLElement;
	display(): void;
	/** Only on 1.13+, so it doubles as the host-version check. */
	update?: () => void;
	getControlValue(key: string): unknown;
	setControlValue(key: string, value: unknown): void | Promise<void>;
}

/** The private app APIs this spec drives; none of them are in obsidian.d.ts. */
interface AppInternals {
	setting: {
		open(): void;
		close(): void;
		openTabById(id: string): void;
		activeTab: SettingTabInternals;
	};
	plugins: {
		plugins: Record<string, { settings: Record<string, unknown> }>;
	};
}

describe('settings tab', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
	});

	afterEach(async function () {
		await browser.executeObsidian(({ app }) => {
			(app as unknown as AppInternals).setting.close();
		});
	});

	it('renders every setting, whichever API the running version uses', async function () {
		const names = await browser.executeObsidian(({ app }, id) => {
			const { setting } = app as unknown as AppInternals;
			setting.open();
			setting.openTabById(id);
			return Array.from(
				setting.activeTab.containerEl.querySelectorAll('.setting-item-name'),
			).map((el) => el.textContent ?? '');
		}, PLUGIN_ID);

		for (const name of [
			'Enable suggestions',
			'Underline in reading view',
			'Appearance',
			'Underline style',
			'Underline thickness',
			'Underline color',
			'Matching',
			'Case-sensitive matching',
			'Include aliases',
			'Include frontmatter titles',
			'Minimum term length',
			'Excluded folders',
			'Disabled folders',
			'Ignored terms',
		]) {
			expect(names).toContain(name);
		}
	});

	it('reveals the custom color picker only in the custom mode', async function () {
		const shown = await browser.executeObsidian(async ({ app }, id) => {
			const { setting, plugins } = app as unknown as AppInternals;
			setting.open();
			setting.openTabById(id);
			const { activeTab } = setting;

			// 1.13 renders the row hidden; display() leaves it out entirely.
			const isShown = () => {
				const row = Array.from(
					activeTab.containerEl.querySelectorAll<HTMLElement>('.setting-item'),
				).find((el) => el.querySelector('.setting-item-name')?.textContent === 'Custom color');
				return Boolean(row) && row?.style.display !== 'none';
			};

			const before = isShown();
			// update() marks a 1.13 host: this tab defines setControlValue on
			// itself, so its presence says nothing about the app version.
			if (activeTab.update) {
				await activeTab.setControlValue('underlineColor', 'custom');
			} else {
				const plugin = plugins.plugins[id];
				if (!plugin) throw new Error(`${id} is not loaded`);
				plugin.settings.underlineColor = 'custom';
				activeTab.display();
			}
			return { before, after: isShown() };
		}, PLUGIN_ID);

		expect(shown).toEqual({ before: false, after: true });
	});

	it('shows the stored entries of a list setting', async function () {
		const found = await browser.executeObsidian(({ app }, id) => {
			const { setting, plugins } = app as unknown as AppInternals;
			setting.open();
			setting.openTabById(id);
			const { activeTab } = setting;

			const plugin = plugins.plugins[id];
			if (!plugin) throw new Error(`${id} is not loaded`);
			plugin.settings.ignoredTerms = ['Kubernetes'];
			// 1.13 rebuilds from the definitions; older versions re-render.
			if (activeTab.update) activeTab.update();
			else activeTab.display();

			// A declarative list entry is a text input; a chip is plain text.
			const inputs = Array.from(
				activeTab.containerEl.querySelectorAll<HTMLInputElement>('input[type="text"]'),
			).map((el) => el.value);
			return (
				inputs.includes('Kubernetes') ||
				(activeTab.containerEl.textContent ?? '').includes('Kubernetes')
			);
		}, PLUGIN_ID);

		expect(found).toBe(true);
	});

	it('round-trips a control value through the plugin settings', async function () {
		const value = await browser.executeObsidian(async ({ app }, id) => {
			const { setting, plugins } = app as unknown as AppInternals;
			setting.open();
			setting.openTabById(id);
			const { activeTab } = setting;

			// Only 1.13 drives these, but the tab defines them on every version,
			// so the round-trip is worth asserting on both.
			await activeTab.setControlValue('minTermLength', 5);
			const plugin = plugins.plugins[id];
			if (!plugin) throw new Error(`${id} is not loaded`);
			return [activeTab.getControlValue('minTermLength'), plugin.settings.minTermLength].join('/');
		}, PLUGIN_ID);

		expect(value).toBe('5/5');
	});
});
