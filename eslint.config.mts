import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		// Agent worktrees: copies of this repo, linted in their own checkout.
		'.claude',
		'test-vault',
		'scripts',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// The rule's built-in brand list contains "Cursor" (the editor), so
			// it wants to capitalize the text caret in our command names. The
			// brand list isn't exported, so exempt those two strings instead.
			'obsidianmd/ui/sentence-case': ['warn', { ignoreRegex: ['mention at cursor$'] }],
		},
	},
	{
		// The settings tab implements both APIs: getSettingDefinitions() for
		// 1.13+ and display() as the fallback for older versions. The 1.13-only
		// SettingTab methods are called from the declarative definitions, which
		// older Obsidian never renders, so they're safe below manifest.json's
		// minAppVersion — but anything newer than 1.13 still gets flagged.
		files: ['src/settings.ts'],
		rules: {
			'obsidianmd/no-unsupported-api': ['error', { minAppVersion: '1.13.0' }],
		},
	},
	{
		// e2e/ is Node-side test tooling (wdio-obsidian-service), not code
		// shipped into the plugin bundle, so the mobile/no-Node-API rules
		// don't apply, and mocha/webdriverio's ambient types cover what
		// no-undef (a non-type-aware rule) can't see.
		files: ['e2e/**/*.ts', 'e2e/**/*.mts'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.mocha,
			},
		},
		rules: {
			'no-undef': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
