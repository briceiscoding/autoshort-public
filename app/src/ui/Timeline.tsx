// Timeline in OUTPUT time: one track per event type, drag to move, drag edges to resize.
import React, {useEffect, useRef, useState} from 'react';
import type {EdlSegment} from '../edl/types';
import {fmtTime, player, useDerived} from './context';
import {editor, useEditor, type Selection} from './editorStore';
import {Icon} from './icons';
import {HelpLink} from './Help';
import {moveEvent, moveSfx, type EventKind} from './ops';

type Bar = {
	key: string;
	kind: Exclude<EventKind, 'sfx'>;
	id: string;
	start: number;
	end: number;
	label: string;
	className?: string;
	ticks?: number[];
};

const LABEL_W = 92;

export const Timeline: React.FC = () => {
	const {edl, plan, warnings} = {...useDerived(), plan: useEditor((s) => s.plan)!};
	const [pps, setPps] = useState(26); // pixels per second
	const time = useEditor((s) => s.time);
	const selection = useEditor((s) => s.selection);
	const scroller = useRef<HTMLDivElement>(null);
	const width = Math.max(600, edl.durationAfter * pps + 40);
	const x = (t: number) => t * pps;

	const clampTime = (t: number) => Math.max(0, Math.min(edl.durationAfter, t));
	// Scrubbing: press on the ruler, a track background or the playhead handle, then drag; the video pauses meanwhile.
	const scrubbing = useRef<{left: number} | null>(null);
	const startScrub = (e: React.PointerEvent, left: number) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		if (player.isPlaying()) player.toggle();
		scrubbing.current = {left};
		player.seek(clampTime((e.clientX - left) / pps));
	};
	const scrubMove = (e: React.PointerEvent) => {
		if (scrubbing.current) player.seek(clampTime((e.clientX - scrubbing.current.left) / pps));
	};
	const scrubEnd = () => {
		scrubbing.current = null;
	};
	// Props for a track or the ruler: press anywhere on its background to seek, keep the button down to scrub.
	const scrub = {
		onPointerDown: (e: React.PointerEvent) => startScrub(e, (e.currentTarget as HTMLElement).getBoundingClientRect().left),
		onPointerMove: scrubMove,
		onPointerUp: scrubEnd,
		onPointerCancel: scrubEnd,
	};
	const inner = useRef<HTMLDivElement>(null);

	// Keep the playhead in view (playing, going back to the start, a check clicked far away), not while scrubbing.
	useEffect(() => {
		const el = scroller.current;
		if (!el || scrubbing.current) return;
		const pos = x(time);
		const visible = el.clientWidth - LABEL_W;
		if (pos < el.scrollLeft + 8 || pos > el.scrollLeft + visible - 24) el.scrollLeft = Math.max(0, pos - (pos < el.scrollLeft ? 40 : visible * 0.25));
	}, [time, pps]);

	const isSel = (kind: string, id: string) => selection && 'id' in selection && selection.kind === kind && selection.id === id;

	// Cuts between kept segments (output time position + rush range of the cut).
	const cuts: {at: number; rushStart: number; rushEnd: number}[] = [];
	const spans = [...plan.spans].sort((a, b) => a.start - b.start);
	for (const s of spans) {
		if (s.keep) continue;
		const next = edl.segments.find((g) => g.srcStart >= s.end - 0.0005);
		cuts.push({at: next ? next.outStart : edl.durationAfter, rushStart: s.start, rushEnd: s.end});
	}

	const bars: Record<string, Bar[]> = {
		Concepts: edl.concepts.map((c) => ({key: c.id, kind: 'concept', id: c.id, start: c.start, end: c.end, label: c.text})),
		Logos: edl.logos.map((l) => ({key: l.id, kind: 'logo', id: l.id, start: l.start, end: l.end, label: l.trigger || l.file.split('/').pop()!})),
		Assets: [
			...edl.assets.map((a): Bar => ({key: a.id, kind: 'cutIn', id: a.id, start: a.start, end: a.end, label: `${a.mode} · ${a.file.split('/').pop()}`, className: `mode-${a.mode}`})),
			...edl.gauges.map((g): Bar => ({key: g.id, kind: 'gauge', id: g.id, start: g.start, end: g.end, label: `gauge · ${g.label}`, className: 'mode-gauge'})),
		],
		Diagrams: edl.diagrams.map((d) => ({
			key: d.id,
			kind: 'diagram',
			id: d.id,
			start: d.start,
			end: d.end,
			label: `${d.template} · ${d.id}`,
			ticks: d.elements.map((e) => e.start),
		})),
	};

	return (
		<div className="timeline">
			<div className="timeline-tools">
				<button className="icon-btn" onClick={() => player.seek(0)} title="Back to the start (Home)" aria-label="Back to the start">
					<Icon name="start" />
				</button>
				<button className="icon-btn" onClick={() => player.toggle()} title="Play / pause (Space)" aria-label="Play or pause">
					<Icon name={player.isPlaying() ? 'pause' : 'play'} />
				</button>
				<button className="icon-btn" onClick={() => player.seek(player.duration())} title="Go to the end (End)" aria-label="Go to the end">
					<Icon name="end" />
				</button>
				<span className="mono">{fmtTime(time)}</span>
				<label className="small">
					Zoom <input type="range" min={8} max={160} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
				</label>
				<HelpLink to="timeline" />
				<span className="muted small">Click or drag the ruler / the playhead to move in time · drag bars to move · drag their edges to resize · red ticks are cuts</span>
			</div>
			<div className="timeline-scroll" ref={scroller}>
				<div className="timeline-inner" ref={inner} style={{width: width + LABEL_W}}>
					<Row label="Time">
						<div className="ruler" style={{width}} {...scrub}>
							{Array.from({length: Math.ceil(edl.durationAfter) + 1}, (_, s) =>
								s % (pps < 14 ? 5 : pps < 40 ? 2 : 1) === 0 ? (
									<span key={s} className="tick" style={{left: x(s)}}>
										{s}
									</span>
								) : null,
							)}
							{warnings
								.filter((w) => w.severity !== 'info')
								.map((w) => (
									<span
										key={w.id}
										className={`lint-dot ${w.severity}`}
										style={{left: x(w.time)}}
										title={w.message}
										onPointerDown={(e) => {
											e.stopPropagation();
											player.seek(w.time);
										}}
									/>
								))}
						</div>
					</Row>
					<Row label="Segments">
						<div className="track" style={{width}} {...scrub}>
							{edl.segments.map((s) => (
								<SegmentBlock key={s.id} segment={s} x={x} selected={Boolean(isSel('span', s.id))} />
							))}
							{cuts.map((c) => (
								<span
									key={`${c.rushStart}`}
									className={`cut-marker ${selection?.kind === 'cut' && Math.abs(selection.at - c.rushStart) < 0.001 ? 'selected' : ''}`}
									style={{left: x(c.at) - 5}}
									title={`Cut ${c.rushStart.toFixed(2)}-${c.rushEnd.toFixed(2)} s (rush): click to inspect`}
									onPointerDown={(e) => {
										e.stopPropagation();
										editor.select({kind: 'cut', at: c.rushStart});
										player.seek(c.at);
									}}
								/>
							))}
						</div>
					</Row>
					<Row label="Captions">
						<div className="track captions-track" style={{width}} {...scrub}>
							{edl.captions.map((b) => (
								<span
									key={b.words[0].id}
									className={`bar caption ${b.words.some((w) => w.highlight) ? 'has-hl' : ''} ${selection?.kind === 'word' && b.words.some((w) => w.id === selection.id) ? 'selected' : ''}`}
									style={{left: x(b.start), width: Math.max(2, x(b.end - b.start))}}
									title={b.text}
									onPointerDown={(e) => {
										e.stopPropagation();
										editor.select({kind: 'word', id: b.words[0].id});
										player.seek(b.start);
									}}
								>
									{b.text}
								</span>
							))}
						</div>
					</Row>
					{Object.entries(bars).map(([label, list]) => (
						<Row key={label} label={label}>
							<div className="track" style={{width}} {...scrub}>
								{list.map((bar) => (
									<DraggableBar key={bar.key} bar={bar} pps={pps} selected={Boolean(isSel(bar.kind, bar.id))} />
								))}
							</div>
						</Row>
					))}
					<Row label="SFX">
						<div className="track sfx-track" style={{width}} {...scrub}>
							{edl.sfx.map((s, i) => {
								const manual = plan.sfx.find((m) => m.id === s.ref);
								const sel: Selection = manual ? {kind: 'sfx', id: manual.id} : {kind: 'autoSfx', index: i};
								return (
									<SfxTick key={`${i}-${s.time}`} time={s.time} label={`${s.file} · ${s.reason}`} manualId={manual?.id} pps={pps} selection={sel}
										selected={manual ? Boolean(isSel('sfx', manual.id)) : selection?.kind === 'autoSfx' && selection.index === i} />
								);
							})}
						</div>
					</Row>
					<Row label="Music">
						<div className="track" style={{width}} {...scrub}>
							{edl.music ? (
								<span className={`bar music ${selection?.kind === 'music' ? 'selected' : ''}`} style={{left: 0, width: x(edl.durationAfter)}}
									onPointerDown={(e) => { e.stopPropagation(); editor.select({kind: 'music'}); }}>
									{edl.music.file.split('/').pop()} · -{edl.music.underVoiceDb} dB under voice
								</span>
							) : null}
						</div>
					</Row>
					<Row label="Overlay">
						<div className="track" style={{width}} {...scrub}>
							{edl.overlaySubscribe ? (
								<span className={`bar overlay ${selection?.kind === 'subscribe' ? 'selected' : ''}`}
									style={{left: x(edl.overlaySubscribe.start), width: x(edl.overlaySubscribe.end - edl.overlaySubscribe.start)}}
									onPointerDown={(e) => { e.stopPropagation(); editor.select({kind: 'subscribe'}); player.seek(edl.overlaySubscribe!.start); }}>
									subscribe
								</span>
							) : null}
						</div>
					</Row>
					<div className="playhead" style={{left: LABEL_W + x(time)}}>
						<div
							className="playhead-handle"
							title="Drag to move in time"
							onPointerDown={(e) => startScrub(e, (inner.current?.getBoundingClientRect().left ?? 0) + LABEL_W)}
							onPointerMove={scrubMove}
							onPointerUp={scrubEnd}
							onPointerCancel={scrubEnd}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

const Row: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
	<div className="tl-row">
		<div className="tl-label">{label}</div>
		{children}
	</div>
);

