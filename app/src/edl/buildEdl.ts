// Port of montage_shorts_claude/engine/scripts/build_edl.py: plan (rush time) -> EDL (output time).
// Pure and fast: recomputed in the browser on every edit.
import type {Asset, Plan} from '../model/plan';
import type {Theme} from '../model/theme';
import {keptSegments, outputDuration, round3, rushToOutput, segmentOfWord} from './time';
import type {Edl, EdlCaptionBlock, EdlCaptionWord, EdlSegment, EdlSfx} from './types';

export const cacheFileFor = (assetId: string, process: string): string => `data/cache/${assetId}.${process}.png`;

export const outputFps = (plan: Plan, theme: Theme): number =>
	plan.output?.fps ?? (theme.format.keepSource60 && plan.source.fps >= 59 ? 60 : theme.format.fps);

const limitPencilOverlap = (sfx: EdlSfx[], maximum = 2): void => {
	let active: EdlSfx[] = [];
	for (const clip of sfx.filter((s) => s.file.startsWith('pencil'))) {
		active = active.filter((a) => a.time + (a.duration ?? 0) > clip.time);
		while (active.length >= maximum) {
			const oldest = active.shift()!;
			oldest.duration = round3(clip.time - oldest.time);
		}
		active.push(clip);
	}
};

const buildCaptions = (plan: Plan, segments: ReturnType<typeof keptSegments>, minBlockS: number): EdlCaptionBlock[] => {
	const blocks: EdlCaptionBlock[] = [];
	const words = [...plan.words].sort((a, b) => a.start - b.start);
	for (const segment of segments) {
		const inside = words.filter((w) => segmentOfWord([segment], w) === segment);
		let current: EdlCaptionWord[] = [];
		const flush = () => {
			if (!current.length) return;
			blocks.push({
				start: current[0].start,
				end: current[current.length - 1].end,
				text: current.map((w) => w.text).join(' '),
				words: current,
			});
			current = [];
		};
		inside.forEach((w, i) => {
			if (i > 0 && w.blockStart) flush();
			const toOut = (t: number) => round3(segment.outStart + Math.min(Math.max(t, segment.srcStart), segment.srcEnd) - segment.srcStart);
			current.push({id: w.id, text: w.text, start: toOut(w.start), end: toOut(w.end), highlight: Boolean(w.highlight)});
		});
		flush();
	}
	// Minimum block duration, as in the legacy pipeline.
	for (let i = 0; i < blocks.length - 1; i++) {
		const current = blocks[i];
		const following = blocks[i + 1];
		const candidate = following.start - current.start <= minBlockS ? following.start : current.start + minBlockS;
		current.end = round3(Math.max(current.end, candidate));
	}
	if (blocks.length && segments.length) {
		const last = blocks[blocks.length - 1];
		last.end = Math.max(last.end, segments[segments.length - 1].outEnd);
	}
	return blocks;
};

