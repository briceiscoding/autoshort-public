// Linter: pure functions on the plan, run live in the UI. Non blocking; each warning points to a time.
import {buildEdl} from '../edl/buildEdl';
import {keptSegments, rushToOutput, segmentOfWord} from '../edl/time';
import type {Edl} from '../edl/types';
import {faceAt, type Analysis} from '../model/analysis';
import type {Plan} from '../model/plan';
import type {Theme} from '../model/theme';
import {captionRect, conceptRect, insideRect, logoRect, rectsOverlap, safeRect, screenRect, type Rect} from '../composition/geometry';

export type Severity = 'error' | 'warning' | 'info';

export type LintRule =
	| 'safe-zone'
	| 'face-overlap'
	| 'calm'
	| 'concept-spacing'
	| 'highlight-per-block'
	| 'caption-length'
	| 'highlight-consecutive'
	| 'concept-highlight'
	| 'diagram-duration'
	| 'diagram-elements'
	| 'cut-inside-word'
	| 'speech-gap'
	| 'low-confidence'
	| 'duration'
	| 'image-mode'
	| 'media-type'
	| 'timing'
	| 'hook'
	| 'loudness'
	| 'true-peak'
	| 'unplaced';

export type LintWarning = {
	id: string;
	rule: LintRule;
	severity: Severity;
	message: string;
	// Output time to jump to.
	time: number;
	ref?: {kind: string; id: string};
	action?: {type: 'rerun-transcription' | 'bursts-fallback'; label: string};
};

export const LOW_CONFIDENCE = 0.5;
export const SPEECH_GAP_S = 1.5;

// Stretches longer than SPEECH_GAP_S inside speech regions where no word was transcribed (Whisper skipped speech).
export const speechGaps = (regions: {start: number; end: number}[], words: {start: number; end: number}[]): {start: number; end: number}[] => {
	const sorted = [...words].sort((a, b) => a.start - b.start);
	const gaps: {start: number; end: number}[] = [];
	for (const region of regions) {
		let cursor = region.start;
		for (const w of sorted) {
			if (w.end <= region.start || w.start >= region.end) continue;
			if (w.start - cursor > SPEECH_GAP_S) gaps.push({start: cursor, end: w.start});
			cursor = Math.max(cursor, w.end);
		}
		if (region.end - cursor > SPEECH_GAP_S) gaps.push({start: cursor, end: region.end});
	}
	return gaps;
};

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

// Approximate caption line count without a canvas (~0.62 em per character, a safe margin for bold sans fonts such as Montserrat ExtraBold).
const estimateLines = (text: string, theme: Theme): number => {
	const style = theme.textStyles.caption;
	const charW = style.size * 0.62 + style.letterSpacing;
	const perLine = Math.max(1, Math.floor((style.maxWidth + theme.captions.wordGap) / charW));
	return Math.max(1, Math.ceil(text.length / perLine));
};

// Scale a caption block gets to stay within captions.maxLines (same estimate, 1 = fits).
const estimateScale = (text: string, theme: Theme): number => {
	const style = theme.textStyles.caption;
	const maxLines = theme.captions.maxLines ?? 2;
	const charW = style.size * 0.62 + style.letterSpacing;
	return Math.min(1, (maxLines * (style.maxWidth + theme.captions.wordGap)) / Math.max(1, text.length * charW));
};

type CalmEvent = {kind: string; id: string; label: string; start: number; end: number};

