// Rough cut: the rush with its silences cut, in its own size and frame rate, with nothing added on it.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {buildEdl} from '../src/edl/buildEdl';
import {lintPlan} from '../src/lint/lint';
import {defaultTheme, defaultThemeOf} from '../src/model/loadTheme';
import {parsePlan} from '../src/model/plan';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../fixtures/sample/plan.json'), 'utf-8'));
// The sample plan turned into a rough cut of a 1920 x 1080 rush at 29.97 fps (an odd height is rounded for H.264).
const rough = parsePlan({
	...raw,
	output: {format: 'rough'},
	source: {...raw.source, width: 1920, height: 1081, fps: 29.97, crop: {x: 0, y: 0, width: 1920, height: 1081}},
	subscribe: null,
});

describe('rough cut', () => {
	it('keeps the rush size and frame rate, without captions or sound effects', () => {
		const edl = buildEdl(rough, defaultThemeOf('rough'));
		expect([edl.format, edl.width, edl.height, edl.fps]).toEqual(['rough', 1920, 1082, 29.97]);
		expect(edl.captions).toEqual([]);
		expect(edl.sfx).toEqual([]);
		expect(edl.overlaySubscribe).toBeNull();
		// Same cuts as the short it came from.
		expect(edl.durationAfter).toBe(buildEdl(parsePlan(raw), defaultTheme).durationAfter);
		expect(defaultThemeOf('rough')).toBe(defaultTheme);
	});

	it('has no duration, hook or loudness check', () => {
		const analysis = {schemaVersion: 1, exports: [{file: 'x_v1.mp4', at: '', integratedLufs: -30, truePeakDb: 0}]};
		const long = parsePlan({...rough, spans: rough.spans.map((s) => ({...s, keep: true}))});
		const rules = lintPlan(long, defaultTheme, analysis as never).map((w) => w.rule);
		for (const rule of ['duration', 'hook', 'true-peak', 'loudness']) expect(rules).not.toContain(rule);
	});
});
