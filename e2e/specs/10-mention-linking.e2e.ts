/**
 * Exercises the plugin's core interaction end-to-end: an underlined mention
 * turns into a link. Runs once as normal desktop (hover tooltip) and once
 * under Obsidian's mobile emulation (tap opens a native menu instead) — see
 * the Platform.isMobile branch in src/editor/highlighter.ts. This is what
 * stands in for manual mobile testing.
 *
 * All interactions are dispatched via browser.execute (either a synthetic
 * MouseEvent with coordinates from getBoundingClientRect, or the DOM's own
 * .click()) rather than WebdriverIO's native pointer actions: this
 * Electron/CDP setup doesn't reliably support the window-rect queries those
 * actions depend on.
 *
 * Reopening a file that's already the active leaf can transiently leave a
 * stale, zero-size duplicate `.cm-line` in the DOM until Obsidian finishes
 * the leaf switch, so `.ils-mention` matches are filtered to the one with
 * real layout rather than assumed to be the first in document order.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

async function waitForLaidOut(selector: string): Promise<void> {
	await browser.waitUntil(
		() =>
			browser.execute(
				(selector) =>
					Array.from(document.querySelectorAll(selector)).some((el) => {
						const r = el.getBoundingClientRect();
						return r.width > 0 && r.height > 0;
					}),
				selector,
			),
		{ timeoutMsg: `no "${selector}" ever got a non-zero layout` },
	);
}

/** Dispatches `type` at the center of the one laid-out match for `selector`. */
async function dispatchAtCenter(selector: string, type: string): Promise<void> {
	await browser.execute(
		(selector, type) => {
			const laidOut = Array.from(document.querySelectorAll(selector)).find((el) => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.height > 0;
			});
			if (!laidOut) throw new Error(`no laid-out element matching "${selector}"`);
			const r = laidOut.getBoundingClientRect();
			laidOut.dispatchEvent(
				new MouseEvent(type, {
					bubbles: true,
					cancelable: true,
					clientX: r.x + r.width / 2,
					clientY: r.y + r.height / 2,
					view: window,
				}),
			);
		},
		selector,
		type,
	);
}

async function clickViaJs(selector: string): Promise<void> {
	await browser.execute((selector) => {
		document.querySelector<HTMLElement>(selector)?.click();
	}, selector);
}

/** Obsidian's own Menu: click the first `.menu-item` whose text contains `text`. */
async function clickMenuItemContaining(text: string): Promise<void> {
	await browser.waitUntil(
		() =>
			browser.execute(
				(text) =>
					Array.from(document.querySelectorAll('.menu-item')).some((el) =>
						el.textContent?.includes(text),
					),
				text,
			),
		{ timeoutMsg: `no menu item containing "${text}"` },
	);
	await browser.execute((text) => {
		const item = Array.from(document.querySelectorAll('.menu-item')).find((el) =>
			el.textContent?.includes(text),
		);
		(item as HTMLElement | undefined)?.click();
	}, text);
}

describe('mention linking', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await obsidianPage.openFile('Notes.md');
		await waitForLaidOut('.ils-mention');
	});

	it('underlines the plain-text title mention only', async function () {
		// Not the existing [[Kubernetes]] link, not the `Kubernetes` in code.
		const mentions = browser.$$('.ils-mention');
		await expect(mentions).toBeElementsArrayOfSize(1);
		await expect(mentions[0]).toHaveText('Kubernetes');
	});

	it('links the mention', async function () {
		const isMobile = (await obsidianPage.getPlatform()).isMobile;

		if (isMobile) {
			// No hover on mobile: tap opens a native menu instead.
			await dispatchAtCenter('.ils-mention', 'click');
			await clickMenuItemContaining('Link to "Kubernetes"');
		} else {
			await dispatchAtCenter('.ils-mention', 'mousemove');
			const link = browser.$('.ils-tooltip-link');
			await expect(link).toHaveText('Kubernetes');
			await clickViaJs('.ils-tooltip-link');
		}

		const buffer = await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			return view?.editor.getValue();
		});
		expect(buffer).toContain('Deploying to [[Kubernetes]] today.');
	});
});
