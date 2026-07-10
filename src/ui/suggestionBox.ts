import { setIcon } from 'obsidian';
import { dedupeTargets } from '../core/matcher';
import type { LinkTarget, Mention } from '../core/types';

export interface SuggestionCallbacks {
	onLink(target: LinkTarget): void;
	onIgnore(): void;
}

/**
 * The content of a suggestion popup: one link-icon + note-title button per
 * candidate target, and an ignore button. Shared by the editor hover
 * tooltip and the reading-view popover.
 */
export function buildSuggestionBox(mention: Mention, cb: SuggestionCallbacks): HTMLElement {
	const dom = createDiv({ cls: 'ils-tooltip' });

	for (const target of dedupeTargets(mention.targets)) {
		const link = dom.createEl('button', { cls: 'ils-tooltip-link' });
		const icon = link.createSpan({ cls: 'ils-tooltip-link-icon' });
		setIcon(icon, 'link');
		link.createSpan({ cls: 'ils-tooltip-link-title', text: target.title });
		link.setAttribute('aria-label', `Link to ${target.path}`);
		link.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			cb.onLink(target);
		});
	}

	const ignore = dom.createEl('button', { cls: 'ils-tooltip-ignore' });
	setIcon(ignore, 'x');
	ignore.setAttribute('aria-label', `Ignore "${mention.text}" everywhere`);
	ignore.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		cb.onIgnore();
	});

	return dom;
}
