#!/usr/bin/env node
// Generate a synthetic vault for manual testing and profiling.
// Usage: node scripts/generate-vault.mjs [note-count] [target-dir]

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const count = Number(process.argv[2] ?? 100);
const target = process.argv[3] ?? 'test-vault';

const topics = [
	'Kubernetes', 'Machine Learning', 'Sourdough Baking', 'Rust', 'Python',
	'Distributed Systems', 'Graph Theory', 'Coffee Brewing', 'Bouldering',
	'Photosynthesis', 'Roman Empire', 'Quantum Computing', 'Jazz Piano',
	'Type Systems', 'Fermentation', 'Trail Running', 'Stoicism', 'CRDTs',
];
const aliasPool = { Kubernetes: ['k8s'], 'Machine Learning': ['ML'], Rust: ['rustlang'] };

mkdirSync(join(target, 'notes'), { recursive: true });

for (const topic of topics) {
	const aliases = aliasPool[topic];
	const fm = aliases ? `---\naliases: [${aliases.join(', ')}]\n---\n\n` : '';
	writeFileSync(
		join(target, `${topic}.md`),
		`${fm}# ${topic}\n\nA note about ${topic.toLowerCase()}.\n`,
	);
}

for (let i = 0; i < count; i++) {
	const t1 = topics[i % topics.length];
	const t2 = topics[(i + 7) % topics.length];
	writeFileSync(
		join(target, 'notes', `Note ${i}.md`),
		`# Note ${i}\n\nThinking about ${t1.toLowerCase()} and how it relates to ${t2}. ` +
			`Also mentions machine learning, k8s, and sourdough baking in passing.\n\n` +
			`Already linked: [[${t1}]] should not be underlined. \`${t2}\` in code neither.\n`,
	);
}

// Install the built plugin into the vault.
const pluginDir = join(target, '.obsidian', 'plugins', 'inline-link-suggestions');
mkdirSync(pluginDir, { recursive: true });
for (const f of ['main.js', 'manifest.json', 'styles.css']) {
	cpSync(f, join(pluginDir, f));
}
writeFileSync(
	join(target, '.obsidian', 'community-plugins.json'),
	JSON.stringify(['inline-link-suggestions']),
);

console.log(`Generated ${count + topics.length} notes in ${target}/ with the plugin installed.`);
