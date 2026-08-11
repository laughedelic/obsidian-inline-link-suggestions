/**
 * The keyboard path: no pointer involved. The commands ship without a default
 * hotkey, so they're invoked here exactly as a user-bound key would invoke
 * them — through the command id. See e2e/specs/10-mention-linking.e2e.ts for
 * the pointer-driven equivalent.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

/**
 * Runs a plugin command by id. Note that Obsidian's return value only says
 * the command was dispatched, not that its check callback passed — assert on
 * the document instead.
 */
async function runCommand(id: string): Promise<void> {
	await browser.executeObsidian(({ app }, id) => {
		const { commands } = app as typeof app & {
			commands: { executeCommandById(id: string): boolean };
		};
		commands.executeCommandById(id);
	}, id);
}

/** Puts the cursor inside `word` on the first line containing it. */
async function putCursorIn(word: string): Promise<void> {
	await browser.executeObsidian(({ app, obsidian }, word) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no active markdown view');
		const line = view.editor.getValue().split('\n').findIndex((l) => l.includes(word));
		if (line < 0) throw new Error(`"${word}" is not in the document`);
		view.editor.setCursor({ line, ch: view.editor.getLine(line).indexOf(word) + 1 });
	}, word);
}

async function editorValue(): Promise<string | undefined> {
	return browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		return view?.editor.getValue();
	});
}

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

describe('linking via command', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await obsidianPage.openFile('Notes.md');
		await waitForLaidOut('.ils-mention');
	});

	it('does nothing when the cursor is not in a mention', async function () {
		const before = await editorValue();
		await putCursorIn('# Notes');
		await runCommand('inline-link-suggestions:link-mention-at-cursor');
		expect(await editorValue()).toBe(before);
	});

	it('links the mention at the cursor', async function () {
		await putCursorIn('Kubernetes');
		await runCommand('inline-link-suggestions:link-mention-at-cursor');
		expect(await editorValue()).toContain('Deploying to [[Kubernetes]] today.');
	});
});
