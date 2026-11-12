// Pure edit operations on the plan (rush time). Every UI edit goes through one of these, so undo/redo is
// just a stack of plans and the operations are unit tested.
import {keptSegments, outputToRush, round3} from '../edl/time';
import type {Concept, CutIn, Diagram, DiagramElement, Logo, Plan, SfxEvent, Span, Word} from '../model/plan';
import type {FrameStyleKind, FrameStylePatch, TextStyleKind, TextStylePatch} from '../model/theme';

export type EventKind = 'concept' | 'logo' | 'cutIn' | 'gauge' | 'diagram' | 'sfx';

const listKey = {concept: 'concepts', logo: 'logos', cutIn: 'cutIns', gauge: 'gauges', diagram: 'diagrams', sfx: 'sfx'} as const;

export const newId = (prefix: string, existing: {id: string}[]): string => {
	let i = existing.length;
	const ids = new Set(existing.map((e) => e.id));
	while (ids.has(`${prefix}${i}`)) i++;
	return `${prefix}${i}`;
};

const sortedSpans = (plan: Plan): Span[] => [...plan.spans].sort((a, b) => a.start - b.start);

// Merge neighbouring spans that have become identical (same keep and zoom, no reason difference for kept ones).
export const normalizeSpans = (spans: Span[]): Span[] => {
	const out: Span[] = [];
	for (const s of [...spans].sort((a, b) => a.start - b.start)) {
		if (s.end - s.start < 0.001) continue;
		const prev = out[out.length - 1];
		if (prev && !prev.keep && !s.keep) {
			out[out.length - 1] = {...prev, end: s.end};
			continue;
		}
		out.push(s);
	}
	return out;
};

/* ---------------- words ---------------- */

export const updateWord = (plan: Plan, id: string, patch: Partial<Word>): Plan => ({
	...plan,
	words: plan.words.map((w) => {
		if (w.id !== id) return w;
		const next = {...w, ...patch};
		// Keep the first spoken form for traceability when the text is corrected.
		if (patch.text !== undefined && patch.text !== w.text && !w.original) next.original = w.text;
		if (next.original === next.text) delete next.original;
		return next;
	}),
});

const wordsSorted = (plan: Plan): Word[] => [...plan.words].sort((a, b) => a.start - b.start);

/* ---------------- spans and cuts ---------------- */

export const toggleSpan = (plan: Plan, spanId: string): Plan => ({
	...plan,
	spans: normalizeSpans(plan.spans.map((s) => (s.id === spanId ? {...s, keep: !s.keep, reason: s.keep ? 'manual' : s.reason} : s))),
});

export const updateSpan = (plan: Plan, spanId: string, patch: Partial<Span>): Plan => ({
	...plan,
	spans: plan.spans.map((s) => (s.id === spanId ? {...s, ...patch} : s)),
});

// Split the span containing rush time `t` in two (used before toggling zoom on part of a span).
export const splitSpanAt = (plan: Plan, t: number): Plan => {
	const span = plan.spans.find((s) => t > s.start + 0.05 && t < s.end - 0.05);
	if (!span) return plan;
	const right: Span = {...span, id: newId('s', plan.spans), start: round3(t)};
	return {...plan, spans: sortedSpans({...plan, spans: [...plan.spans.filter((s) => s !== span), {...span, end: round3(t)}, right]})};
};

// Cut [start, end) of the rush: kept spans are split around it.
export const cutRange = (plan: Plan, start: number, end: number, reason: Span['reason'] = 'manual'): Plan => {
	if (end - start < 0.01) return plan;
	const out: Span[] = [];
	let counter = plan.spans.length;
	const fresh = () => {
		let id = `s${counter++}`;
		while (plan.spans.some((s) => s.id === id) || out.some((s) => s.id === id)) id = `s${counter++}`;
		return id;
	};
	for (const s of sortedSpans(plan)) {
		if (s.end <= start || s.start >= end) {
			out.push(s);
			continue;
		}
		if (s.start < start) out.push({...s, end: round3(start)});
		out.push({id: fresh(), start: round3(Math.max(s.start, start)), end: round3(Math.min(s.end, end)), keep: false, zoom: false, reason});
		if (s.end > end) out.push({...s, id: s.start < start ? fresh() : s.id, start: round3(end)});
	}
	return {...plan, spans: normalizeSpans(out)};
};

