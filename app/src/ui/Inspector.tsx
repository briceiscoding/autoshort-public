// Properties of the selected item. Times are shown in OUTPUT seconds (what the preview shows).
import React from 'react';
import {TEMPLATE_INFO} from '../composition/diagrams/templates';
import {iconNames} from '../composition/diagrams/icons';
import {keptSegments, outputToRush, round3, rushToOutput, segmentOfWord} from '../edl/time';
import type {CutIn, Diagram, DiagramElement, Gauge, Logo, Plan} from '../model/plan';
import {fmtTime, player, useDerived} from './context';
import {editor, useEditor} from './editorStore';
import * as ops from './ops';
import {JobsPanel} from './Panels';
import {HelpLink} from './Help';
import {ConceptStyleSection, CutInFrameSection, StylesPanel} from './Styles';

const ICON_LIST = iconNames();

const Num: React.FC<{label: string; value: number | undefined; step?: number; min?: number; max?: number; onChange: (v: number | undefined) => void; placeholder?: string}> = ({
	label,
	value,
	step = 0.01,
	min,
	max,
	onChange,
	placeholder,
}) => (
	<label className="field">
		<span>{label}</span>
		<input
			type="number"
			step={step}
			min={min}
			max={max}
			value={value ?? ''}
			placeholder={placeholder}
			onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
		/>
	</label>
);

const Range: React.FC<{label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void}> = ({label, value, min, max, step, onChange}) => (
	<label className="field">
		<span>
			{label} <span className="muted">{value}</span>
		</span>
		<input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
	</label>
);

const Check: React.FC<{label: string; value: boolean; onChange: (v: boolean) => void}> = ({label, value, onChange}) => (
	<label className="check">
		<input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}
	</label>
);

const apply = editor.apply.bind(editor);

// Start/end of a timed event, edited in output time.
const TimeFields: React.FC<{kind: Exclude<ops.EventKind, 'sfx'>; id: string; start: number; end: number}> = ({kind, id, start, end}) => {
	const {segments} = useDerived();
	const s = rushToOutput(segments, start);
	const e = rushToOutput(segments, end);
	return (
		<div className="row">
			<Num label="Start (s)" value={s} onChange={(v) => v !== undefined && apply((p) => ops.moveEvent(p, kind, id, v, v + (e - s)))} />
			<Num label="End (s)" value={e} onChange={(v) => v !== undefined && apply((p) => ops.moveEvent(p, kind, id, s, v))} />
			<button className="small" title="Start at the playhead" onClick={() => apply((p) => ops.moveEvent(p, kind, id, editor.get().time, editor.get().time + (e - s)))}>
				⇤ playhead
			</button>
			<button className="small" title="End at the playhead" onClick={() => apply((p) => ops.moveEvent(p, kind, id, s, Math.max(s + 0.1, editor.get().time)))}>
				playhead ⇥
			</button>
		</div>
	);
};

