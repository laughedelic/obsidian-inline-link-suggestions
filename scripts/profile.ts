// Profile index build + viewport scan at 10k-vault scale.
// Usage: node scripts/profile.ts [note-count]

import { LiteralMatcher } from '../src/core/matcher.ts';
import type { NoteEntry } from '../src/core/types.ts';

const count = Number(process.argv[2] ?? 10000);

// Realistic titles: multi-word, shared vocabulary, some aliases.
const words = [
	'project', 'meeting', 'design', 'review', 'kubernetes', 'garden', 'recipe',
	'travel', 'budget', 'health', 'reading', 'music', 'theory', 'systems',
	'notes', 'ideas', 'draft', 'plan', 'weekly', 'archive',
];
const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
const notes: NoteEntry[] = Array.from({ length: count }, (_, i) => {
	const a = words[i % words.length]!;
	const b = words[(i * 7 + 3) % words.length]!;
	return {
		path: `notes/${cap(a)} ${cap(b)} ${i}.md`,
		title: `${cap(a)} ${cap(b)} ${i}`,
		aliases: i % 5 === 0 ? [`${a}-${b}-${i}`] : [],
	};
});

const t0 = performance.now();
const matcher = new LiteralMatcher(notes);
const buildMs = performance.now() - t0;
console.log(`index build: ${count} notes, ${matcher.termCount} terms in ${buildMs.toFixed(1)}ms`);

// A viewport is roughly 50-100 lines; simulate ~8KB of prose with hits.
const hit1 = notes[42]!.title;
const hit2 = notes[7]!.title.toLowerCase(); // case-insensitive path
const hit3 = notes[40]!.aliases[0]!;
const paragraph =
	`Discussed ${hit1} with the team, comparing kubernetes-adjacent ` +
	`setups against ${hit2} and the ${hit3} archive from last spring. `;
const viewport = paragraph.repeat(50); // ~8.5KB
const runs = 200;
const t1 = performance.now();
let mentions = 0;
for (let i = 0; i < runs; i++) mentions += matcher.findMentions(viewport).length;
const scanMs = (performance.now() - t1) / runs;
console.log(
	`viewport scan: ${viewport.length} chars, ${mentions / runs} mentions, ` +
		`${scanMs.toFixed(2)}ms per scan (avg of ${runs})`,
);
