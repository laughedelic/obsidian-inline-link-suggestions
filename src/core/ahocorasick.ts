/**
 * Compact Aho-Corasick automaton over UTF-16 code units.
 *
 * Built once per index rebuild, then scanned over viewport-sized text on
 * every editor update, so scan speed matters more than build speed.
 */

export interface RawMatch {
	patternId: number;
	start: number;
	end: number;
}

export class AhoCorasick {
	private next: Array<Map<string, number>> = [new Map<string, number>()];
	private fail: number[] = [0];
	/** Pattern ids terminating at each node (incl. via suffix links after build). */
	private out: number[][] = [[]];
	private patternLengths: number[] = [];
	private built = false;

	/** Add a pattern; returns its id. Pattern must be non-empty. */
	add(pattern: string): number {
		if (this.built) throw new Error('automaton already built');
		if (pattern.length === 0) throw new Error('empty pattern');
		let node = 0;
		for (const ch of splitUnits(pattern)) {
			let child = this.next[node]!.get(ch);
			if (child === undefined) {
				child = this.next.length;
				this.next.push(new Map<string, number>());
				this.fail.push(0);
				this.out.push([]);
				this.next[node]!.set(ch, child);
			}
			node = child;
		}
		const id = this.patternLengths.length;
		this.patternLengths.push(pattern.length);
		this.out[node]!.push(id);
		return id;
	}

	/** Compute failure links (BFS) and merge suffix outputs. Call once. */
	build(): void {
		if (this.built) return;
		this.built = true;
		const queue: number[] = [];
		for (const child of this.next[0]!.values()) {
			this.fail[child] = 0;
			queue.push(child);
		}
		for (let qi = 0; qi < queue.length; qi++) {
			const node = queue[qi]!;
			for (const [ch, child] of this.next[node]!) {
				queue.push(child);
				let f = this.fail[node]!;
				while (f !== 0 && !this.next[f]!.has(ch)) f = this.fail[f]!;
				const link = this.next[f]!.get(ch) ?? 0;
				const failLink = link === child ? 0 : link;
				this.fail[child] = failLink;
				const linkOut = this.out[failLink]!;
				if (linkOut.length > 0) this.out[child]!.push(...linkOut);
			}
		}
	}

	/** Scan text, invoking `onMatch` for every pattern occurrence. */
	scan(text: string, onMatch: (m: RawMatch) => void): void {
		if (!this.built) throw new Error('call build() first');
		let node = 0;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i]!;
			while (node !== 0 && !this.next[node]!.has(ch)) node = this.fail[node]!;
			node = this.next[node]!.get(ch) ?? 0;
			const outs = this.out[node]!;
			for (let k = 0; k < outs.length; k++) {
				const patternId = outs[k]!;
				const end = i + 1;
				onMatch({ patternId, start: end - this.patternLengths[patternId]!, end });
			}
		}
	}
}

function splitUnits(s: string): string[] {
	const units: string[] = [];
	for (let i = 0; i < s.length; i++) units.push(s[i]!);
	return units;
}
