/**
 * When a mention matches more than one note ("Rollout Plan" is a note title
 * and an alias of "Deployment Plan"), the command can't pick for the user, so
 * it opens the target menu at the mention. Separate spec file from
 * e2e/specs/12-command-linking.e2e.ts: each file gets its own Obsidian
 * session, and a vault reset after a test that edited a note doesn't reliably
 * restore the open editor.
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

/**
 * Right after a vault reset the alias may still be missing from the metadata
 * cache, and the reindex that picks it up is debounced — until then the
 * mention resolves to one note and the command would link it outright. Poll
 * the plugin's own index instead of sleeping. The index is swapped into the
 * open editors in the same tick it's built, so nothing else needs waiting for.
 */
async function waitForAmbiguity(path: string, text: string): Promise<void> {
	await browser.waitUntil(
		() =>
			browser.executeObsidian(
				({ plugins }, path, text) => {
					const { matcher } = plugins.inlineLinkSuggestions as unknown as {
						matcher?: {
							findMentions(
								text: string,
								path: string,
							): Array<{ targets: Array<{ path: string }> }>;
						};
					};
					const mentions = matcher?.findMentions(text, path) ?? [];
					return mentions.some((m) => new Set(m.targets.map((t) => t.path)).size > 1);
				},
				path,
				text,
			),
		{ timeoutMsg: `"${text}" never resolved to more than one note` },
	);
}

describe('ambiguous mention linking via command', function () {
	it('offers both targets in a menu and links the chosen one', async function () {
		await obsidianPage.resetVault();
		await obsidianPage.openFile('Ambiguous Mention.md');
		await waitForLaidOut('.ils-mention');
		await waitForAmbiguity('Ambiguous Mention.md', 'Follow the Rollout Plan closely.');

		await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (!view) throw new Error('no active markdown view');
			const line = view.editor
				.getValue()
				.split('\n')
				.findIndex((l) => l.startsWith('Follow'));
			view.editor.setCursor({ line, ch: view.editor.getLine(line).indexOf('Rollout Plan') + 1 });
			const { commands } = app as typeof app & {
				commands: { executeCommandById(id: string): boolean };
			};
			commands.executeCommandById('inline-link-suggestions:link-mention-at-cursor');
		});

		await clickMenuItemContaining('Link to "Deployment Plan"');

		const buffer = await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			return view?.editor.getValue();
		});
		expect(buffer).toContain('Follow the [[Deployment Plan|Rollout Plan]] closely.');
	});
});
