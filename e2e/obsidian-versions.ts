import { parseObsidianVersions } from 'wdio-obsidian-service';
import { env } from 'node:process';

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
