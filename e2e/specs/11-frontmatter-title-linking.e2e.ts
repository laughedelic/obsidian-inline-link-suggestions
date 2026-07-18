/**
 * Verifies frontmatter `title` mentions are indexed and link as an alias to
 * the note's actual filename, e.g. [[Deploy Runbook|Production Rollout
 * Guide]]. See e2e/specs/10-mention-linking.e2e.ts for the interaction
 * helpers and the rationale behind dispatching events via browser.execute.
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

describe('frontmatter title linking', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await obsidianPage.openFile('Frontmatter Title Fixture.md');
		await waitForLaidOut('.ils-mention');
	});

	it('underlines a mention of a note\'s frontmatter title', async function () {
		const mentions = browser.$$('.ils-mention');
		await expect(mentions).toBeElementsArrayOfSize(1);
		await expect(mentions[0]).toHaveText('Production Rollout Guide');
	});

	it('links the mention as an alias to the note\'s actual filename', async function () {
		const isMobile = (await obsidianPage.getPlatform()).isMobile;

		if (isMobile) {
			await dispatchAtCenter('.ils-mention', 'click');
			await clickMenuItemContaining('Link to "Deploy Runbook"');
		} else {
			await dispatchAtCenter('.ils-mention', 'mousemove');
			const link = browser.$('.ils-tooltip-link');
			await expect(link).toHaveText('Deploy Runbook');
			await clickViaJs('.ils-tooltip-link');
		}

		const buffer = await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			return view?.editor.getValue();
		});
		expect(buffer).toContain(
			'Follow the [[Deploy Runbook|Production Rollout Guide]] before deploying.',
		);
	});
});