// Cut a run of words: from the end of the previous word to just before the next word (legacy margins).
export const cutWords = (plan: Plan, firstId: string, lastId: string): Plan => {
	const words = wordsSorted(plan);
	const i = words.findIndex((w) => w.id === firstId);
	const j = words.findIndex((w) => w.id === lastId);
	if (i < 0 || j < 0) return plan;
	const [a, b] = i <= j ? [i, j] : [j, i];
	const prev = words[a - 1];
	const next = words[b + 1];
	const start = prev ? Math.max(prev.end, words[a].start - 0.08) : Math.max(0, words[a].start - 0.08);
	const end = next ? Math.max(words[b].end, next.start - 0.02) : Math.min(plan.source.duration, words[b].end + 0.08);
	return cutRange(plan, start, end, 'manual');
};

// Restore (keep) every cut touching [start, end].
export const restoreRange = (plan: Plan, start: number, end: number): Plan => ({
	...plan,
	spans: normalizeSpans(plan.spans.map((s) => (!s.keep && s.start < end && s.end > start ? {...s, keep: true, zoom: false, reason: undefined} : s))),
});

// Word boundaries usable as cut points (word starts and ends).
export const snapPoints = (plan: Plan): number[] => {
	const pts = new Set<number>([0, plan.source.duration]);
	for (const w of plan.words) {
		pts.add(w.start);
		pts.add(w.end);
	}
	return [...pts].sort((a, b) => a - b);
};

// Move the boundary between span `index` and `index + 1` (sorted) to the next/previous word boundary.
export const nudgeBoundary = (plan: Plan, boundary: number, direction: -1 | 1): Plan => {
	const spans = sortedSpans(plan);
	const k = spans.findIndex((s) => Math.abs(s.start - boundary) < 0.0005);
	if (k <= 0) return plan;
	const left = spans[k - 1];
	const right = spans[k];
	const points = snapPoints(plan).filter((p) => p > left.start + 0.05 && p < right.end - 0.05);
	const target = direction > 0 ? points.find((p) => p > boundary + 0.001) : [...points].reverse().find((p) => p < boundary - 0.001);
	if (target === undefined) return plan;
	const t = round3(target);
	return {...plan, spans: spans.map((s) => (s === left ? {...s, end: t} : s === right ? {...s, start: t} : s))};
};

/* ---------------- timed events ---------------- */

type Timed = {id: string; start: number; end: number};

export const getEvents = (plan: Plan, kind: Exclude<EventKind, 'sfx'>): Timed[] => plan[listKey[kind]] as Timed[];

export const updateEvent = <T extends {id: string} = any>(plan: Plan, kind: EventKind, id: string, patch: Partial<T> | Record<string, unknown>): Plan => ({
	...plan,
	[listKey[kind]]: (plan[listKey[kind]] as {id: string}[]).map((e) => (e.id === id ? {...e, ...patch} : e)),
});

export const removeEvent = (plan: Plan, kind: EventKind, id: string): Plan => ({
	...plan,
	[listKey[kind]]: (plan[listKey[kind]] as {id: string}[]).filter((e) => e.id !== id),
});

// Move an event by an OUTPUT time delta (what the user drags), keeping its output duration.
export const moveEvent = (plan: Plan, kind: Exclude<EventKind, 'sfx'>, id: string, outStart: number, outEnd: number): Plan => {
	const segments = keptSegments(plan);
	const start = outputToRush(segments, Math.max(0, outStart));
	const end = outputToRush(segments, Math.max(outStart + 0.05, outEnd));
	const event = getEvents(plan, kind).find((e) => e.id === id);
	if (!event) return plan;
	let next = updateEvent<Timed>(plan, kind, id, {start, end});
	if (kind === 'diagram') {
		// Elements move with their diagram (same rush delta).
		const delta = start - event.start;
		const d = (next.diagrams.find((x) => x.id === id) as Diagram)!;
		next = updateEvent<Diagram>(next, 'diagram', id, {elements: d.elements.map((e) => ({...e, at: round3(Math.max(0, e.at + delta))}))});
	}
	return next;
};

export const moveSfx = (plan: Plan, id: string, outAt: number): Plan =>
	updateEvent<SfxEvent>(plan, 'sfx', id, {at: outputToRush(keptSegments(plan), Math.max(0, outAt))});

export const addConcept = (plan: Plan, text: string, start: number, end: number): Plan => {
	const concept: Concept = {id: newId('c', plan.concepts), text, start: round3(start), end: round3(end)};
	return {...plan, concepts: [...plan.concepts, concept].sort((a, b) => a.start - b.start)};
};

export const addLogo = (plan: Plan, asset: string, start: number, end: number): Plan => {
	const logo: Logo = {id: newId('l', plan.logos), asset, start: round3(start), end: round3(end)};
	return {...plan, logos: [...plan.logos, logo].sort((a, b) => a.start - b.start)};
};

