import * as path from 'node:path';
import * as url from 'node:url';

const e2eDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(e2eDir, '..');

/**
 * Mobile-emulation variant of wdio.conf.mts: identical plugin/vault/specs,
 * run under Obsidian's own `app.emulateMobile()` instead — still the
 * Electron desktop app under a phone-sized viewport, not the real Capacitor
 * mobile app. See README's "Mobile testing" section for what this does and
 * doesn't cover.
 */
export const config: WebdriverIO.Config = {
	runner: 'local',
	framework: 'mocha',
	specs: [path.join(e2eDir, 'specs/**/*.e2e.ts')],
	maxInstances: 1,

	capabilities: [
		{
			browserName: 'obsidian',
			browserVersion: 'latest',
			'wdio:obsidianOptions': {
				installerVersion: 'latest',
				plugins: [root],
				vault: path.join(e2eDir, 'vaults/simple'),
				emulateMobile: true,
			},
			'goog:chromeOptions': {
				mobileEmulation: {
					// Phone-sized viewport; Obsidian's tablet UI switches in around
					// width/height >= 600, so this stays in "phone" mode. Push both
					// dimensions past 600 to spot-check the tablet layout instead.
					deviceMetrics: { width: 390, height: 844 },
				},
			},
		},
	],

	services: ['obsidian'],
	reporters: ['obsidian'],

	cacheDir: path.join(root, '.obsidian-cache'),
	mochaOpts: {
		ui: 'bdd',
		timeout: 60_000,
		retries: 0,
	},
	logLevel: 'warn',
};