export const lintPlan = (plan: Plan, theme: Theme, analysis: Analysis | null | undefined, edlIn?: Edl): LintWarning[] => {
	const out: LintWarning[] = [];
	const add = (w: Omit<LintWarning, 'id'>) => out.push({...w, id: `${w.rule}:${w.ref?.id ?? ''}:${w.time.toFixed(2)}:${out.length}`});
	const edl = edlIn ?? buildEdl(plan, theme);
	const segments = keptSegments(plan);
	const at = (t: number) => rushToOutput(segments, t);
	const safe = safeRect(theme);
	const assets = new Map(plan.assets.map((a) => [a.id, a]));

	const outToRush = (t: number): number | null => {
		const s = edl.segments.find((x) => t >= x.outStart && t < x.outEnd);
		return s ? s.srcStart + (t - s.outStart) : null;
	};
	const faceRectAt = (outT: number): Rect | null => {
		const rush = outToRush(outT);
		if (rush === null) return null;
		const box = faceAt(analysis, rush, plan.source.crop, theme.format.height);
		if (!box) return null;
		const seg = edl.segments.find((x) => outT >= x.outStart && outT < x.outEnd);
		if (seg?.zoom) {
			const [cx, cy, s] = [theme.format.width / 2, theme.zoom.originY, theme.zoom.scale];
			return {x: cx + (box[0] - cx) * s, y: cy + (box[1] - cy) * s, w: box[2] * s, h: box[3] * s};
		}
		return {x: box[0], y: box[1], w: box[2], h: box[3]};
	};
	// The face is tested at the start, middle and end of an event.
	const faceHit = (rect: Rect, start: number, end: number, part: 'face' | 'mouth' = 'face'): boolean =>
		[start + 0.05, (start + end) / 2, end - 0.05].some((t) => {
			const face = faceRectAt(t);
			if (!face) return false;
			// The detector box includes the forehead: the face proper starts around the eyebrows.
			const zone = part === 'mouth' ? {x: face.x + face.w * 0.2, y: face.y + face.h * 0.62, w: face.w * 0.6, h: face.h * 0.38} : {x: face.x, y: face.y + face.h * 0.3, w: face.w, h: face.h * 0.7};
			return rectsOverlap(rect, zone);
		});

	/* ---- timing sanity ---- */
	const timed: {kind: string; id: string; start: number; end: number; label: string}[] = [
		...plan.concepts.map((c) => ({kind: 'concept', id: c.id, start: c.start, end: c.end, label: c.text})),
		...plan.logos.map((l) => ({kind: 'logo', id: l.id, start: l.start, end: l.end, label: l.asset})),
		...plan.cutIns.map((c) => ({kind: 'cutIn', id: c.id, start: c.start, end: c.end, label: c.asset})),
		...plan.gauges.map((g) => ({kind: 'gauge', id: g.id, start: g.start, end: g.end, label: g.label})),
		...plan.diagrams.map((d) => ({kind: 'diagram', id: d.id, start: d.start, end: d.end, label: d.id})),
	];
	for (const e of timed) {
		if (e.end <= e.start) add({rule: 'timing', severity: 'error', message: `${e.kind} "${e.label}" ends before it starts`, time: at(e.start), ref: {kind: e.kind, id: e.id}});
		else if (at(e.end) - at(e.start) < 0.05)
			add({rule: 'timing', severity: 'error', message: `${e.kind} "${e.label}" lies entirely in a cut`, time: at(e.start), ref: {kind: e.kind, id: e.id}});
	}

	/* ---- media typing ---- */
	const expectKind = (kind: string, id: string, assetId: string, wanted: string[]) => {
		const asset = assets.get(assetId);
		if (!asset) add({rule: 'media-type', severity: 'error', message: `${kind} uses unknown asset "${assetId}"`, time: 0, ref: {kind, id}});
		else if (!wanted.includes(asset.kind))
			add({rule: 'media-type', severity: 'error', message: `${kind} "${assetId}" is ${asset.kind}, expected ${wanted.join(' or ')}`, time: 0, ref: {kind, id}});
	};
	plan.logos.forEach((l) => expectKind('logo', l.id, l.asset, ['image']));
	plan.cutIns.forEach((c) => expectKind('cutIn', c.id, c.asset, c.mode === 'bg' ? ['image'] : ['image', 'video']));
	plan.gauges.forEach((g) => expectKind('gauge', g.id, g.asset, ['image']));
	if (plan.music) expectKind('music', 'music', plan.music.asset, ['audio']);

	/* ---- image display mode vs ratio ---- */
	plan.cutIns.forEach((c, i) => {
		const asset = assets.get(c.asset);
		if (!asset?.width || !asset.height) return;
		const ratio = asset.width / asset.height;
		if (c.mode === 'full' && ratio > 0.75)
			add({
				rule: 'image-mode',
				severity: 'warning',
				message: `"${c.asset}" is ${ratio >= 1 ? 'landscape' : 'square-ish'} (${asset.width}x${asset.height}) in full mode: most of it is cropped, use screen`,
				time: edl.assets[i].start,
				ref: {kind: 'cutIn', id: c.id},
			});
	});

	/* ---- safe zone and face ---- */
	edl.logos.forEach((logo) => {
		const rect = logoRect(logo, theme);
		if (!insideRect(rect, safe, 1)) add({rule: 'safe-zone', severity: 'warning', message: `Logo "${logo.trigger || logo.id}" leaves the safe zone`, time: logo.start, ref: {kind: 'logo', id: logo.id}});
		if (faceHit(rect, logo.start, logo.end)) add({rule: 'face-overlap', severity: 'warning', message: `Logo "${logo.trigger || logo.id}" covers the face`, time: logo.start, ref: {kind: 'logo', id: logo.id}});
	});
	edl.assets.forEach((a) => {
		if (a.mode !== 'screen') return;
		const rect = screenRect(a, theme);
		if (!insideRect(rect, safe, 1)) add({rule: 'safe-zone', severity: 'warning', message: `Screen card "${a.file}" leaves the safe zone`, time: a.start, ref: {kind: 'cutIn', id: a.id}});
	});
	edl.concepts.forEach((c) => {
		const rect = conceptRect(c.text, c.style, theme);
		if (!insideRect(rect, safe, 1)) add({rule: 'safe-zone', severity: 'warning', message: `Concept "${c.text}" leaves the safe zone`, time: c.start, ref: {kind: 'concept', id: c.id}});
		if (faceHit(rect, c.start, c.end)) add({rule: 'face-overlap', severity: 'warning', message: `Concept "${c.text}" covers the face`, time: c.start, ref: {kind: 'concept', id: c.id}});
	});
	const fullCover = (t: number) => edl.assets.some((a) => a.mode !== 'bg' && t >= a.start && t < a.end) || edl.diagrams.some((d) => t >= d.start && t < d.end) || edl.gauges.some((g) => t >= g.start && t < g.end);
	let mouthWarnings = 0;
	edl.captions.forEach((b) => {
		const rect = captionRect(Math.min(estimateLines(b.text, theme), theme.captions.maxLines ?? 2), theme);
		const scale = estimateScale(b.text, theme);
		if (scale < 0.85) {
			const where = (theme.captions.maxLines ?? 2) === 1 ? 'one line' : `${theme.captions.maxLines} lines`;
			add({rule: 'caption-length', severity: 'warning', message: `Caption "${b.text}" is shrunk to ${Math.round(scale * 100)} % to fit on ${where}: split the block (Transcript)`, time: b.start, ref: {kind: 'caption', id: b.words[0]?.id ?? ''}});
		}
		if (!insideRect(rect, safe, 1)) add({rule: 'safe-zone', severity: 'warning', message: `Caption "${b.text}" is too long for the safe zone`, time: b.start, ref: {kind: 'caption', id: b.words[0]?.id ?? ''}});
		if (mouthWarnings < 10 && !fullCover((b.start + b.end) / 2) && faceHit(rect, b.start, b.end, 'mouth')) {
			mouthWarnings++;
			add({rule: 'face-overlap', severity: 'warning', message: `Caption "${b.text}" covers the mouth`, time: b.start, ref: {kind: 'caption', id: b.words[0]?.id ?? ''}});
		}
	});

	/* ---- calm rule: one event at a time among bg/screen/full assets, diagrams, gauges, logos, concepts ---- */
	if (theme.calm.enabled) {
		const events: CalmEvent[] = [
			...edl.assets.map((a) => ({kind: 'cutIn', id: a.id, label: `${a.mode} ${a.file.split('/').pop()}`, start: a.start, end: a.end})),
			...edl.gauges.map((g) => ({kind: 'gauge', id: g.id, label: `gauge ${g.label}`, start: g.start, end: g.end})),
			...edl.diagrams.map((d) => ({kind: 'diagram', id: d.id, label: `diagram ${d.id}`, start: d.start, end: d.end})),
			...edl.logos.map((l) => ({kind: 'logo', id: l.id, label: `logo ${l.trigger || l.id}`, start: l.start, end: l.end})),
			...edl.concepts.map((c) => ({kind: 'concept', id: c.id, label: `concept ${c.text}`, start: c.start, end: c.end})),
		].sort((a, b) => a.start - b.start);
		for (let i = 0; i < events.length; i++) {
			for (let j = i + 1; j < events.length && events[j].start < events[i].end; j++) {
				const overlap = Math.min(events[i].end, events[j].end) - events[j].start;
				// Concepts fade out over 150 ms: touching that tail is not a clash.
				if (overlap > theme.concepts.fadeS + 0.02)
					add({
						rule: 'calm',
						severity: 'warning',
						message: `Calm rule: ${events[i].label} and ${events[j].label} overlap (${overlap.toFixed(2)} s)`,
						time: events[j].start,
						ref: {kind: events[j].kind, id: events[j].id},
					});
			}
		}
	}

	/* ---- concepts ---- */
	const concepts = [...edl.concepts].sort((a, b) => a.start - b.start);
	for (let i = 1; i < concepts.length; i++) {
		const gap = concepts[i].start - concepts[i - 1].start;
		if (gap < theme.concepts.minSpacingS)
			add({rule: 'concept-spacing', severity: 'warning', message: `Concepts "${concepts[i - 1].text}" and "${concepts[i].text}" are ${gap.toFixed(1)} s apart (min ${theme.concepts.minSpacingS} s)`, time: concepts[i].start, ref: {kind: 'concept', id: concepts[i].id}});
	}
	for (const c of concepts) {
		if (c.end - c.start > theme.concepts.maxS + theme.concepts.fadeS + 0.01)
			add({rule: 'timing', severity: 'info', message: `Concept "${c.text}" lasts ${(c.end - c.start).toFixed(1)} s (max ${theme.concepts.maxS} s)`, time: c.start, ref: {kind: 'concept', id: c.id}});
	}

	/* ---- highlights ---- */
	edl.captions.forEach((b, i) => {
		const n = b.words.filter((w) => w.highlight).length;
		if (n > 1) add({rule: 'highlight-per-block', severity: 'warning', message: `${n} highlighted words in "${b.text}" (max 1 per block)`, time: b.start, ref: {kind: 'caption', id: b.words[0].id}});
		const prev = edl.captions[i - 1];
		if (n && prev?.words.some((w) => w.highlight))
			add({rule: 'highlight-consecutive', severity: 'warning', message: `Highlights in two consecutive blocks: "${prev.text}" / "${b.text}"`, time: b.start, ref: {kind: 'caption', id: b.words[0].id}});
		for (const w of b.words) {
			if (w.highlight && edl.concepts.some((c) => w.start >= c.start && w.start < c.end))
				add({rule: 'concept-highlight', severity: 'info', message: `"${w.text}" is highlighted while a concept hides the captions`, time: w.start, ref: {kind: 'word', id: w.id}});
		}
	});

	/* ---- diagrams ---- */
	edl.diagrams.forEach((d, i) => {
		const duration = d.end - d.start;
		if (duration < theme.diagrams.minS) add({rule: 'diagram-duration', severity: 'warning', message: `Diagram "${d.id}" lasts ${duration.toFixed(1)} s (min ${theme.diagrams.minS} s)`, time: d.start, ref: {kind: 'diagram', id: d.id}});
		if (duration > theme.diagrams.maxS) add({rule: 'diagram-duration', severity: 'info', message: `Diagram "${d.id}" lasts ${duration.toFixed(1)} s (max ${theme.diagrams.maxS} s)`, time: d.start, ref: {kind: 'diagram', id: d.id}});
		if (d.elements.length > theme.diagrams.maxElements) add({rule: 'diagram-elements', severity: 'warning', message: `Diagram "${d.id}" has ${d.elements.length} elements (max ${theme.diagrams.maxElements})`, time: d.start, ref: {kind: 'diagram', id: d.id}});
		const planned = plan.diagrams[i];
		for (const e of d.elements) {
			if (e.label.trim().split(/\s+/).length > 3) add({rule: 'diagram-elements', severity: 'info', message: `Label "${e.label}" has more than 3 words`, time: e.start, ref: {kind: 'diagram', id: d.id}});
			if (e.start < d.start - 0.01 || e.start > d.end) add({rule: 'diagram-elements', severity: 'warning', message: `Element "${e.label}" appears outside its diagram`, time: e.start, ref: {kind: 'diagram', id: d.id}});
		}
		if (planned?.template === 'custom' && !planned.component) add({rule: 'diagram-elements', severity: 'error', message: `Custom diagram "${d.id}" has no component`, time: d.start, ref: {kind: 'diagram', id: d.id}});
	});

	/* ---- cuts inside words ---- */
	const spans = [...plan.spans].sort((a, b) => a.start - b.start);
	const boundaries = new Set<number>();
	for (let i = 1; i < spans.length; i++) if (spans[i].keep !== spans[i - 1].keep) boundaries.add(spans[i].start);
	for (const b of boundaries) {
		const w = plan.words.find((x) => b > x.start + 0.02 && b < x.end - 0.02);
		if (w) add({rule: 'cut-inside-word', severity: 'warning', message: `Cut at ${fmt(b)} (rush) falls inside "${w.text}"`, time: at(b), ref: {kind: 'word', id: w.id}});
	}

	/* ---- speech the transcription skipped ---- */
	const speech = analysis?.vad?.length ? analysis.vad : analysis?.bursts ?? [];
	for (const gap of speechGaps(speech, plan.words)) {
		const kept = segments.some((s) => gap.start < s.srcEnd && gap.end > s.srcStart);
		if (kept)
			add({
				rule: 'speech-gap',
				severity: 'warning',
				message: `Speech detected at ${fmt(gap.start)}-${fmt(gap.end)} (rush) without transcribed words`,
				time: at(gap.start),
				action: {type: 'bursts-fallback', label: 'Run the burst fallback'},
			});
	}

	/* ---- low confidence words ---- */
	plan.words.forEach((w) => {
		if (w.score !== undefined && w.score !== null && w.score < LOW_CONFIDENCE && segmentOfWord(segments, w))
			add({rule: 'low-confidence', severity: 'info', message: `Low confidence (${Math.round(w.score * 100)} %): "${w.text}", re-listen`, time: at(w.start), ref: {kind: 'word', id: w.id}});
	});

	/* ---- duration and hook ---- */
	if (edl.durationAfter > theme.format.targetDurationS)
		add({rule: 'duration', severity: 'warning', message: `Output lasts ${edl.durationAfter.toFixed(2)} s, above the ${theme.format.targetDurationS} s target`, time: theme.format.targetDurationS});
	const firstWord = edl.captions[0]?.words[0];
	if (firstWord && firstWord.start > 0.3) add({rule: 'hook', severity: 'warning', message: `First word at ${firstWord.start.toFixed(2)} s: dead time in the hook`, time: 0});
	const hookWords = edl.captions.flatMap((b) => b.words).filter((w) => w.start < 2);
	for (let i = 1; i < hookWords.length; i++) {
		if (hookWords[i].start - hookWords[i - 1].end > 0.4)
			add({rule: 'hook', severity: 'warning', message: `Pause of ${(hookWords[i].start - hookWords[i - 1].end).toFixed(2)} s in the first 2 s`, time: hookWords[i - 1].end});
	}

	/* ---- after mix ---- */
	const last = analysis?.exports?.[analysis.exports.length - 1];
	if (last) {
		if (last.truePeakDb > theme.audio.truePeak)
			add({rule: 'true-peak', severity: 'error', message: `${last.file}: true peak ${last.truePeakDb.toFixed(1)} dBTP > ${theme.audio.truePeak} dBTP`, time: 0});
		const voice = last.voiceLufs ?? last.integratedLufs;
		if (Math.abs(voice - theme.audio.voiceLufs) > 1.5)
			add({rule: 'loudness', severity: 'warning', message: `${last.file}: ${voice.toFixed(1)} LUFS, target ${theme.audio.voiceLufs} LUFS`, time: 0});
	}

	for (const file of plan.unplacedAssets) add({rule: 'unplaced', severity: 'info', message: `Asset not placed: ${file}`, time: 0});

	const order: Record<Severity, number> = {error: 0, warning: 1, info: 2};
	return out.sort((a, b) => a.time - b.time || order[a.severity] - order[b.severity]);
};
