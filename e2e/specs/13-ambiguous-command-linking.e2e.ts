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
 * Right after a vault reset the alias may not be in the metadata cache yet,
 * which would make the mention look unambiguous. Wait for the cache, then for
 * the plugin's debounced reindex (500 ms in src/main.ts).
 */
async function waitForAliasIndexed(path: string, alias: string): Promise<void> {
	await browser.waitUntil(
		() =>
			browser.executeObsidian(({ app, obsidian }, path, alias) => {
				const file = app.vault.getAbstractFileByPath(path);
				const frontmatter =
					file instanceof obsidian.TFile
						? app.metadataCache.getFileCache(file)?.frontmatter
						: undefined;
				const aliases: unknown = frontmatter?.aliases;
				return Array.isArray(aliases) && aliases.includes(alias);
			}, path, alias),
		{ timeoutMsg: `"${alias}" never showed up as an alias of ${path}` },
	);
	await browser.pause(700);
}

describe('ambiguous mention linking via command', function () {
	it('offers both targets in a menu and links the chosen one', async function () {
		await obsidianPage.resetVault();
		await obsidianPage.openFile('Ambiguous Mention.md');
		await waitForLaidOut('.ils-mention');
		await waitForAliasIndexed('Deployment Plan.md', 'Rollout Plan');

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