export const addCutIn = (plan: Plan, asset: string, mode: CutIn['mode'], start: number, end: number): Plan => {
	const cutIn: CutIn = {id: newId('a', plan.cutIns), asset, mode, start: round3(start), end: round3(end)};
	return {...plan, cutIns: [...plan.cutIns, cutIn].sort((a, b) => a.start - b.start)};
};

export const addSfx = (plan: Plan, file: string, at: number): Plan => {
	const sfx: SfxEvent = {id: newId('fx', plan.sfx), file, at: round3(at), reason: 'manual'};
	return {...plan, sfx: [...plan.sfx, sfx].sort((a, b) => a.at - b.at)};
};

export const addDiagram = (plan: Plan, template: Diagram['template'], start: number, end: number): Plan => {
	const id = newId('d', plan.diagrams);
	const diagram: Diagram = {
		id,
		template,
		start: round3(start),
		end: round3(end),
		elements: [{id: `${id}_0`, label: 'Label', at: round3(start), draw: 0.4}],
	};
	return {...plan, diagrams: [...plan.diagrams, diagram].sort((a, b) => a.start - b.start)};
};

export const updateElement = (plan: Plan, diagramId: string, elementId: string, patch: Partial<DiagramElement>): Plan => {
	const d = plan.diagrams.find((x) => x.id === diagramId);
	if (!d) return plan;
	return updateEvent<Diagram>(plan, 'diagram', diagramId, {elements: d.elements.map((e) => (e.id === elementId ? {...e, ...patch} : e))});
};

export const addElement = (plan: Plan, diagramId: string, at: number): Plan => {
	const d = plan.diagrams.find((x) => x.id === diagramId);
	if (!d) return plan;
	const element: DiagramElement = {id: newId(`${diagramId}_`, d.elements), label: 'Label', at: round3(at), draw: 0.4};
	return updateEvent<Diagram>(plan, 'diagram', diagramId, {elements: [...d.elements, element]});
};

export const removeElement = (plan: Plan, diagramId: string, elementId: string): Plan => {
	const d = plan.diagrams.find((x) => x.id === diagramId);
	if (!d) return plan;
	return updateEvent<Diagram>(plan, 'diagram', diagramId, {elements: d.elements.filter((e) => e.id !== elementId)});
};

export const moveElement = (plan: Plan, diagramId: string, elementId: string, direction: -1 | 1): Plan => {
	const d = plan.diagrams.find((x) => x.id === diagramId);
	if (!d) return plan;
	const i = d.elements.findIndex((e) => e.id === elementId);
	const j = i + direction;
	if (i < 0 || j < 0 || j >= d.elements.length) return plan;
	const elements = [...d.elements];
	[elements[i], elements[j]] = [elements[j], elements[i]];
	return updateEvent<Diagram>(plan, 'diagram', diagramId, {elements});
};

// Caption auto blocking (2 to 4 words, break after punctuation, never end on an article).
const ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', "l'", 'au', 'aux', 'à', 'en', 'et', 'ou', 'mais', 'que', 'qui', 'sur', 'dans', 'pour', 'par', 'avec', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'je', 'tu', 'il', 'on', 'nous', 'vous', 'ils']);

export const autoBlocks = (words: Word[], maxWords = 4, maxChars = 30): Word[] => {
	const out: Word[] = [];
	let count = 0;
	let chars = 0;
	words.forEach((w, i) => {
		const prev = out[out.length - 1];
		const gap = prev ? w.start - prev.end : 0;
		const punct = prev ? /[.,!?;:]$/.test(prev.text) : true;
		const prevArticle = prev ? ARTICLES.has(prev.text.toLowerCase()) : false;
		const full = count >= maxWords || chars + w.text.length + 1 > maxChars;
		const start = i === 0 || ((full || gap > 0.35 || (punct && count >= 2)) && !prevArticle);
		if (!start && full && prevArticle && count >= 2) {
			// Never end a block on an article: the article opens the next block instead.
			out[out.length - 1] = {...prev, blockStart: true};
			count = 1;
			chars = prev.text.length + 1;
		} else if (start) {
			count = 0;
			chars = 0;
		}
		count++;
		chars += w.text.length + 1;
		out.push({...w, blockStart: start || undefined});
	});
	return out;
};

/* ---------------- text styles ---------------- */

type StylesOverride = Partial<Record<TextStyleKind, TextStylePatch>>;

const styleOverrides = (plan: Plan): StylesOverride => ((plan.themeOverrides?.textStyles as StylesOverride | undefined) ?? {});

const withStyleOverrides = (plan: Plan, textStyles: StylesOverride): Plan => {
	const {textStyles: _old, ...rest} = plan.themeOverrides ?? {};
	const kept = Object.fromEntries(Object.entries(textStyles).filter(([, v]) => v && Object.keys(v).length > 0));
	const themeOverrides = Object.keys(kept).length ? {...rest, textStyles: kept} : rest;
	return {...plan, themeOverrides: Object.keys(themeOverrides).length ? themeOverrides : undefined};
};