export const buildEdl = (plan: Plan, theme: Theme): Edl => {
	const segments = keptSegments(plan);
	const at = (t: number) => rushToOutput(segments, t);
	const total = outputDuration(segments);
	const assets = new Map<string, Asset>(plan.assets.map((a) => [a.id, a]));
	const fileOf = (id: string) => assets.get(id)?.file ?? id;
	const rules = {...theme.sfx, ...(plan.sfxRules ?? {})};
	const sortedWords = [...plan.words].sort((a, b) => a.start - b.start);

	const edlSegments: EdlSegment[] = segments.map((s) => ({
		id: s.id,
		srcStart: s.srcStart,
		srcEnd: s.srcEnd,
		outStart: s.outStart,
		outEnd: s.outEnd,
		zoom: s.span.zoom,
		zoomSfx: s.span.zoom && Boolean(s.span.zoomSfx),
		text: sortedWords
			.filter((w) => segmentOfWord([s], w) === s)
			.map((w) => w.text)
			.join(' '),
	}));

	const concepts = plan.concepts.map((c) => ({
		id: c.id,
		text: c.text,
		start: at(c.start),
		end: round3(at(c.end) + theme.concepts.fadeS),
		typing: round3(c.text.length * theme.concepts.letterS),
		style: c.style ? {...theme.textStyles.concept, ...c.style} : theme.textStyles.concept,
	}));

	const logos = plan.logos.map((l) => {
		const asset = assets.get(l.asset);
		return {
			id: l.id,
			file: l.process ? cacheFileFor(l.asset, l.process) : fileOf(l.asset),
			trigger: l.trigger ?? '',
			start: at(l.start),
			end: at(l.end),
			size: l.size ?? theme.logos.size,
			x: l.x ?? theme.logos.centerX,
			y: l.y ?? theme.logos.centerY,
			alphaBox: l.process ? undefined : asset?.alphaBox,
			sourceWidth: asset?.width,
			sourceHeight: asset?.height,
			process: l.process ?? null,
			...(l.enter !== undefined ? {enter: l.enter} : {}),
			...(l.shake !== undefined ? {shake: l.shake} : {}),
			...(l.rotate ? {rotate: l.rotate} : {}),
		};
	});

	const diagrams = plan.diagrams.map((d) => ({
		id: d.id,
		template: d.template,
		component: d.component,
		description: d.description,
		start: at(d.start),
		end: at(d.end),
		elements: d.elements.map((e) => ({
			id: e.id,
			label: e.label,
			icon: e.icon,
			image: e.image ? fileOf(e.image) : undefined,
			accent: e.accent,
			strike: e.strike,
			check: e.check,
			kind: e.kind,
			trigger: e.trigger,
			draw: e.draw,
			start: at(e.at),
		})),
	}));

	const cutIns = plan.cutIns.map((c) => {
		const asset = assets.get(c.asset);
		return {
			id: c.id,
			file: fileOf(c.asset),
			mode: c.mode,
			video: asset?.kind === 'video',
			start: at(c.start),
			end: at(c.end),
			...(c.trim !== undefined ? {trim: c.trim} : {}),
			...(c.zoom !== undefined ? {zoom: c.zoom} : {}),
			...(c.dim !== undefined ? {dim: c.dim} : {}),
			...(c.shake !== undefined ? {shake: c.shake} : {}),
			...(c.enter !== undefined ? {enter: c.enter} : {}),
			...(c.rotate ? {rotate: c.rotate} : {}),
			...(asset?.width && asset?.height ? {aspect: round3(asset.width / asset.height)} : {}),
			...(c.x !== undefined ? {x: c.x} : {}),
			...(c.y !== undefined ? {y: c.y} : {}),
			...(c.width !== undefined ? {width: c.width} : {}),
			frame: {...theme.frameStyles[c.mode === 'bg' ? 'bg' : 'screen'], ...c.frame},
		};
	});

	const gauges = plan.gauges.map((g) => ({
		id: g.id,
		file: fileOf(g.asset),
		box: g.box,
		label: g.label,
		from: g.from,
		to: g.to,
		landing: g.landing,
		start: at(g.start),
		end: at(g.end),
		sourceWidth: assets.get(g.asset)?.width,
		sourceHeight: assets.get(g.asset)?.height,
	}));

	// SFX, in the legacy insertion order (the sort below is stable).
	const sfx: EdlSfx[] = [];
	for (const s of edlSegments) {
		if (s.zoomSfx && rules.zoom) sfx.push({time: s.outStart, file: rules.zoom, reason: 'zoom punch-in', ref: s.id});
	}
	plan.logos.forEach((l, i) => {
		if (l.sfx === false || !rules.logo) return;
		sfx.push({time: logos[i].start, file: rules.logo, reason: `logo ${logos[i].trigger}`, ref: l.id});
	});
	plan.concepts.forEach((c, i) => {
		if (!rules.conceptTyping) return;
		sfx.push({
			time: concepts[i].start,
			file: rules.conceptTyping,
			duration: concepts[i].typing,
			fadeOut: 0.05,
			reason: `typing concept ${c.text}`,
			ref: c.id,
		});
	});
	plan.diagrams.forEach((d, i) => {
		if (d.sfx === false) return;
		if (rules.diagramOpen) sfx.push({time: diagrams[i].start, file: rules.diagramOpen, reason: `schema ${d.id} opens`, ref: d.id});
		if (rules.diagramElement) {
			for (const e of diagrams[i].elements) {
				sfx.push({time: e.start, file: rules.diagramElement, reason: `schema element ${e.label}`, ref: d.id});
			}
		}
	});
	plan.cutIns.forEach((c, i) => {
		if (cutIns[i].start > 0 && c.sfx !== false && rules.cutIn) {
			sfx.push({time: cutIns[i].start, file: rules.cutIn, reason: `cut-in ${cutIns[i].file}`, ref: c.id});
		}
	});
	plan.gauges.forEach((g, i) => {
		if (g.sfx === false) return;
		if (rules.gauge) sfx.push({time: gauges[i].start, file: rules.gauge, reason: 'gauge opens', ref: g.id});
		if (rules.gaugeLanding) {
			sfx.push({time: round3(gauges[i].start + g.landing), file: rules.gaugeLanding, reason: 'gauge cursor lands', ref: g.id});
		}
	});
	for (const s of plan.sfx) {
		sfx.push({
			time: at(s.at),
			file: s.file,
			...(s.duration ? {duration: s.duration} : {}),
			...(s.gain ? {gain: s.gain} : {}),
			reason: s.reason ?? 'manual',
			ref: s.id,
		});
	}
	sfx.sort((a, b) => a.time - b.time);
	limitPencilOverlap(sfx);

	const overlaySubscribe = plan.subscribe
		? {
				file: theme.subscribe.file,
				start: at(plan.subscribe.start),
				end: round3(total),
				scale: plan.subscribe.scale,
				x: plan.subscribe.x,
				y: plan.subscribe.y,
				keyColor: plan.subscribe.keyColor,
				...(plan.subscribe.enter ? {enter: plan.subscribe.enter} : {}),
				...(plan.subscribe.rotate ? {rotate: plan.subscribe.rotate} : {}),
				...(plan.subscribe.shake ? {shake: plan.subscribe.shake} : {}),
			}
		: null;

	return {
		slug: plan.slug,
		source: plan.source.rush,
		fps: outputFps(plan, theme),
		width: theme.format.width,
		height: theme.format.height,
		crop: {...plan.source.crop, sourceWidth: plan.source.width},
		durationBefore: plan.source.duration,
		durationAfter: round3(total),
		segments: edlSegments,
		captions: buildCaptions(plan, segments, theme.captions.minBlockS),
		concepts,
		logos,
		assets: cutIns,
		gauges,
		diagrams,
		sfx,
		overlaySubscribe,
		music: plan.music ? {file: fileOf(plan.music.asset), underVoiceDb: plan.music.underVoiceDb} : null,
		hideCaptionsDuringConcepts: plan.hideCaptionsDuringConcepts,
		unplacedAssets: plan.unplacedAssets,
	};
};
