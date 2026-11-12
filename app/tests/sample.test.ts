// The sample plan (fixtures/sample) goes through the same code as the preview: EDL, one-line captions, checks.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {buildEdl} from '../src/edl/buildEdl';
import {lintPlan} from '../src/lint/lint';
import {defaultTheme} from '../src/model/loadTheme';
import {parsePlan} from '../src/model/plan';
import * as ops from '../src/ui/ops';

const plan = parsePlan(JSON.parse(readFileSync(resolve(import.meta.dirname, '../../fixtures/sample/plan.json'), 'utf-8')));

describe('sample plan', () => {
	it('keeps the whole rush and captions every spoken word', () => {
		const edl = buildEdl(plan, defaultTheme);
		expect(edl.durationAfter).toBeCloseTo(plan.source.duration, 1);
		expect(edl.captions.flatMap((b) => b.words).length).toBe(plan.words.length);
		expect(edl.overlaySubscribe).not.toBeNull();
	});

	it('caption blocks fit on one line; a merged block is flagged, re-splitting fixes it', () => {
		expect(lintPlan(plan, defaultTheme, null).map((w) => w.rule)).not.toContain('caption-length');
		const words = [...plan.words].sort((a, b) => a.start - b.start);
		let merged = plan;
		for (const w of words.slice(1, 10)) merged = ops.updateWord(merged, w.id, {blockStart: undefined});
		expect(lintPlan(merged, defaultTheme, null).map((w) => w.rule)).toContain('caption-length');
		const resplit = {...merged, words: ops.autoBlocks(merged.words, defaultTheme.captions.maxWords, defaultTheme.captions.maxLineChars)};
		expect(lintPlan(resplit, defaultTheme, null).map((w) => w.rule)).not.toContain('caption-length');
	});

	it('cutting and restoring words is undoable data, not a render', () => {
		const words = [...plan.words].sort((a, b) => a.start - b.start);
		const cut = ops.cutWords(plan, words[2].id, words[4].id);
		expect(buildEdl(cut, defaultTheme).durationAfter).toBeLessThan(buildEdl(plan, defaultTheme).durationAfter);
		const restored = ops.restoreRange(cut, words[2].start, words[4].end);
		expect(buildEdl(restored, defaultTheme).durationAfter).toBeCloseTo(buildEdl(plan, defaultTheme).durationAfter, 3);
	});
});
