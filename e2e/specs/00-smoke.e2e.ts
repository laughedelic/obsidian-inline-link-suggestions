/**
 * Boots Obsidian, confirms the plugin loaded, and guards against
 * wdio.mobile-emulation.conf.mts silently running in desktop mode.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('smoke', function () {
	it('loads the plugin', async function () {
		const loaded = await browser.executeObsidian(({ plugins }) =>
			Boolean(plugins.inlineLinkSuggestions),
		);
		expect(loaded).toBe(true);
	});

	it('reports the platform mode this config requested', async function () {
		// Set by test:e2e:mobile; absent (desktop) under plain test:e2e.
		const expectMobile = process.env.OBSIDIAN_E2E_MOBILE === '1';
		const platform = await obsidianPage.getPlatform();
		expect(platform.isMobile).toBe(expectMobile);
		expect(platform.isDesktop).toBe(!expectMobile);
	});
});
