// Main composition, shared by the in-app Player (preview) and the export render.
// Port of engine/src/Main.tsx; layer order from the charte (section 4).
import React, {useEffect, useRef, useState} from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Edl, EdlSegment, EdlSfx} from '../edl/types';
import type {Analysis} from '../model/analysis';
import {faceAt} from '../model/analysis';
import {fontFamilyOf, themeFontFiles, type Theme} from '../model/theme';
import {CutInLayer, LogoLayer, SubscribeLayer} from './AssetLayer';
import {Captions} from './Captions';
import {ConceptText} from './ConceptText';
import {CompositionProvider, mediaUrl, useLibraryUrl, useTheme, useVideoUrl, type MediaConfig} from './context';
import {findCustomDiagram} from './custom/registry';
import {TEMPLATES} from './diagrams/templates';
import {GaugeLayer} from './GaugeLayer';

export type AudioConfig = {
	// preview: rush audio + raw SFX/music at approximate volumes; export: prepared voice/music + measured SFX gains.
	mode: 'preview' | 'export';
	voice?: string | null;
	music?: string | null;
	sfxGains?: Record<string, number>;
};

export type MatteClip = {file: string; start: number; end: number};

export type MainProps = {
	edl: Edl;
	theme: Theme;
	media: MediaConfig;
	audio: AudioConfig;
	// Keyed subscribe overlay (VP9 with alpha), relative to the video folder.
	subscribeFile?: string | null;
	// Speaker cutouts for bg pictures: rush pixels + alpha (VP9 with alpha), each over a rush time range.
	mattes?: MatteClip[] | null;
	overlays?: {safeZone?: boolean; face?: boolean; analysis?: Analysis | null};
	muted?: boolean;
};

const fontsLoaded = new Set<string>();