const SegmentBlock: React.FC<{segment: EdlSegment; x: (t: number) => number; selected: boolean}> = ({segment, x, selected}) => (
	<span
		className={`bar segment ${segment.zoom ? 'zoom' : ''} ${selected ? 'selected' : ''}`}
		style={{left: x(segment.outStart), width: Math.max(2, x(segment.outEnd - segment.outStart))}}
		title={`${segment.text}\nrush ${segment.srcStart.toFixed(2)}-${segment.srcEnd.toFixed(2)}${segment.zoom ? ' · zoom' : ''}`}
		onPointerDown={(e) => {
			e.stopPropagation();
			editor.select({kind: 'span', id: segment.id});
			const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
			player.seek(Math.max(segment.outStart, (e.clientX - rect.left) / (x(1) || 1)));
		}}
	>
		{segment.zoom ? 'Z ' : ''}
		{segment.text}
	</span>
);

const DraggableBar: React.FC<{bar: Bar; pps: number; selected: boolean}> = ({bar, pps, selected}) => {
	const drag = useRef<{mode: 'move' | 'left' | 'right'; x0: number; start: number; end: number; moved: boolean} | null>(null);
	const onDown = (mode: 'move' | 'left' | 'right') => (e: React.PointerEvent) => {
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag.current = {mode, x0: e.clientX, start: bar.start, end: bar.end, moved: false};
		editor.select({kind: bar.kind, id: bar.id});
	};
	const onMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dt = (e.clientX - d.x0) / pps;
		if (!d.moved) {
			if (Math.abs(e.clientX - d.x0) < 3) return;
			d.moved = true;
			editor.beginGesture();
		}
		let start = d.start;
		let end = d.end;
		if (d.mode === 'move') {
			start = Math.max(0, d.start + dt);
			end = start + (d.end - d.start);
		} else if (d.mode === 'left') start = Math.min(d.end - 0.1, Math.max(0, d.start + dt));
		else end = Math.max(d.start + 0.1, d.end + dt);
		editor.applyLive((p) => moveEvent(p, bar.kind, bar.id, start, end));
	};
	const onUp = () => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved) player.seek(bar.start);
	};
	return (
		<span
			className={`bar event ${bar.className ?? ''} ${selected ? 'selected' : ''}`}
			style={{left: bar.start * pps, width: Math.max(4, (bar.end - bar.start) * pps)}}
			title={`${bar.label} · ${bar.start.toFixed(2)}-${bar.end.toFixed(2)} s`}
			onPointerDown={onDown('move')}
			onPointerMove={onMove}
			onPointerUp={onUp}
		>
			<span className="edge left" onPointerDown={onDown('left')} onPointerMove={onMove} onPointerUp={onUp} />
			{bar.label}
			{bar.ticks?.map((t, i) => <span key={i} className="el-tick" style={{left: (t - bar.start) * pps}} />)}
			<span className="edge right" onPointerDown={onDown('right')} onPointerMove={onMove} onPointerUp={onUp} />
		</span>
	);
};

