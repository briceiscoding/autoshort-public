// Output formats: the short (9:16) stays exactly as before, a YouTube video (16:9) gets 1920 x 1080 and its own layers.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {FORMAT_LAYERS, layersOf} from '../src/composition/formats';
import {LANDSCAPE_TEMPLATES} from '../src/composition/formats/landscape';
import {TEMPLATES} from '../src/composition/diagrams/templates';
import {bgRect, fullFrameFits, subscribeRect} from '../src/composition/geometry';
import {buildEdl} from '../src/edl/buildEdl';
import {lintPlan} from '../src/lint/lint';
import {defaultTheme, defaultThemeOf} from '../src/model/loadTheme';
import {parsePlan, type Plan} from '../src/model/plan';

// The sample plan with two full frame pictures: a vertical one and a 3:2 one.
const sample = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../fixtures/sample/plan.json'), 'utf-8'));
const raw = {
	...sample,
	assets: [
		...sample.assets,
		{id: 'portrait_pic', file: 'assets/portrait_pic.png', kind: 'image', width: 333, height: 569},
		{id: 'wide_pic', file: 'assets/wide_pic.png', kind: 'image', width: 3333, height: 2206},
	],
	cutIns: [
		{id: 'a0', asset: 'portrait_pic', mode: 'full', start: 2, end: 3.5},
		{id: 'a1', asset: 'wide_pic', mode: 'full', start: 8, end: 9.5},
	],
};
const short = parsePlan(raw);
const landscapeTheme = defaultThemeOf('landscape');
// The same edit as a 16:9 project: a 1920 x 1080 rush kept whole.
const landscape: Plan = parsePlan({
	...raw,
	output: {...raw.output, format: 'landscape'},
	source: {...raw.source, width: 1920, height: 1080, crop: {x: 0, y: 0, width: 1920, height: 1080}},
});

describe('formats', () => {
	it('keeps the short EDL as it was', () => {
		const edl = buildEdl(short, defaultTheme);
		expect([edl.width, edl.height, edl.format]).toEqual([1080, 1920, 'short']);
		expect(defaultThemeOf('short')).toBe(defaultTheme);
		expect(defaultThemeOf()).toBe(defaultTheme);
	});

	it('builds a 1920 x 1080 EDL for a YouTube 16:9 project', () => {
		const edl = buildEdl(landscape, landscapeTheme);
		expect([edl.width, edl.height, edl.format]).toEqual([1920, 1080, 'landscape']);
		expect(edl.crop).toEqual({x: 0, y: 0, width: 1920, height: 1080, sourceWidth: 1920});
		// Same edit (segments, captions), another frame.
		const shortEdl = buildEdl(short, defaultTheme);
		expect(edl.segments).toEqual(shortEdl.segments);
		expect(edl.captions.length).toBe(shortEdl.captions.length);
	});

	it('shares the brand and lays text out for 16:9', () => {
		expect(landscapeTheme.colors).toEqual(defaultTheme.colors);
		expect(landscapeTheme.textStyles.caption.font).toBe(defaultTheme.textStyles.caption.font);
		const {caption} = landscapeTheme.textStyles;
		expect(caption.x).toBe(960);
		expect(caption.y).toBeLessThan(1080);
	});

	it('picks the layers of each format', () => {
		expect(layersOf(undefined)).toBe(FORMAT_LAYERS.short);
		expect(layersOf('short').diagrams).toBe(TEMPLATES);
		expect(layersOf('landscape')).toBe(FORMAT_LAYERS.landscape);
		expect(Object.keys(LANDSCAPE_TEMPLATES).sort()).toEqual(Object.keys(TEMPLATES).sort());
		expect(LANDSCAPE_TEMPLATES.flow).not.toBe(TEMPLATES.flow);
		expect(FORMAT_LAYERS.landscape.Gauge).not.toBe(FORMAT_LAYERS.short.Gauge);
	});

	it('keeps the short geometry and sizes 16:9 cards from its theme', () => {
		expect(bgRect({aspect: 1, width: undefined, x: undefined, y: undefined}, defaultTheme)).toEqual({x: 90, y: 200, w: 900, h: 900});
		expect(bgRect({aspect: 1, width: undefined, x: undefined, y: undefined}, landscapeTheme)).toEqual({x: 410, y: -100, w: 1100, h: 1100});
		// The subscribe clip (1080 x 1920) keeps its shape on both formats: unchanged for the short.
		expect(subscribeRect({x: 332, y: -72, scale: 0.33})).toEqual({x: 332, y: -72, w: 1080 * 0.33, h: 1920 * 0.33});
	});

	it('only lets pictures of the frame shape fill it', () => {
		const portrait = {width: 1080, height: 1920};
		const wide = {width: 1920, height: 1080};
		expect(fullFrameFits(9 / 16, portrait)).toBe(true);
		expect(fullFrameFits(16 / 9, portrait)).toBe(false);
		expect(fullFrameFits(16 / 9, wide)).toBe(true);
		expect(fullFrameFits(9 / 16, wide)).toBe(false);
		// Two full pictures: a 3:2 one (wrong in a short, right in 16:9) and a vertical one (the reverse).
		const flagged = (p: Plan, theme = defaultTheme) =>
			lintPlan(p, theme, null)
				.filter((w) => w.rule === 'image-mode')
				.map((w) => w.message.split('"')[1]);
		expect(flagged(short)).toEqual(['wide_pic']);
		expect(flagged(landscape, landscapeTheme)).toEqual(['portrait_pic']);
	});
});
