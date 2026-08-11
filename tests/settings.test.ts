import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, underlineVars } from '../src/appearance';

describe('underlineVars', () => {
	it('maps the defaults to the subtle dotted underline', () => {
		expect(underlineVars(DEFAULT_APPEARANCE)).toEqual({
			'--ils-underline-style': 'dotted',
			'--ils-underline-thickness': '1px',
			'--ils-underline-color': 'var(--text-faint)',
		});
	});

	it('uses a theme variable for the named colors', () => {
		const vars = underlineVars({ ...DEFAULT_APPEARANCE, underlineColor: 'accent' });
		expect(vars['--ils-underline-color']).toBe('var(--text-accent)');
	});

	it('uses the picked color only when the mode is custom', () => {
		const settings = { ...DEFAULT_APPEARANCE, underlineCustomColor: '#ff0000' };
		expect(underlineVars(settings)['--ils-underline-color']).toBe('var(--text-faint)');
		expect(underlineVars({ ...settings, underlineColor: 'custom' })['--ils-underline-color']).toBe(
			'#ff0000',
		);
	});

	it('renders thickness in pixels', () => {
		const vars = underlineVars({
			...DEFAULT_APPEARANCE,
			underlineStyle: 'wavy',
			underlineThickness: 3,
		});
		expect(vars['--ils-underline-style']).toBe('wavy');
		expect(vars['--ils-underline-thickness']).toBe('3px');
	});
});
