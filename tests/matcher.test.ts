import { describe, expect, it } from 'vitest';
import { AhoCorasick } from '../src/core/ahocorasick';
import { foldCase, LiteralMatcher } from '../src/core/matcher';
import type { NoteEntry } from '../src/core/types';

function note(title: string, aliases: string[] = [], path?: string): NoteEntry {
	return { path: path ?? `${title}.md`, title, aliases };
}

describe('AhoCorasick', () => {
	it('finds all overlapping occurrences', () => {
		const ac = new AhoCorasick();
		const ids = ['he', 'she', 'his', 'hers'].map((p) => ac.add(p));
		ac.build();
		const found: Array<[number, number, number]> = [];
		ac.scan('ushers', (m) => found.push([m.patternId, m.start, m.end]));
		expect(found).toContainEqual([ids[1]!, 1, 4]); // she
		expect(found).toContainEqual([ids[0]!, 2, 4]); // he
		expect(found).toContainEqual([ids[3]!, 2, 6]); // hers
		expect(found).toHaveLength(3);
	});

	it('finds repeated occurrences', () => {
		const ac = new AhoCorasick();
		ac.add('aba');
		ac.build();
		const starts: number[] = [];
		ac.scan('abababa', (m) => starts.push(m.start));
		expect(starts).toEqual([0, 2, 4]);
	});
});

describe('LiteralMatcher', () => {
	it('matches note titles case-insensitively by default', () => {
		const m = new LiteralMatcher([note('Kubernetes')]);
		const mentions = m.findMentions('deploying to kubernetes today');
		expect(mentions).toHaveLength(1);
		expect(mentions[0]!.text).toBe('kubernetes');
		expect(mentions[0]!.targets[0]!.title).toBe('Kubernetes');
	});

	it('respects case sensitivity when enabled', () => {
		const m = new LiteralMatcher([note('Kubernetes')], { caseSensitive: true });
		expect(m.findMentions('deploying to kubernetes')).toHaveLength(0);
		expect(m.findMentions('deploying to Kubernetes')).toHaveLength(1);
	});

	it('enforces word boundaries', () => {
		const m = new LiteralMatcher([note('cat')]);
		expect(m.findMentions('concatenate cats')).toHaveLength(0);
		expect(m.findMentions('my cat sleeps')).toHaveLength(1);
		expect(m.findMentions('cat!')).toHaveLength(1);
		expect(m.findMentions('(cat)')).toHaveLength(1);
	});

	it('handles unicode word boundaries', () => {
		const m = new LiteralMatcher([note('гора')]);
		expect(m.findMentions('высокогорье')).toHaveLength(0);
		expect(m.findMentions('на гора!')).toHaveLength(1);
	});

	it('matches multi-word titles', () => {
		const m = new LiteralMatcher([note('Machine Learning')]);
		const mentions = m.findMentions('intro to machine learning basics');
		expect(mentions).toHaveLength(1);
		expect(mentions[0]!.text).toBe('machine learning');
	});

	it('matches aliases and flags them', () => {
		const m = new LiteralMatcher([note('Kubernetes', ['k8s'])]);
		const mentions = m.findMentions('the k8s cluster');
		expect(mentions).toHaveLength(1);
		expect(mentions[0]!.targets[0]!.isAlias).toBe(true);
		expect(mentions[0]!.targets[0]!.title).toBe('Kubernetes');
	});

	it('prefers the longest match on overlap', () => {
		const m = new LiteralMatcher([note('Machine Learning'), note('Learning')]);
		const mentions = m.findMentions('about machine learning here');
		expect(mentions).toHaveLength(1);
		expect(mentions[0]!.text).toBe('machine learning');
	});

	it('reports non-overlapping matches for multiple notes', () => {
		const m = new LiteralMatcher([note('Python'), note('Rust')]);
		const mentions = m.findMentions('Python is friendlier than Rust');
		expect(mentions.map((x) => x.text)).toEqual(['Python', 'Rust']);
	});

	it('merges ambiguous targets on the same span', () => {
		const m = new LiteralMatcher([
			note('Mercury', [], 'planets/Mercury.md'),
			note('Mercury', [], 'elements/Mercury.md'),
		]);
		const mentions = m.findMentions('mercury is fascinating');
		expect(mentions).toHaveLength(1);
		expect(mentions[0]!.targets).toHaveLength(2);
	});

	it('excludes the note being edited', () => {
		const m = new LiteralMatcher([note('Python')]);
		expect(m.findMentions('Python rocks', 'Python.md')).toHaveLength(0);
		expect(m.findMentions('Python rocks', 'Other.md')).toHaveLength(1);
	});

	it('skips terms below the minimum length', () => {
		const m = new LiteralMatcher([note('Go'), note('Rust')], { minTermLength: 3 });
		expect(m.findMentions('Go and Rust').map((x) => x.text)).toEqual(['Rust']);
	});

	it('skips ignored terms case-insensitively', () => {
		const m = new LiteralMatcher([note('Python'), note('Rust')], {
			ignoredTerms: ['python'],
		});
		expect(m.findMentions('Python and Rust').map((x) => x.text)).toEqual(['Rust']);
	});

	it('can exclude aliases', () => {
		const m = new LiteralMatcher([note('Kubernetes', ['k8s cluster'])], {
			includeAliases: false,
		});
		expect(m.findMentions('the k8s cluster')).toHaveLength(0);
	});

	it('handles adjacent repeated mentions', () => {
		const m = new LiteralMatcher([note('foo')]);
		expect(m.findMentions('foo foo foo')).toHaveLength(3);
	});

	it('scales to many notes', () => {
		const notes = Array.from({ length: 10000 }, (_, i) =>
			note(`Note Number ${i}`, [`alias-${i}`]),
		);
		const start = performance.now();
		const m = new LiteralMatcher(notes);
		const buildMs = performance.now() - start;
		expect(m.termCount).toBe(20000);
		expect(buildMs).toBeLessThan(2000);

		const text = 'Discussing Note Number 9999 and alias-42 in one paragraph. '.repeat(50);
		const scanStart = performance.now();
		const mentions = m.findMentions(text);
		const scanMs = performance.now() - scanStart;
		expect(mentions).toHaveLength(100);
		expect(scanMs).toBeLessThan(100);
	});
});

describe('foldCase', () => {
	it('lowercases while preserving length', () => {
		expect(foldCase('HeLLo')).toBe('hello');
		const tricky = 'İstanbul'; // İ lowercases to 2 code units
		expect(foldCase(tricky).length).toBe(tricky.length);
	});
});
