import * as path from 'node:path';
import * as url from 'node:url';

const e2eDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(e2eDir, '..');

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