// Change a text style for this video only (nested objects such as stroke or shadow are replaced whole).
export const setVideoStyle = (plan: Plan, kind: TextStyleKind, patch: TextStylePatch): Plan => {
	const current = styleOverrides(plan);
	return withStyleOverrides(plan, {...current, [kind]: {...current[kind], ...patch}});
};

// Back to the default style (theme.json) for this video.
export const clearVideoStyle = (plan: Plan, kind: TextStyleKind): Plan => {
	const {[kind]: _removed, ...rest} = styleOverrides(plan);
	return withStyleOverrides(plan, rest);
};

// Look of one concept only, over the concept style of the video.
export const setConceptStyle = (plan: Plan, id: string, patch: TextStylePatch): Plan => ({
	...plan,
	concepts: plan.concepts.map((c) => (c.id === id ? {...c, style: {...c.style, ...patch}} : c)),
});

export const clearConceptStyle = (plan: Plan, id: string): Plan => ({
	...plan,
	concepts: plan.concepts.map((c) => {
		if (c.id !== id) return c;
		const {style: _removed, ...rest} = c;
		return rest;
	}),
});

// "Apply to all": the look of one concept becomes the concept style of the video, individual looks are dropped.
export const applyConceptStyleToAll = (plan: Plan, id: string): Plan => {
	const concept = plan.concepts.find((c) => c.id === id);
	if (!concept?.style) return plan;
	const next = setVideoStyle(plan, 'concept', concept.style);
	return {...next, concepts: next.concepts.map(({style: _s, ...c}) => c)};
};

// Restore every cut (the rush is already edited): one kept segment, zooms preserved.
export const restoreAllCuts = (plan: Plan): Plan =>
	plan.spans.some((s) => !s.keep)
		? {...plan, spans: normalizeSpans(plan.spans.map((s) => (s.keep ? s : {...s, keep: true, zoom: false, reason: undefined})))}
		: plan;

/* ---------------- picture frames (corners, border, shadow) ---------------- */

type FramesOverride = Partial<Record<FrameStyleKind, FrameStylePatch>>;

const frameOverrides = (plan: Plan): FramesOverride => ((plan.themeOverrides?.frameStyles as FramesOverride | undefined) ?? {});

const withFrameOverrides = (plan: Plan, frameStyles: FramesOverride): Plan => {
	const {frameStyles: _old, ...rest} = plan.themeOverrides ?? {};
	const kept = Object.fromEntries(Object.entries(frameStyles).filter(([, v]) => v && Object.keys(v).length > 0));
	const themeOverrides = Object.keys(kept).length ? {...rest, frameStyles: kept} : rest;
	return {...plan, themeOverrides: Object.keys(themeOverrides).length ? themeOverrides : undefined};
};

export const frameKindOf = (mode: CutIn['mode']): FrameStyleKind => (mode === 'bg' ? 'bg' : 'screen');

// Frame of every picture of this kind, for this video only.
export const setVideoFrame = (plan: Plan, kind: FrameStyleKind, patch: FrameStylePatch): Plan => {
	const current = frameOverrides(plan);
	return withFrameOverrides(plan, {...current, [kind]: {...current[kind], ...patch}});
};

export const clearVideoFrame = (plan: Plan, kind: FrameStyleKind): Plan => {
	const {[kind]: _removed, ...rest} = frameOverrides(plan);
	return withFrameOverrides(plan, rest);
};

// Frame of one picture only.
export const setCutInFrame = (plan: Plan, id: string, patch: FrameStylePatch): Plan => ({
	...plan,
	cutIns: plan.cutIns.map((c) => (c.id === id ? {...c, frame: {...c.frame, ...patch}} : c)),
});

export const clearCutInFrame = (plan: Plan, id: string): Plan => ({
	...plan,
	cutIns: plan.cutIns.map((c) => {
		if (c.id !== id) return c;
		const {frame: _removed, ...rest} = c;
		return rest;
	}),
});

// "Apply to all": the frame of one picture becomes the frame of every picture of the same kind in this video.
export const applyFrameToAll = (plan: Plan, id: string): Plan => {
	const cutIn = plan.cutIns.find((c) => c.id === id);
	if (!cutIn?.frame) return plan;
	const kind = frameKindOf(cutIn.mode);
	const next = setVideoFrame(plan, kind, cutIn.frame);
	return {
		...next,
		cutIns: next.cutIns.map((c) => {
			if (frameKindOf(c.mode) !== kind) return c;
			const {frame: _f, ...rest} = c;
			return rest;
		}),
	};
};
