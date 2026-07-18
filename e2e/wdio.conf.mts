import * as path from 'node:path';
import * as url from 'node:url';
import { resolveObsidianVersion } from './obsidian-versions';

const e2eDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(e2eDir, '..');
const cacheDir = path.join(root, '.obsidian-cache');

const [appVersion, installerVersion] = await resolveObsidianVersion(cacheDir);

export const config: WebdriverIO.Config = {
	runner: 'local',
	framework: 'mocha',
	specs: [path.join(e2eDir, 'specs/**/*.e2e.ts')],
	maxInstances: 1,

	capabilities: [
		{
			browserName: 'obsidian',
			'wdio:obsidianOptions': {
				appVersion,
				installerVersion,
				plugins: [root],
				vault: path.join(e2eDir, 'vaults/simple'),
			},
		},
	],

	services: ['obsidian'],
	reporters: ['obsidian'],

	cacheDir,
	mochaOpts: {
		ui: 'bdd',
		timeout: 60_000,
		retries: 0,
	},
	logLevel: 'warn',
};