const AssetSelect: React.FC<{value: string; kinds: string[]; onChange: (v: string) => void}> = ({value, kinds, onChange}) => {
	const plan = useEditor((s) => s.plan)!;
	return (
		<label className="field">
			<span>Asset</span>
			<select value={value} onChange={(e) => onChange(e.target.value)}>
				{plan.assets
					.filter((a) => kinds.includes(a.kind) || a.id === value)
					.map((a) => (
						<option key={a.id} value={a.id}>
							{a.file.replace(/^assets\//, '')} ({a.kind}
							{a.width ? ` ${a.width}x${a.height}` : ''})
						</option>
					))}
			</select>
		</label>
	);
};

const Delete: React.FC<{kind: ops.EventKind; id: string}> = ({kind, id}) => (
	<button
		className="danger"
		onClick={() => {
			apply((p) => ops.removeEvent(p, kind, id));
			editor.select(null);
		}}
	>
		Delete
	</button>
);

export const Inspector: React.FC = () => {
	const selection = useEditor((s) => s.selection);
	const plan = useEditor((s) => s.plan)!;
	if (!selection) return <Overview />;
	switch (selection.kind) {
		case 'word':
			return <WordInspector id={selection.id} />;
		case 'span':
			return <SpanInspector id={selection.id} />;
		case 'cut':
			return <CutInspector at={selection.at} />;
		case 'concept': {
			const c = plan.concepts.find((x) => x.id === selection.id);
			if (!c) return <Overview />;
			return (
				<div className="inspector">
					<h3>Concept <HelpLink to="concepts" /></h3>
					<label className="field">
						<span>Text (1 to 3 words, shown uppercase)</span>
						<input value={c.text} onChange={(e) => apply((p) => ops.updateEvent(p, 'concept', c.id, {text: e.target.value}))} />
					</label>
					<TimeFields kind="concept" id={c.id} start={c.start} end={c.end} />
					<ConceptStyleSection concept={c} />
					<Delete kind="concept" id={c.id} />
				</div>
			);
		}
		case 'logo': {
			const l = plan.logos.find((x) => x.id === selection.id);
			return l ? <LogoInspector logo={l} /> : <Overview />;
		}
		case 'cutIn': {
			const c = plan.cutIns.find((x) => x.id === selection.id);
			return c ? <CutInInspector cutIn={c} /> : <Overview />;
		}
		case 'gauge': {
			const g = plan.gauges.find((x) => x.id === selection.id);
			return g ? <GaugeInspector gauge={g} /> : <Overview />;
		}
		case 'diagram': {
			const d = plan.diagrams.find((x) => x.id === selection.id);
			return d ? <DiagramInspector diagram={d} /> : <Overview />;
		}
		case 'sfx': {
			const s = plan.sfx.find((x) => x.id === selection.id);
			return s ? <SfxInspector id={s.id} /> : <Overview />;
		}
		case 'autoSfx':
			return <AutoSfxInspector index={selection.index} />;
		case 'music':
			return <MusicInspector />;
		case 'subscribe':
			return <SubscribeInspector />;
		case 'textStyle':
			return <StylesPanel />;
	}
};

const Overview: React.FC = () => {
	const {edl} = useDerived();
	const plan = useEditor((s) => s.plan)!;
	const cuts = plan.spans.filter((s) => !s.keep);
	return (
		<div className="inspector">
			<h3>Nothing selected <HelpLink to="apercu" /></h3>
			<p className="muted small">Select a bar on the timeline, a word in the Transcript tab, or a check.</p>
			<table className="kv">
				<tbody>
					<tr><td>Before / after cuts</td><td>{plan.source.duration.toFixed(2)} s → {edl.durationAfter.toFixed(2)} s</td></tr>
					<tr><td>Cuts</td><td>{cuts.length} ({cuts.reduce((s, c) => s + c.end - c.start, 0).toFixed(2)} s)</td></tr>
					<tr><td>Caption blocks</td><td>{edl.captions.length}, {plan.words.filter((w) => w.highlight).length} highlights</td></tr>
					<tr><td>Concepts / logos / assets</td><td>{plan.concepts.length} / {plan.logos.length} / {plan.cutIns.length + plan.gauges.length}</td></tr>
					<tr><td>Diagrams</td><td>{plan.diagrams.map((d) => `${d.id} (${d.template})`).join(', ') || 'none'}</td></tr>
					<tr><td>SFX</td><td>{edl.sfx.length} ({plan.sfx.length} manual)</td></tr>
					<tr><td>Subscribe overlay</td><td>{plan.subscribe ? `yes at ${fmtTime(edl.overlaySubscribe!.start)}` : 'no'}</td></tr>
					<tr><td>Rush</td><td>{plan.source.rush} · {plan.source.width}x{plan.source.height} · {plan.source.fps} fps</td></tr>
				</tbody>
			</table>
			{cuts.length ? (
				<div className="note warn">
					<span className="small">This video has {cuts.length} cut(s). Your rush is already edited: restore them to keep everything.</span>
					<button onClick={() => apply((p) => ops.restoreAllCuts(p))}>Restore all cuts</button>
				</div>
			) : null}
			<h4>Rules (theme overrides for this video)</h4>
			<Check label="Hide captions during concepts" value={plan.hideCaptionsDuringConcepts} onChange={(v) => apply((p) => ({...p, hideCaptionsDuringConcepts: v}))} />
			{!plan.subscribe ? (
				<button onClick={() => apply((p) => ({...p, subscribe: {start: outputToRush(keptSegments(p), editor.get().time), scale: 0.33, x: 332, y: -72, keyColor: '0x00983B'}}))}>
					Add subscribe overlay at playhead
				</button>
			) : null}
		</div>
	);
};

const WordInspector: React.FC<{id: string}> = ({id}) => {
	const plan = useEditor((s) => s.plan)!;
	const {segments} = useDerived();
	const word = plan.words.find((w) => w.id === id);
	if (!word) return null;
	const kept = Boolean(segmentOfWord(segments, word));
	const sorted = [...plan.words].sort((a, b) => a.start - b.start);
	const index = sorted.findIndex((w) => w.id === id);
	return (
		<div className="inspector">
			<h3>
				Word <span className="muted small">{word.start.toFixed(2)}-{word.end.toFixed(2)} s rush{word.score != null ? ` · confidence ${Math.round(word.score * 100)} %` : ''}</span>
			</h3>
			<label className="field">
				<span>Text (corrections only, never invent){word.original ? <em className="muted"> · was “{word.original}”</em> : null}</span>
				<input value={word.text} onChange={(e) => e.target.value.trim() && apply((p) => ops.updateWord(p, id, {text: e.target.value}))} />
			</label>
			<Check label="Highlight (accent background, magnifier)" value={Boolean(word.highlight)} onChange={(v) => apply((p) => ops.updateWord(p, id, {highlight: v || undefined}))} />
			<Check label="Starts a new caption block" value={Boolean(word.blockStart)} onChange={(v) => apply((p) => ops.updateWord(p, id, {blockStart: v || undefined}))} />
			<div className="row">
				<Check label="CTA word (the word to comment, its own style)" value={Boolean(word.keyword)} onChange={(v) => apply((p) => ops.updateWord(p, id, {keyword: v || undefined}))} />
				<button className="small" onClick={() => editor.select({kind: 'textStyle', target: 'keyword'})}>Style</button>
			</div>
			<div className="row">
				{kept ? (
					<button onClick={() => apply((p) => ops.cutWords(p, id, id))}>Cut this word</button>
				) : (
					<button onClick={() => apply((p) => ops.restoreRange(p, word.start, word.end))}>Restore (un-cut)</button>
				)}
				<button onClick={() => player.seek(rushToOutput(segments, word.start))}>Play from here</button>
				{index > 0 ? <button onClick={() => editor.select({kind: 'word', id: sorted[index - 1].id})}>← prev</button> : null}
				{index < sorted.length - 1 ? <button onClick={() => editor.select({kind: 'word', id: sorted[index + 1].id})}>next →</button> : null}
			</div>
			<div className="row">
				<button
					onClick={() => {
						const t = rushToOutput(segments, word.start);
						apply((p) => ops.addConcept(p, word.text.replace(/[.,!?;:]+$/, ''), word.start, outputToRush(segments, t + 2)));
					}}
				>
					Make it a concept
				</button>
			</div>
		</div>
	);
};

const SpanInspector: React.FC<{id: string}> = ({id}) => {
	const plan = useEditor((s) => s.plan)!;
	const span = plan.spans.find((s) => s.id === id);
	const time = useEditor((s) => s.time);
	const {segments} = useDerived();
	if (!span) return null;
	const words = plan.words.filter((w) => w.start >= span.start - 0.03 && w.start < span.end - 0.005);
	return (
		<div className="inspector">
			<h3>Kept segment <HelpLink to="coupes" /> <span className="muted small">rush {span.start.toFixed(2)}-{span.end.toFixed(2)} s</span></h3>
			<p className="small">{words.map((w) => w.text).join(' ')}</p>
			<Check label={`Zoom punch-in (x${useDerived().theme.zoom.scale})`} value={span.zoom} onChange={(v) => apply((p) => ops.updateSpan(p, id, {zoom: v}))} />
			<Check label="Zoom SFX at its start" value={Boolean(span.zoomSfx)} onChange={(v) => apply((p) => ops.updateSpan(p, id, {zoomSfx: v || undefined}))} />
			<div className="row">
				<span className="small">Start boundary</span>
				<button onClick={() => apply((p) => ops.nudgeBoundary(p, span.start, -1))}>◀ word</button>
				<button onClick={() => apply((p) => ops.nudgeBoundary(p, span.start, 1))}>word ▶</button>
			</div>
			<div className="row">
				<span className="small">End boundary</span>
				<button onClick={() => apply((p) => ops.nudgeBoundary(p, span.end, -1))}>◀ word</button>
				<button onClick={() => apply((p) => ops.nudgeBoundary(p, span.end, 1))}>word ▶</button>
			</div>
			<div className="row">
				<button onClick={() => apply((p) => ops.splitSpanAt(p, outputToRush(segments, time)))}>Split at playhead</button>
				<button className="danger" onClick={() => apply((p) => ops.toggleSpan(p, id))}>Cut this segment</button>
			</div>
			<p className="muted small">Boundaries snap to word starts and ends. Splitting lets you zoom part of a segment.</p>
		</div>
	);
};

const CutInspector: React.FC<{at: number}> = ({at}) => {
	const plan = useEditor((s) => s.plan)!;
	const span = plan.spans.find((s) => !s.keep && Math.abs(s.start - at) < 0.001);
	if (!span) return <p className="muted">Cut not found (it may have been restored).</p>;
	const words = plan.words.filter((w) => w.end > span.start + 0.01 && w.start < span.end - 0.01);
	return (
		<div className="inspector">
			<h3>Cut <span className="muted small">rush {span.start.toFixed(2)}-{span.end.toFixed(2)} s · {(span.end - span.start).toFixed(2)} s · {span.reason ?? 'manual'}</span></h3>
			<p className="small">{words.length ? <s>{words.map((w) => w.text).join(' ')}</s> : <em className="muted">silence</em>}</p>
			<div className="row">
				<button
					className="primary"
					onClick={() => {
						apply((p) => ops.toggleSpan(p, span.id));
						editor.select(null);
					}}
				>
					Restore (toggle cut off)
				</button>
			</div>
			<div className="row">
				<span className="small">Cut start</span>
				<button onClick={() => apply((p) => ops.nudgeBoundary(p, span.start, -1))}>◀ word</button>
				<button onClick={() => apply((p) => ops.nudgeBoundary(p, span.start, 1))}>word ▶</button>
			</div>
			<div className="row">
				<span className="small">Cut end</span>
				<button onClick={() => apply((p) => ops.nudgeBoundary(p, span.end, -1))}>◀ word</button>
				<button onClick={() => apply((p) => ops.nudgeBoundary(p, span.end, 1))}>word ▶</button>
			</div>
		</div>
	);
};

const LogoInspector: React.FC<{logo: Logo}> = ({logo}) => {
	const {theme} = useDerived();
	const set = (patch: Partial<Logo>) => apply((p) => ops.updateEvent<Logo>(p, 'logo', logo.id, patch));
	return (
		<div className="inspector">
			<h3>Logo <HelpLink to="logos" /></h3>
			<AssetSelect value={logo.asset} kinds={['image']} onChange={(asset) => set({asset})} />
			<Range label="Size (height px)" value={logo.size ?? theme.logos.size} min={60} max={600} step={5} onChange={(size) => set({size})} />
			<div className="row">
				<Num label="Centre x" value={logo.x} placeholder={String(theme.logos.centerX)} step={1} onChange={(x) => set({x})} />
				<Num label="Centre y" value={logo.y} placeholder={String(theme.logos.centerY)} step={1} onChange={(y) => set({y})} />
				<button className="small" onClick={() => set({x: undefined, y: undefined, size: undefined, rotate: undefined})}>Reset</button>
			</div>
			<label className="field">
				<span>Background removal (on a copy)</span>
				<select value={logo.process ?? ''} onChange={(e) => set({process: (e.target.value || null) as Logo['process']})}>
					<option value="">none</option>
					<option value="luma_key">luma key (white on black)</option>
					<option value="rembg">rembg (BiRefNet, GPU job)</option>
				</select>
			</label>
			<label className="field">
				<span>Entrance</span>
				<select value={logo.enter && logo.enter !== 'pop' ? logo.enter : ''} onChange={(e) => set({enter: (e.target.value || undefined) as Logo['enter']})}>
					<option value="">Pop (default)</option>
					<option value="top">From the top</option>
					<option value="bottom">From the bottom</option>
					<option value="left">From the left</option>
					<option value="right">From the right</option>
				</select>
			</label>
			<Range label="Shake (px)" value={logo.shake ?? 0} min={0} max={20} step={1} onChange={(v) => set({shake: v || undefined})} />
			<Range label="Rotation (°)" value={logo.rotate ?? 0} min={-180} max={180} step={1} onChange={(v) => set({rotate: v || undefined})} />
			<Check label="Bloop SFX" value={logo.sfx !== false} onChange={(v) => set({sfx: v ? undefined : false})} />
			<TimeFields kind="logo" id={logo.id} start={logo.start} end={logo.end} />
			<p className="muted small">Drag the logo on the preview to move it, its corner to resize, the round handle to turn it. Delete or Backspace removes it.</p>
			<Delete kind="logo" id={logo.id} />
		</div>
	);
};

const CutInInspector: React.FC<{cutIn: CutIn}> = ({cutIn}) => {
	const plan = useEditor((s) => s.plan)!;
	const asset = plan.assets.find((a) => a.id === cutIn.asset);
	const set = (patch: Partial<CutIn>) => apply((p) => ops.updateEvent<CutIn>(p, 'cutIn', cutIn.id, patch));
	return (
		<div className="inspector">
			<h3>Asset cut-in <HelpLink to="images" /></h3>
			<AssetSelect value={cutIn.asset} kinds={['image', 'video']} onChange={(a) => set({asset: a})} />
			<label className="field">
				<span>Display mode</span>
				<select value={cutIn.mode} onChange={(e) => set({mode: e.target.value as CutIn['mode']})}>
					<option value="screen">screen (floating card over the blurred video)</option>
					<option value="full">full (full frame, 9:16 only)</option>
					<option value="bg">bg (behind the head: the speaker is cut out and stays in front)</option>
				</select>
			</label>
			{cutIn.mode === 'bg' ? <BgCutoutStatus cutIn={cutIn} /> : null}
			<label className="field">
				<span>Entrance</span>
				<select value={cutIn.enter ?? ''} onChange={(e) => set({enter: (e.target.value || undefined) as CutIn['enter']})}>
					<option value="">{cutIn.mode === 'full' ? 'Default (cut)' : cutIn.mode === 'bg' ? 'Default (fade and slide up)' : 'Default (fade and grow)'}</option>
					<option value="pop">Pop (grows with a bounce)</option>
					<option value="top">From the top</option>
					<option value="bottom">From the bottom</option>
					<option value="left">From the left</option>
					<option value="right">From the right</option>
				</select>
			</label>
			<Range label="Shake (px)" value={cutIn.shake ?? 0} min={0} max={20} step={1} onChange={(v) => set({shake: v || undefined})} />
			<Range label="Rotation (°)" value={cutIn.rotate ?? 0} min={-180} max={180} step={1} onChange={(v) => set({rotate: v || undefined})} />
			<Range label="Dark veil" value={cutIn.dim ?? 0} min={0} max={0.8} step={0.05} onChange={(v) => set({dim: v || undefined})} />
			{cutIn.mode === 'full' ? <Range label="Zoom" value={cutIn.zoom ?? 1} min={0.3} max={4} step={0.01} onChange={(v) => set({zoom: v === 1 ? undefined : v})} /> : null}
			{asset?.kind === 'video' ? <Num label="Skip first seconds of the video" value={cutIn.trim} min={0} onChange={(v) => set({trim: v})} /> : null}
			<p className="muted small">On the preview: drag the picture to move it, its corner or the mouse wheel to {cutIn.mode === 'full' ? 'zoom' : 'resize'}, the round handle to turn it. Delete or Backspace removes it.</p>
			<div className="row">
				<Num label="Centre x" value={cutIn.x} step={1} onChange={(x) => set({x})} />
				<Num label="Centre y" value={cutIn.y} step={1} onChange={(y) => set({y})} />
				{cutIn.mode !== 'full' ? <Num label="Width" value={cutIn.width} step={1} onChange={(width) => set({width})} /> : null}
				<button className="small" onClick={() => set({x: undefined, y: undefined, width: undefined, zoom: undefined, rotate: undefined})}>Reset</button>
			</div>
			<CutInFrameSection cutIn={cutIn} />
			<Check label="Bloop SFX on entry" value={cutIn.sfx !== false} onChange={(v) => set({sfx: v ? undefined : false})} />
			<TimeFields kind="cutIn" id={cutIn.id} start={cutIn.start} end={cutIn.end} />
			<Delete kind="cutIn" id={cutIn.id} />
		</div>
	);
};

// A bg picture needs the speaker cutout of its rush range (GPU job); until then the picture shows in front.
const BgCutoutStatus: React.FC<{cutIn: CutIn}> = ({cutIn}) => {
	const {video} = useDerived();
	const ready = video.prepared.mattes.some((m) => m.start <= cutIn.start + 0.01 && m.end >= cutIn.end - 0.01);
	return (
		<div className={`note ${ready ? 'ok' : 'warn'}`}>
			{ready ? (
				<span className="small">Speaker cutout ready: you pass in front of the picture.</span>
			) : (
				<>
					<span className="small">
						Speaker cutout not computed for this range yet: the picture shows in front of you. Compute it now (GPU, a few seconds per
						second of video), or let the export do it.
					</span>
					<JobsPanel standalone startType="preview" />
				</>
			)}
		</div>
	);
};

const GaugeInspector: React.FC<{gauge: Gauge}> = ({gauge}) => {
	const set = (patch: Partial<Gauge>) => apply((p) => ops.updateEvent<Gauge>(p, 'gauge', gauge.id, patch));
	return (
		<div className="inspector">
			<h3>Gauge</h3>
			<label className="field">
				<span>Label</span>
				<input value={gauge.label} onChange={(e) => set({label: e.target.value})} />
			</label>
			<Range label="Cursor from" value={gauge.from} min={0} max={1} step={0.01} onChange={(from) => set({from})} />
			<Range label="Cursor to" value={gauge.to} min={0} max={1} step={0.01} onChange={(to) => set({to})} />
			<Num label="Landing after (s)" value={gauge.landing} onChange={(v) => v && set({landing: v})} />
			<TimeFields kind="gauge" id={gauge.id} start={gauge.start} end={gauge.end} />
			<Delete kind="gauge" id={gauge.id} />
		</div>
	);
};

const DiagramInspector: React.FC<{diagram: Diagram}> = ({diagram}) => {
	const plan = useEditor((s) => s.plan)!;
	const {segments, video} = useDerived();
	const info = TEMPLATE_INFO[diagram.template];
	const set = (patch: Partial<Diagram>) => apply((p) => ops.updateEvent<Diagram>(p, 'diagram', diagram.id, patch));
	const setEl = (el: DiagramElement, patch: Partial<DiagramElement>) => apply((p) => ops.updateElement(p, diagram.id, el.id, patch));
	const images = plan.assets.filter((a) => a.kind === 'image');
	const customs = video.files.diagrams.map((f) => f.replace(/\.tsx$/, ''));
	return (
		<div className="inspector">
			<h3>Diagram <HelpLink to="schemas" /> <span className="muted small">{diagram.id}</span></h3>
			<label className="field">
				<span>Template (layout is automatic, inside the safe zone)</span>
				<select value={diagram.template} onChange={(e) => set({template: e.target.value as Diagram['template']})}>
					{Object.entries(TEMPLATE_INFO).map(([k, v]) => (
						<option key={k} value={k}>{v.label}</option>
					))}
				</select>
			</label>
			{diagram.template === 'custom' ? (
				<label className="field">
					<span>Hand-written component (diagrams/*.tsx of this project)</span>
					<select value={diagram.component ?? ''} onChange={(e) => set({component: e.target.value})}>
						<option value="">choose…</option>
						{customs.map((c) => <option key={c} value={c}>{c}</option>)}
					</select>
				</label>
			) : null}
			<label className="field">
				<span>Description</span>
				<input value={diagram.description ?? ''} onChange={(e) => set({description: e.target.value})} />
			</label>
			<TimeFields kind="diagram" id={diagram.id} start={diagram.start} end={diagram.end} />
			<Check label="Whoosh on opening + bloop per element" value={diagram.sfx !== false} onChange={(v) => set({sfx: v ? undefined : false})} />
			<h4>Elements <span className="muted small">(each appears on its trigger word)</span></h4>
			<datalist id="icon-names">{[...new Set(ICON_LIST)].map((n) => <option key={n} value={n} />)}</datalist>
			{diagram.elements.map((el, i) => (
				<div key={el.id} className="element-card">
					<div className="row">
						<strong className="small">{info?.roles[i] ?? `#${i + 1}`}</strong>
						<button className="small" onClick={() => apply((p) => ops.moveElement(p, diagram.id, el.id, -1))}>↑</button>
						<button className="small" onClick={() => apply((p) => ops.moveElement(p, diagram.id, el.id, 1))}>↓</button>
						<button className="small danger" onClick={() => apply((p) => ops.removeElement(p, diagram.id, el.id))}>✕</button>
					</div>
					<div className="row">
						<label className="field grow">
							<span>Label (Enter = new line)</span>
							<textarea className="label-input" rows={Math.min(4, el.label.split('\n').length)} value={el.label} onChange={(e) => setEl(el, {label: e.target.value})} />
						</label>
						<label className="field">
							<span>Icon</span>
							<input list="icon-names" value={el.icon ?? ''} placeholder="lucide name" onChange={(e) => setEl(el, {icon: e.target.value || undefined})} />
						</label>
						<label className="field">
							<span>Picture</span>
							<select value={el.image ?? ''} onChange={(e) => setEl(el, {image: e.target.value || undefined})}>
								<option value="">none</option>
								{images.map((a) => <option key={a.id} value={a.id}>{a.id}</option>)}
							</select>
						</label>
					</div>
					<div className="row">
						<Check label="accent" value={Boolean(el.accent)} onChange={(v) => setEl(el, {accent: v || undefined})} />
						<Check label="strike" value={Boolean(el.strike)} onChange={(v) => setEl(el, {strike: v || undefined})} />
						<Check label="check" value={Boolean(el.check)} onChange={(v) => setEl(el, {check: v || undefined})} />
					</div>
					<div className="row">
						<TriggerPicker value={el.at} trigger={el.trigger} onPick={(w) => setEl(el, {at: w.start, trigger: w.text})} />
						<Num label="Draw (s)" value={el.draw} min={0.05} onChange={(v) => v && setEl(el, {draw: v})} />
						<span className="small muted">at {rushToOutput(segments, el.at).toFixed(2)} s</span>
						<button className="small" title="Appear at the playhead" onClick={() => setEl(el, {at: outputToRush(segments, editor.get().time)})}>at playhead</button>
					</div>
				</div>
			))}
			{diagram.elements.length < (info?.max ?? 8) ? (
				<button onClick={() => apply((p) => ops.addElement(p, diagram.id, outputToRush(segments, editor.get().time)))}>+ Element at playhead</button>
			) : null}
			<div className="row">
				<Delete kind="diagram" id={diagram.id} />
			</div>
		</div>
	);
};

// Trigger word: choose among the kept words around the element's time.
const TriggerPicker: React.FC<{value: number; trigger?: string; onPick: (w: {start: number; text: string}) => void}> = ({value, trigger, onPick}) => {
	const plan = useEditor((s) => s.plan)!;
	const {segments} = useDerived();
	const near = plan.words
		.filter((w) => Math.abs(w.start - value) < 6 && segmentOfWord(segments, w))
		.sort((a, b) => a.start - b.start);
	const current = near.reduce<typeof near[number] | undefined>((best, w) => (!best || Math.abs(w.start - value) < Math.abs(best.start - value) ? w : best), undefined);
	return (
		<label className="field grow">
			<span>Trigger word{trigger ? ` (${trigger})` : ''}</span>
			<select value={current?.id ?? ''} onChange={(e) => {
				const w = near.find((x) => x.id === e.target.value);
				if (w) onPick(w);
			}}>
				{near.map((w) => (
					<option key={w.id} value={w.id}>
						{w.text} · {rushToOutput(segments, w.start).toFixed(2)} s
					</option>
				))}
			</select>
		</label>
	);
};

const SfxInspector: React.FC<{id: string}> = ({id}) => {
	const plan = useEditor((s) => s.plan)!;
	const {sfxFiles, segments} = useDerived();
	const s = plan.sfx.find((x) => x.id === id)!;
	const set = (patch: Partial<typeof s>) => apply((p) => ops.updateEvent(p, 'sfx', id, patch));
	return (
		<div className="inspector">
			<h3>Manual SFX <HelpLink to="sons" /></h3>
			<label className="field">
				<span>File (library/sfx)</span>
				<select value={s.file} onChange={(e) => set({file: e.target.value})}>
					{sfxFiles.map((f) => <option key={f}>{f}</option>)}
				</select>
			</label>
			<Num label="At (s, output)" value={rushToOutput(segments, s.at)} onChange={(v) => v !== undefined && apply((p) => ops.moveSfx(p, id, v))} />
			<Range label="Gain" value={s.gain ?? 1} min={0.1} max={3} step={0.05} onChange={(gain) => set({gain: gain === 1 ? undefined : gain})} />
			<label className="field">
				<span>Reason</span>
				<input value={s.reason ?? ''} onChange={(e) => set({reason: e.target.value})} />
			</label>
			<Delete kind="sfx" id={id} />
		</div>
	);
};

const AutoSfxInspector: React.FC<{index: number}> = ({index}) => {
	const {edl} = useDerived();
	const s = edl.sfx[index];
	if (!s) return null;
	return (
		<div className="inspector">
			<h3>Automatic SFX <HelpLink to="sons" /></h3>
			<p>
				<strong>{s.file}</strong> at {s.time.toFixed(2)} s — {s.reason}
			</p>
			<p className="muted small">Placed by the theme rules (whoosh on diagram opening, bloop on pictures, logos and diagram elements, keyboard on concepts). Disable it on its source event, or change the rule in the theme.</p>
			{s.ref ? <button onClick={() => {
				const plan = editor.get().plan!;
				const kind = plan.logos.some((l) => l.id === s.ref) ? 'logo' : plan.cutIns.some((c) => c.id === s.ref) ? 'cutIn' : plan.diagrams.some((d) => d.id === s.ref) ? 'diagram' : plan.gauges.some((g) => g.id === s.ref) ? 'gauge' : plan.concepts.some((c) => c.id === s.ref) ? 'concept' : null;
				if (kind) editor.select({kind, id: s.ref!} as never);
			}}>Select its source</button> : null}
		</div>
	);
};

const MusicInspector: React.FC = () => {
	const plan = useEditor((s) => s.plan)!;
	const music = plan.music;
	return (
		<div className="inspector">
			<h3>Music <HelpLink to="musique" /></h3>
			{music ? (
				<>
					<AssetSelect value={music.asset} kinds={['audio']} onChange={(asset) => apply((p) => ({...p, music: {...p.music!, asset}}))} />
					<Range label="dB under the voice" value={music.underVoiceDb} min={10} max={35} step={1} onChange={(v) => apply((p) => ({...p, music: {...p.music!, underVoiceDb: v}}))} />
					<p className="muted small">Exact levelling and sidechain ducking happen at export (ffmpeg). The preview plays it quietly.</p>
					<button className="danger" onClick={() => apply((p) => ({...p, music: null}))}>Remove music</button>
				</>
			) : (
				<p className="muted">No music. Add an audio asset from the Catalog.</p>
			)}
		</div>
	);
};

const SubscribeInspector: React.FC = () => {
	const plan = useEditor((s) => s.plan)!;
	const {segments} = useDerived();
	const sub = plan.subscribe;
	if (!sub) return <p className="muted">No subscribe overlay.</p>;
	const set = (patch: Partial<typeof sub>) => apply((p) => ({...p, subscribe: {...p.subscribe!, ...patch}}));
	return (
		<div className="inspector">
			<h3>Subscribe overlay <HelpLink to="cta" /></h3>
			<Num label="Start (s, output)" value={rushToOutput(segments, sub.start)} onChange={(v) => v !== undefined && set({start: round3(outputToRush(segments, v))})} />
			<div className="row">
				<Num label="Scale" value={sub.scale} step={0.01} onChange={(v) => v && set({scale: v})} />
				<Num label="x" value={sub.x} step={1} onChange={(v) => v !== undefined && set({x: v})} />
				<Num label="y" value={sub.y} step={1} onChange={(v) => v !== undefined && set({y: v})} />
			</div>
			<label className="field">
				<span>Entrance</span>
				<select value={sub.enter ?? ''} onChange={(e) => set({enter: (e.target.value || undefined) as typeof sub.enter})}>
					<option value="">Default (the animation plays as it is)</option>
					<option value="pop">Pop (grows with a bounce)</option>
					<option value="top">From the top</option>
					<option value="bottom">From the bottom</option>
					<option value="left">From the left</option>
					<option value="right">From the right</option>
				</select>
			</label>
			<Range label="Rotation (°)" value={sub.rotate ?? 0} min={-180} max={180} step={1} onChange={(v) => set({rotate: v || undefined})} />
			<Range label="Shake (px)" value={sub.shake ?? 0} min={0} max={20} step={1} onChange={(v) => set({shake: v || undefined})} />
			<p className="muted small">
				On the preview (from its start time): drag it to move it, its corner or the mouse wheel to resize, the round handle to turn it. Delete or
				Backspace removes it. It shows only when a call to action is said and runs until the end of the video.
			</p>
			<button className="danger" onClick={() => { apply((p) => ({...p, subscribe: null})); editor.select(null); }}>Remove</button>
		</div>
	);
};
