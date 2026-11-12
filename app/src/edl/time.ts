// Rush time <-> output time mapping, shared by the EDL builder, the linter and the UI.
import type {Plan, Span, Word} from '../model/plan';

export const round3 = (x: number): number => Math.round((x + Number.EPSILON) * 1000) / 1000;

export type KeptSegment = {
	id: string;
	srcStart: number;
	srcEnd: number;
	outStart: number;
	outEnd: number;
	span: Span;
};

// Kept spans laid end to end in output time.
export const keptSegments = (plan: Pick<Plan, 'spans'>): KeptSegment[] => {
	const out: KeptSegment[] = [];
	let cursor = 0;
	for (const span of [...plan.spans].sort((a, b) => a.start - b.start)) {
		if (!span.keep || span.end <= span.start) continue;
		const duration = span.end - span.start;
		out.push({
			id: span.id,
			srcStart: span.start,
			srcEnd: span.end,
			outStart: round3(cursor),
			outEnd: round3(cursor + duration),
			span,
		});
		cursor += duration;
	}
	return out;
};

export const outputDuration = (segments: KeptSegment[]): number =>
	segments.length ? segments[segments.length - 1].outEnd : 0;

const toOutputIn = (t: number, s: KeptSegment): number =>
	round3(s.outStart + Math.min(Math.max(t, s.srcStart), s.srcEnd) - s.srcStart);

// Output time of a rush time; a time inside a cut maps to the next kept instant.
export const rushToOutput = (segments: KeptSegment[], t: number): number => {
	for (const s of segments) if (t <= s.srcEnd) return toOutputIn(t, s);
	return outputDuration(segments);
};

// Rush time of an output time (inverse mapping, used by the UI to move events).
export const outputToRush = (segments: KeptSegment[], t: number): number => {
	for (const s of segments) if (t <= s.outEnd) return round3(s.srcStart + Math.max(0, t - s.outStart));
	return segments.length ? segments[segments.length - 1].srcEnd : 0;
};

// The kept segment a word is spoken in (same tolerance as the legacy make_plan.py).
export const segmentOfWord = (segments: KeptSegment[], w: Word): KeptSegment | undefined =>
	segments.find((s) => s.srcStart - 0.03 <= w.start && w.start < s.srcEnd - 0.005);

export const isRushTimeKept = (segments: KeptSegment[], t: number): boolean =>
	segments.some((s) => t >= s.srcStart && t < s.srcEnd);