const SfxTick: React.FC<{time: number; label: string; manualId?: string; pps: number; selection: Selection; selected: boolean}> = ({time, label, manualId, pps, selection, selected}) => {
	const drag = useRef<{x0: number; t0: number; moved: boolean} | null>(null);
	return (
		<span
			className={`sfx-tick ${manualId ? 'manual' : 'auto'} ${selected ? 'selected' : ''}`}
			style={{left: time * pps - 4}}
			title={`${label} @ ${time.toFixed(2)} s${manualId ? ' (drag to move)' : ' (automatic, from the theme rules)'}`}
			onPointerDown={(e) => {
				e.stopPropagation();
				editor.select(selection);
				if (manualId) {
					(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
					drag.current = {x0: e.clientX, t0: time, moved: false};
				}
			}}
			onPointerMove={(e) => {
				const d = drag.current;
				if (!d || !manualId) return;
				if (!d.moved) {
					if (Math.abs(e.clientX - d.x0) < 3) return;
					d.moved = true;
					editor.beginGesture();
				}
				editor.applyLive((p) => moveSfx(p, manualId, d.t0 + (e.clientX - d.x0) / pps));
			}}
			onPointerUp={() => {
				if (drag.current && !drag.current.moved) player.seek(time);
				drag.current = null;
			}}
		/>
	);
};