// Captions are measured with a canvas: nothing renders until the fonts are loaded. Diagram fonts keep their theme
// family name (@kit/theme); text style fonts are registered under fontFamilyOf(file).
const useFonts = (theme: Theme, edl: Edl, libraryBase: string): boolean => {
	const [handle] = useState(() => delayRender('Loading fonts'));
	const [ready, setReady] = useState(false);
	const continued = useRef(false);
	const files = [...new Set([...themeFontFiles(theme), ...edl.concepts.map((c) => c.style.font)])];
	const key = files.join('|');
	useEffect(() => {
		const faces = [
			theme.fonts.caption,
			theme.fonts.display,
			...files.map((file) => ({family: fontFamilyOf(file), file})),
		];
		Promise.all(
			faces.map(async ({family, file}) => {
				const src = mediaUrl(libraryBase, file);
				const key = `${family}|${src}`;
				if (fontsLoaded.has(key)) return;
				const face = new FontFace(family, `url('${src}')`);
				await face.load();
				document.fonts.add(face);
				fontsLoaded.add(key);
			}),
		)
			.catch((err) => console.error('font load failed', err))
			.finally(() => {
				setReady(true);
				if (!continued.current) continueRender(handle);
				continued.current = true;
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [handle, libraryBase, theme.fonts.caption, theme.fonts.display, key]);
	return ready;
};

// One kept segment of the rush, framed like the output. Also used for the speaker cutout (transparent, offset).
const SegmentVideo: React.FC<{segment: EdlSegment; src: string; crop: Edl['crop']; muted: boolean; srcOffset?: number; transparent?: boolean}> = ({
	segment,
	src,
	crop,
	muted,
	srcOffset,
	transparent,
}) => {
	const theme = useTheme();
	const {fps, width, height} = useVideoConfig();
	// Cover the canvas from the full source height, then shift to the crop window.
	const scale = height / crop.height;
	const sourceWidth = crop.sourceWidth * scale;
	return (
		<AbsoluteFill style={{transform: segment.zoom ? `scale(${theme.zoom.scale})` : undefined, transformOrigin: `${width / 2}px ${theme.zoom.originY}px`}}>
			<OffthreadVideo
				src={src}
				muted={muted}
				transparent={transparent}
				trimBefore={Math.max(0, Math.round((srcOffset ?? segment.srcStart) * fps))}
				style={{position: 'absolute', left: -crop.x * scale, top: -crop.y * scale, width: sourceWidth, height, maxWidth: 'none'}}
			/>
		</AbsoluteFill>
	);
};

// A sound effect without a set duration plays at most this long. Without a bound its audio tag stayed mounted until the
// end of the video: past 16 of them the preview player crashed ("Tried to simultaneously mount 17 <Html5Audio /> tags").
export const SFX_MAX_S = 6;

// Peak number of sound effects playing at once (+ voice and music), for the player's shared audio tags.
export const peakAudioTags = (sfx: {time: number; duration?: number}[]): number => {
	const edges = sfx.flatMap((s) => [
		{t: s.time, d: 1},
		{t: s.time + (s.duration ?? SFX_MAX_S), d: -1},
	]);
	edges.sort((a, b) => a.t - b.t || a.d - b.d);
	let now = 0;
	let peak = 0;
	for (const e of edges) peak = Math.max(peak, (now += e.d));
	return peak + 2;
};

// Pencil and keyboard sources are long loops: each use starts further in, so repeats differ.
const sfxOffsetSeconds = (file: string, index: number): number => {
	if (file.startsWith('pencil')) return 2 + (index % 8) * 3;
	if (file.startsWith('keyboard')) return 1 + (index % 8) * 5;
	return 0;
};

const SfxClip: React.FC<{sfx: EdlSfx; gain: number; index: number}> = ({sfx, gain, index}) => {
	const frame = useCurrentFrame();
	const library = useLibraryUrl();
	const {fps} = useVideoConfig();
	return (
		<Audio
			src={library(`sfx/${sfx.file}`)}
			trimBefore={Math.round(sfxOffsetSeconds(sfx.file, index) * fps)}
			volume={() => {
				if (!sfx.duration || !sfx.fadeOut) return gain;
				return gain * interpolate(frame / fps, [sfx.duration - sfx.fadeOut, sfx.duration], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
			}}
		/>
	);
};

const DiagramLayer: React.FC<{diagram: Edl['diagrams'][number]; slug: string}> = ({diagram, slug}) => {
	const elements = diagram.elements.map((e) => ({...e, start: e.start - diagram.start}));
	if (diagram.template === 'custom') {
		const Scene = diagram.component ? findCustomDiagram(slug, diagram.component) : undefined;
		if (!Scene) return <MissingDiagram name={diagram.component ?? diagram.id} />;
		return <Scene elements={elements.map((e) => ({label: e.label, kind: e.kind ?? '', trigger: e.trigger ?? '', start: e.start, draw: e.draw}))} />;
	}
	const Template = TEMPLATES[diagram.template];
	if (!Template) return <MissingDiagram name={diagram.template} />;
	return <Template elements={elements} id={`d-${diagram.id}`} />;
};

const MissingDiagram: React.FC<{name: string}> = ({name}) => (
	<AbsoluteFill style={{backgroundColor: '#1A1A1D', color: '#FF0855', fontSize: 60, alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif'}}>
		Missing diagram: {name}
	</AbsoluteFill>
);

const Overlays: React.FC<{edl: Edl; safeZone: boolean; face: boolean; analysis?: Analysis | null}> = ({edl, safeZone, face, analysis}) => {
	const theme = useTheme();
	const frame = useCurrentFrame();
	const {fps, height} = useVideoConfig();
	const t = frame / fps;
	const segment = edl.segments.find((s) => t >= s.outStart && t < s.outEnd);
	const rush = segment ? segment.srcStart + (t - segment.outStart) : null;
	let box = face && rush !== null ? faceAt(analysis, rush, edl.crop, height) : null;
	if (box && segment?.zoom) {
		const [cx, cy, s] = [540, theme.zoom.originY, theme.zoom.scale];
		box = [cx + (box[0] - cx) * s, cy + (box[1] - cy) * s, box[2] * s, box[3] * s];
	}
	const {x0, x1, y0, y1} = theme.safeZone;
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{safeZone ? (
				<>
					<div style={{position: 'absolute', left: x0, top: y0, width: x1 - x0, height: y1 - y0, border: '4px dashed rgba(255,230,0,0.9)'}} />
					<div style={{position: 'absolute', left: 0, top: 0, right: 0, height: y0, background: 'rgba(255,230,0,0.12)'}} />
					<div style={{position: 'absolute', left: 0, top: y1, right: 0, bottom: 0, background: 'rgba(255,230,0,0.12)'}} />
				</>
			) : null}
			{box ? (
				<div style={{position: 'absolute', left: box[0], top: box[1], width: box[2], height: box[3], border: '5px solid rgba(0,200,255,0.9)', borderRadius: 12}} />
			) : null}
		</AbsoluteFill>
	);
};

// Pieces of speaker cutout over each bg picture: for every kept segment the picture spans, the matte that covers
// that rush range, framed exactly like the rush (zoom included) so the speaker passes in front of the picture.
const cutoutPieces = (edl: Edl, mattes: MatteClip[]) => {
	const pieces: {key: string; from: number; to: number; segment: EdlSegment; matte: MatteClip; offset: number}[] = [];
	for (const asset of edl.assets.filter((a) => a.mode === 'bg')) {
		for (const segment of edl.segments) {
			const from = Math.max(asset.start, segment.outStart);
			const to = Math.min(asset.end, segment.outEnd);
			if (to - from <= 0.001) continue;
			const rushFrom = segment.srcStart + (from - segment.outStart);
			const rushTo = segment.srcStart + (to - segment.outStart);
			const matte = mattes.find((m) => m.start <= rushFrom + 0.01 && m.end >= rushTo - 0.01);
			if (matte) pieces.push({key: `${asset.id}-${segment.id}`, from, to, segment, matte, offset: rushFrom - matte.start});
		}
	}
	return pieces;
};

const Layers: React.FC<MainProps> = ({edl, audio, subscribeFile, mattes, overlays, muted}) => {
	const theme = useTheme();
	const video = useVideoUrl();
	const {fps} = useVideoConfig();
	const toFrame = (seconds: number) => Math.round(seconds * fps);
	const span = (start: number, end: number) => ({from: toFrame(start), durationInFrames: Math.max(1, toFrame(end) - toFrame(start))});
	const preview = audio.mode === 'preview';
	const rush = video(edl.source);

	return (
		<AbsoluteFill style={{backgroundColor: '#000'}}>
			{edl.segments.map((segment) => (
				<Sequence key={segment.id} {...span(segment.outStart, segment.outEnd)} layout="none">
					<SegmentVideo segment={segment} src={rush} crop={edl.crop} muted={!preview || Boolean(muted)} />
				</Sequence>
			))}

			{edl.assets.map((asset) => (
				<Sequence key={asset.id} {...span(asset.start, asset.end)} premountFor={Math.round(fps * 0.5)}>
					<CutInLayer asset={asset} />
				</Sequence>
			))}

			{cutoutPieces(edl, mattes ?? []).map((piece) => (
				<Sequence key={piece.key} {...span(piece.from, piece.to)} premountFor={Math.round(fps * 0.5)}>
					<SegmentVideo segment={piece.segment} src={video(piece.matte.file)} crop={edl.crop} muted srcOffset={piece.offset} transparent />
				</Sequence>
			))}

			{edl.gauges.map((gauge) => (
				<Sequence key={gauge.id} {...span(gauge.start, gauge.end)}>
					<GaugeLayer gauge={gauge} />
				</Sequence>
			))}

			{edl.diagrams.map((diagram) => (
				<Sequence key={diagram.id} {...span(diagram.start, diagram.end)}>
					<DiagramLayer diagram={diagram} slug={edl.slug} />
				</Sequence>
			))}

			{edl.logos.map((logo) => (
				<Sequence key={logo.id} {...span(logo.start, logo.end)}>
					<LogoLayer logo={logo} />
				</Sequence>
			))}

			{edl.concepts.map((concept) => (
				<Sequence key={concept.id} {...span(concept.start, concept.end)}>
					<ConceptText text={concept.text} duration={concept.end - concept.start} style={concept.style} />
				</Sequence>
			))}

			<Captions blocks={edl.captions} hiddenDuring={edl.hideCaptionsDuringConcepts ? edl.concepts : []} />

			{edl.overlaySubscribe && subscribeFile ? (
				<Sequence {...span(edl.overlaySubscribe.start, edl.overlaySubscribe.end)}>
					<SubscribeLayer overlay={edl.overlaySubscribe} src={video(subscribeFile)} />
				</Sequence>
			) : null}

			{!muted && !preview && audio.voice ? <Audio src={video(audio.voice)} /> : null}
			{!muted && !preview && audio.music ? <Audio src={video(audio.music)} /> : null}
			{!muted && preview && edl.music ? <Audio src={video(edl.music.file)} volume={theme.audio.previewMusicGain} loop /> : null}
			{!muted
				? edl.sfx.map((sfx, index) => (
						<Sequence
							key={`${sfx.time}-${sfx.file}-${sfx.reason}-${index}`}
							from={toFrame(sfx.time)}
							durationInFrames={Math.max(1, toFrame(sfx.duration ?? SFX_MAX_S))}
							layout="none"
						>
							<SfxClip
								sfx={sfx}
								index={index}
								gain={preview ? theme.audio.previewSfxGain * (sfx.gain ?? 1) : (audio.sfxGains?.[sfx.file] ?? 0.3) * (sfx.gain ?? 1)}
							/>
						</Sequence>
					))
				: null}

			{overlays?.safeZone || overlays?.face ? (
				<Overlays edl={edl} safeZone={Boolean(overlays.safeZone)} face={Boolean(overlays.face)} analysis={overlays.analysis} />
			) : null}
		</AbsoluteFill>
	);
};

export const Main: React.FC<MainProps> = (props) => {
	const ready = useFonts(props.theme, props.edl, props.media.libraryBase);
	return (
		<CompositionProvider theme={props.theme} media={props.media}>
			{ready ? <Layers {...props} /> : <AbsoluteFill style={{backgroundColor: '#000'}} />}
		</CompositionProvider>
	);
};
