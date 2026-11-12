// Remotion Player with the theme applied, overlays, and direct manipulation of the selected logo or card.
import {Player, type PlayerRef} from '@remotion/player';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {activeBlock, layoutBlock} from '../composition/Captions';
import {captionRect, conceptRect, logoRect, screenRect, snapToCenter, type Rect} from '../composition/geometry';
import {Main, type MainProps} from '../composition/Main';
import {round3} from '../edl/time';
import type {CutIn, Logo, Plan} from '../model/plan';
import {player, useDerived} from './context';
import {editor, useEditor} from './editorStore';
import {setConceptStyle, setVideoStyle, updateEvent} from './ops';

export const Preview: React.FC = () => {
	const {edl, theme, slug, video, analysis} = useDerived();
	const ref = useRef<PlayerRef>(null);
	const overlays = useEditor((s) => s.overlays);
	const [muted, setMuted] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(360);

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			const h = el.clientHeight - 8;
			setWidth(Math.max(200, Math.min(el.clientWidth - 8, (h * 9) / 16)));
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const p = ref.current;
		if (!p) return;
		const onFrame = (e: {detail: {frame: number}}) => editor.set({time: e.detail.frame / edl.fps});
		p.addEventListener('frameupdate', onFrame);
		p.addEventListener('seeked', onFrame);
		player.seek = (t) => p.seekTo(Math.round(t * edl.fps));
		player.toggle = () => p.toggle();
		player.isPlaying = () => p.isPlaying();
		return () => {
			p.removeEventListener('frameupdate', onFrame);
			p.removeEventListener('seeked', onFrame);
		};
	}, [edl.fps]);

	const inputProps: MainProps = useMemo(
		() => ({
			edl,
			theme,
			media: {videoBase: `/media/${encodeURIComponent(slug)}`, libraryBase: '/library'},
			audio: {mode: 'preview'},
			subscribeFile: video.prepared.subscribe,
			mattes: video.prepared.mattes,
			overlays: {safeZone: overlays.safeZone, face: overlays.face, analysis},
			muted,
		}),
		[edl, theme, slug, video.prepared.subscribe, video.prepared.mattes, overlays, analysis, muted],
	);

	const durationInFrames = Math.max(1, Math.round(edl.durationAfter * edl.fps));
	const height = (width * 16) / 9;

	return (
		<div className="preview">
			<div className="preview-toolbar">
				<label><input type="checkbox" checked={overlays.safeZone} onChange={(e) => editor.set({overlays: {...overlays, safeZone: e.target.checked}})} /> Safe zone</label>
				<label><input type="checkbox" checked={overlays.face} onChange={(e) => editor.set({overlays: {...overlays, face: e.target.checked}})} /> Face box</label>
				<label><input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /> Mute</label>
				{edl.overlaySubscribe && !video.prepared.subscribe ? <span className="muted small">subscribe overlay not prepared (Jobs → Preview media)</span> : null}
				<span className="muted small">preview audio is approximate</span>
			</div>
			<div className="player-box" ref={box}>
				<div className="player-frame" style={{width, height}}>
					<Player
						ref={ref}
						component={Main as unknown as React.FC<Record<string, unknown>>}
						inputProps={inputProps as unknown as Record<string, unknown>}
						durationInFrames={durationInFrames}
						fps={edl.fps}
						compositionWidth={edl.width}
						compositionHeight={edl.height}
						style={{width, height}}
						controls
						clickToPlay={false}
						doubleClickToFullscreen
						acknowledgeRemotionLicense
						// Diagram elements, logos and concepts can stack several SFX at once (default limit: 5).
						numberOfSharedAudioTags={16}
					/>
					<DragHandles scale={width / edl.width} />
				</div>
			</div>
		</div>
	);
};

// What can be dragged on the preview: the selected logo, screen card or concept, or a whole type of text (Styles tab).
type Draggable = {
	rect: Rect;
	text: boolean;
	// Plan change for a move (dx, dy) or a resize (dx, dy) from the gesture start, in canvas px.
	patch: (mode: 'move' | 'resize', dx: number, dy: number) => (plan: Plan) => Plan;
};

