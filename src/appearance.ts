/** Line style of the mention underline (a CSS `text-decoration-style` value). */
export type UnderlineStyle = 'dotted' | 'dashed' | 'solid' | 'wavy';

/**
 * Underline color. The named ones are theme variables, so they keep working in
 * any theme and in both light and dark mode; 'custom' uses underlineCustomColor.
 */
export type UnderlineColor = 'faint' | 'muted' | 'accent' | 'custom';

/** The part of the settings that only affects how a mention is drawn. */
export interface UnderlineAppearance {
	underlineStyle: UnderlineStyle;
	/** Underline thickness in pixels. */
	underlineThickness: number;
	underlineColor: UnderlineColor;
	/** Only used when underlineColor is 'custom'. */
	underlineCustomColor: string;
}

export const DEFAULT_APPEARANCE: UnderlineAppearance = {
	underlineStyle: 'dotted',
	underlineThickness: 1,
	underlineColor: 'faint',
	underlineCustomColor: '#888888',
};

/**
 * The CSS custom properties that styles.css reads for the mention underline.
 * Returned as a plain map so applying and testing stay independent of the DOM.
 */
export function underlineVars(appearance: UnderlineAppearance): Record<string, string> {
	const color =
		appearance.underlineColor === 'custom'
			? appearance.underlineCustomColor
			: `var(--text-${appearance.underlineColor})`;
	return {
		'--ils-underline-style': appearance.underlineStyle,
		'--ils-underline-thickness': `${appearance.underlineThickness}px`,
		'--ils-underline-color': color,
	};
}
