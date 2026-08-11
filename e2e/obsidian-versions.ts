import { parseObsidianVersions } from 'wdio-obsidian-service';

// `process` as a global, not an import: importing node:process trips the
// registry scan's no-nodejs-modules check, even though nothing in e2e/ is
// bundled into the plugin.
const { env } = process;

/**
 * Resolves the Obsidian app/installer version(s) to test against, shared by
 * wdio.conf.mts and wdio.mobile-emulation.conf.mts so both configs and CI's
 * cache key agree on the same resolution. Override with OBSIDIAN_VERSIONS,
 * e.g. "earliest/earliest latest/latest".
 */
export async function resolveObsidianVersion(cacheDir: string): Promise<[string, string]> {
	const versions = await parseObsidianVersions(env.OBSIDIAN_VERSIONS ?? 'latest/latest', { cacheDir });
	const version = versions[0];
	if (!version) throw new Error(`OBSIDIAN_VERSIONS resolved to no versions: ${env.OBSIDIAN_VERSIONS}`);
	if (env.CI) {
		// Printed so CI can hash it into the Obsidian binary cache key (see ci.yml).
		console.debug('obsidian-cache-key:', JSON.stringify(version));
	}
	return version;
}