const useDraggable = (): Draggable | null => {
	const {edl, theme} = useDerived();
	const selection = useEditor((s) => s.selection);
	const time = useEditor((s) => s.time);
	const plan = useEditor((s) => s.plan)!;
	const visible = (e: {start: number; end: number}) => time >= e.start - 0.01 && time < e.end;
	const center = (r: Rect) => ({cx: r.x + r.w / 2, cy: r.y + r.h / 2});

	if (selection?.kind === 'logo') {
		const logo = edl.logos.find((l) => l.id === selection.id);
		if (!logo || !visible(logo) || !plan.logos.some((l) => l.id === logo.id)) return null;
		const rect = logoRect(logo, theme);
		const {cx, cy} = center(rect);
		return {
			rect,
			text: false,
			patch: (mode, dx, dy) => (p) =>
				updateEvent<Logo>(p, 'logo', logo.id, mode === 'move' ? {x: round3(cx + dx), y: round3(cy + dy)} : {size: Math.max(40, Math.round(rect.h + dy * 2))}),
		};
	}
	if (selection?.kind === 'cutIn') {
		const asset = edl.assets.find((a) => a.id === selection.id);
		if (!asset || asset.mode !== 'screen' || !visible(asset)) return null;
		const rect = screenRect(asset, theme);
		const {cx, cy} = center(rect);
		return {
			rect,
			text: false,
			patch: (mode, dx, dy) => (p) =>
				updateEvent<CutIn>(p, 'cutIn', asset.id, mode === 'move' ? {x: round3(cx + dx), y: round3(cy + dy)} : {width: Math.max(200, Math.round(rect.w + dx * 2))}),
		};
	}
	if (selection?.kind === 'concept') {
		const concept = edl.concepts.find((c) => c.id === selection.id);
		if (!concept || !visible(concept)) return null;
		const rect = conceptRect(concept.text, concept.style, theme);
		const {style} = concept;
		return {
			rect,
			text: true,
			patch: (mode, dx, dy) => (p) =>
				setConceptStyle(
					p,
					concept.id,
					mode === 'move' ? {x: Math.round(style.x + dx), y: Math.round(style.y + dy)} : {size: Math.max(20, Math.round((style.size * (rect.h + dy * 2)) / rect.h))},
				),
		};
	}
	if (selection?.kind === 'textStyle' && (selection.target === 'caption' || selection.target === 'highlight')) {
		const block = activeBlock(edl.captions, time, edl.hideCaptionsDuringConcepts ? edl.concepts : [], theme.concepts.fadeS);
		const rect = captionRect(block ? layoutBlock(block.words, theme).lines.length : 1, theme);
		const style = theme.textStyles.caption;
		return {
			rect,
			text: true,
			patch: (mode, dx, dy) => (p) =>
				setVideoStyle(p, 'caption', mode === 'move' ? {x: Math.round(style.x + dx), y: Math.round(style.y + dy)} : {maxWidth: Math.max(200, Math.round(style.maxWidth + dx * 2))}),
		};
	}
	if (selection?.kind === 'textStyle' && selection.target === 'concept') {
		// The concept style of the video, at its own position (a concept with its own look may sit elsewhere).
		const shown = edl.concepts.find(visible);
		const style = theme.textStyles.concept;
		const rect = conceptRect(shown?.text ?? 'CONCEPT', style, theme);
		return {
			rect,
			text: true,
			patch: (mode, dx, dy) => (p) =>
				setVideoStyle(
					p,
					'concept',
					mode === 'move' ? {x: Math.round(style.x + dx), y: Math.round(style.y + dy)} : {size: Math.max(20, Math.round((style.size * (rect.h + dy * 2)) / rect.h))},
				),
		};
	}
	return null;
};

// Move / resize the selected item directly on the preview (one undo step per gesture).
// Screen pixels within which a moved item sticks to the vertical / horizontal centre line of the canvas.
const SNAP_SCREEN_PX = 8;

const DragHandles: React.FC<{scale: number}> = ({scale}) => {
	const {edl} = useDerived();
	const draggable = useDraggable();
	const drag = useRef<{mode: 'move' | 'resize'; x: number; y: number; target: Draggable} | null>(null);
	const [guides, setGuides] = useState({vertical: false, horizontal: false});
	if (!draggable) return null;
	const {rect} = draggable;
	const canvas = {width: edl.width, height: edl.height};

	const onDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
		e.stopPropagation();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		drag.current = {mode, x: e.clientX, y: e.clientY, target: draggable};
		editor.beginGesture();
	};
	const onMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		let dx = (e.clientX - d.x) / scale;
		let dy = (e.clientY - d.y) / scale;
		if (d.mode === 'move') {
			const snap = snapToCenter(d.target.rect, dx, dy, canvas, SNAP_SCREEN_PX / scale);
			({dx, dy} = snap);
			if (snap.vertical !== guides.vertical || snap.horizontal !== guides.horizontal) setGuides({vertical: snap.vertical, horizontal: snap.horizontal});
		}
		editor.applyLive(d.target.patch(d.mode, dx, dy));
	};
	const onUp = () => {
		drag.current = null;
		setGuides({vertical: false, horizontal: false});
	};

	return (
		<>
			{guides.vertical ? <div className="snap-guide vertical" style={{left: (canvas.width / 2) * scale}} /> : null}
			{guides.horizontal ? <div className="snap-guide horizontal" style={{top: (canvas.height / 2) * scale}} /> : null}
			<div
				className={`drag-box${draggable.text ? ' text' : ''}`}
				style={{left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale}}
				onPointerDown={onDown('move')}
				onPointerMove={onMove}
				onPointerUp={onUp}
				title="Drag to move (sticks to the centre lines)"
			>
				<div className="drag-resize" onPointerDown={onDown('resize')} onPointerMove={onMove} onPointerUp={onUp} title="Drag to resize" />
			</div>
		</>
	);
};
