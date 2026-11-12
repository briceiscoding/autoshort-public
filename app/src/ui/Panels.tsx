import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {TEMPLATE_INFO} from '../composition/diagrams/templates';
import {outputToRush, rushToOutput, segmentOfWord} from '../edl/time';
import type {LintWarning} from '../lint/lint';
import {parsePlan, type Diagram} from '../model/plan';
import {api, type HistoryItem, type JobInfo} from './api';
import {DerivedContext, fmtTime, player, useDerived} from './context';
import {editor, useEditor, type Selection} from './editorStore';
import * as ops from './ops';
import {FileDrop} from './FileDrop';
import {Icon, type IconName} from './icons';
import {FreeLinks} from './links';

/* ---------------- checks ---------------- */

const selectionOf = (w: LintWarning): Selection => {
	if (!w.ref) return null;
	if (w.ref.kind === 'word' || w.ref.kind === 'caption') return {kind: 'word', id: w.ref.id};
	if (['concept', 'logo', 'cutIn', 'gauge', 'diagram', 'sfx'].includes(w.ref.kind)) return {kind: w.ref.kind as 'logo', id: w.ref.id};
	return null;
};

// Re-transcription asked from a check: it rebuilds the plan, so no autosave until the new one is loaded.
const retranscribe = async (slug: string, reloadPlan: () => Promise<void>) => {
	editor.set({locked: true, saveStatus: 'saved'});
	try {
		const job = await api.startJob(slug, 'import', {bursts: true, reimport: true});
		for (;;) {
			await new Promise((r) => window.setTimeout(r, 1000));
			const j = await api.job(job.id);
			if (j.status !== 'running' && j.status !== 'queued') break;
		}
	} finally {
		await reloadPlan();
	}
};

export const LintPanel: React.FC = () => {
	const {warnings, slug, reloadPlan} = useDerived();
	const [hideInfo, setHideInfo] = useState(false);
	const shown = warnings.filter((w) => !hideInfo || w.severity !== 'info');
	return (
		<div className="lint">
			<div className="row">
				<label className="check"><input type="checkbox" checked={hideInfo} onChange={(e) => setHideInfo(e.target.checked)} /> Hide info</label>
				<span className="muted small">Checks are advice, never a gate. Click one to jump to it.</span>
			</div>
			{shown.length === 0 ? <p className="ok">All checks pass.</p> : null}
			<ul>
				{shown.map((w) => (
					<li
						key={w.id}
						className={`lint-item ${w.severity}`}
						onClick={() => {
							player.seek(w.time);
							const sel = selectionOf(w);
							if (sel) editor.select(sel);
						}}
					>
						<span className="mono small">{fmtTime(w.time)}</span>
						<span className="rule">{w.rule}</span>
						<span>{w.message}</span>
						{w.action ? (
							<button
								className="small"
								onClick={async (e) => {
									e.stopPropagation();
									await retranscribe(slug, reloadPlan);
								}}
							>
								{w.action.label}
							</button>
						) : null}
					</li>
				))}
			</ul>
		</div>
	);
};

/* ---------------- transcript ---------------- */

export const TranscriptPanel: React.FC = () => {
	const plan = useEditor((s) => s.plan)!;
	const selection = useEditor((s) => s.selection);
	const time = useEditor((s) => s.time);
	const {segments, theme} = useDerived();
	const [anchor, setAnchor] = useState<string | null>(null);
	const words = useMemo(() => [...plan.words].sort((a, b) => a.start - b.start), [plan.words]);
	const rushNow = outputToRush(segments, time);
	const selectedRange = useMemo(() => {
		if (selection?.kind !== 'word') return new Set<string>();
		const i = words.findIndex((w) => w.id === selection.id);
		const j = selection.lastId ? words.findIndex((w) => w.id === selection.lastId) : i;
		const [a, b] = i <= j ? [i, j] : [j, i];
		return new Set(words.slice(a, b + 1).map((w) => w.id));
	}, [selection, words]);
	const range = selection?.kind === 'word' && selection.lastId ? selection : null;

	return (
		<div className="transcript">
			<p className="muted small">
				Click a word to edit it (text, highlight, block start). Shift+click selects a range to cut or turn into a concept. Struck words are cut.
			</p>
			<div className="row">
				<button
					className="small"
					title={`Blocks of ${theme.captions.maxWords} words / ${theme.captions.maxLineChars} characters at most (theme captions settings); your manual block starts are replaced`}
					onClick={() => editor.apply((p) => ({...p, words: ops.autoBlocks([...p.words].sort((a, b) => a.start - b.start), theme.captions.maxWords, theme.captions.maxLineChars)}))}
				>
					Re-split captions
				</button>
			</div>
			{range ? (
				<div className="row sticky">
					<strong className="small">{selectedRange.size} words</strong>
					<button onClick={() => editor.apply((p) => ops.cutWords(p, range.id, range.lastId!))}>Cut selection</button>
					<button
						onClick={() => {
							const sel = words.filter((w) => selectedRange.has(w.id));
							editor.apply((p) => ops.restoreRange(p, sel[0].start, sel[sel.length - 1].end));
						}}
					>
						Restore selection
					</button>
					<button
						onClick={() => {
							const sel = words.filter((w) => selectedRange.has(w.id));
							editor.apply((p) => ops.addConcept(p, sel.map((w) => w.text).join(' ').replace(/[.,!?;:]+$/, ''), sel[0].start, sel[sel.length - 1].end));
						}}
					>
						Make concept
					</button>
				</div>
			) : null}
			<div className="words">
				{words.map((w) => {
					const kept = Boolean(segmentOfWord(segments, w));
					const lowConf = w.score != null && w.score < 0.5;
					const active = rushNow >= w.start && rushNow < w.end;
					return (
						<React.Fragment key={w.id}>
							{w.blockStart ? <span className="block-break" /> : null}
							<span
								className={`word ${kept ? '' : 'cut'} ${w.highlight ? 'hl' : ''} ${lowConf ? 'low' : ''} ${selectedRange.has(w.id) ? 'selected' : ''} ${active ? 'active' : ''} ${w.original ? 'corrected' : ''}`}
								title={`${w.start.toFixed(2)}-${w.end.toFixed(2)} s${w.score != null ? ` · ${Math.round(w.score * 100)} %` : ''}${w.original ? ` · was "${w.original}"` : ''}`}
								onClick={(e) => {
									if (e.shiftKey && anchor) editor.select({kind: 'word', id: anchor, lastId: w.id});
									else {
										setAnchor(w.id);
										editor.select({kind: 'word', id: w.id});
										player.seek(rushToOutput(segments, w.start));
									}
								}}
								onDoubleClick={() => editor.apply((p) => ops.updateWord(p, w.id, {highlight: !w.highlight || undefined}))}
							>
								{w.text}
							</span>{' '}
						</React.Fragment>
					);
				})}
			</div>
		</div>
	);
};

/* ---------------- catalog ---------------- */

export const CatalogPanel: React.FC = () => {
	const plan = useEditor((s) => s.plan)!;
	const {segments, sfxFiles, slug, edl} = useDerived();
	const [preview, setPreview] = useState<string | null>(null);
	const at = () => editor.get().time;
	const span = (seconds: number) => {
		const t = at();
		return [outputToRush(segments, t), outputToRush(segments, Math.min(edl.durationAfter, t + seconds))] as const;
	};
	return (
		<div className="catalog">
			<h4>Assets of this short <span className="muted small">(added at the playhead)</span></h4>
			<FileDrop
				slug={slug}
				kind="assets"
				label="Add pictures, videos, music"
				onAdded={(added) =>
					editor.apply((p) => {
						const fresh = added.map((a) => a.asset).filter((a): a is NonNullable<typeof a> => Boolean(a) && !p.assets.some((x) => x.id === a!.id));
						return fresh.length ? {...p, assets: [...p.assets, ...fresh]} : p;
					})
				}
			/>
			<div className="free-list">
				<FreeLinks kind="pictures" label="Free pictures" />
				<FreeLinks kind="broll" label="B-roll" />
			</div>
			<ul className="asset-list">
				{plan.assets.map((a) => (
					<li key={a.id}>
						<span className={`tag kind-${a.kind}`}>{a.kind}</span>
						<span className="grow" onMouseEnter={() => setPreview(a.kind === 'image' ? a.file : null)} onMouseLeave={() => setPreview(null)}>
							{a.file.replace(/^assets\//, '')}
							<span className="muted small"> {a.width ? `${a.width}x${a.height}` : ''}{a.duration ? ` ${a.duration.toFixed(1)} s` : ''}</span>
						</span>
						{a.kind === 'image' ? <button className="small" onClick={() => editor.apply((p) => ops.addLogo(p, a.id, ...span(2)))}>logo</button> : null}
						{a.kind === 'image' ? (
							<button className="small" title="Behind the head" onClick={() => editor.apply((p) => ops.addCutIn(p, a.id, 'bg', ...span(3)))}>
								bg
							</button>
						) : null}
						{a.kind !== 'audio' ? (
							<>
								<button className="small" onClick={() => editor.apply((p) => ops.addCutIn(p, a.id, 'screen', ...span(2)))}>screen</button>
								<button className="small" onClick={() => editor.apply((p) => ops.addCutIn(p, a.id, 'full', ...span(1.5)))}>full</button>
							</>
						) : (
							<button className="small" onClick={() => editor.apply((p) => ({...p, music: {asset: a.id, underVoiceDb: 22}}))}>music</button>
						)}
					</li>
				))}
			</ul>
			{preview ? <img className="asset-preview" src={`/media/${encodeURIComponent(slug)}/${preview.split('/').map(encodeURIComponent).join('/')}`} /> : null}
			<h4>Diagram at playhead</h4>
			<div className="row wrap">
				{(Object.keys(TEMPLATE_INFO) as Diagram['template'][]).filter((t) => t !== 'custom').map((t) => (
					<button key={t} className="small" onClick={() => editor.apply((p) => ops.addDiagram(p, t, ...span(3.5)))}>{TEMPLATE_INFO[t].label}</button>
				))}
			</div>
			<h4>Concept at playhead</h4>
			<button className="small" onClick={() => editor.apply((p) => ops.addConcept(p, 'Concept', ...span(2)))}>+ Concept</button>
			<h4>
				SFX (library/sfx) at playhead{' '}
				<a className="small" href="#/~brand-kit" style={{fontWeight: 400}}>
					Manage sounds
				</a>
			</h4>
			<ul className="asset-list">
				{sfxFiles.map((f) => (
					<li key={f}>
						<button className="small" title="Listen" onClick={() => new Audio(`/library/sfx/${encodeURIComponent(f)}`).play()}>▶</button>
						<span className="grow">{f}</span>
						<button className="small" onClick={() => editor.apply((p) => ops.addSfx(p, f, outputToRush(segments, at())))}>add</button>
					</li>
				))}
			</ul>
		</div>
	);
};

/* ---------------- jobs ---------------- */

// Actions of the Jobs tab: a short title, a one-line hint, the full description in the tooltip.
const JOB_INFO: Record<string, {label: string; hint: string; details: string; icon: IconName}> = {
	export: {
		label: 'Export the video',
		hint: 'Render the final MP4 and its subtitles',
		details: 'EDL from the same code as the preview, exact audio (2 pass loudnorm, music ducking), Remotion render, limiter, loudness check, exports/<name>_vN.mp4 + .srt (never overwritten), control frames in data/control/.',
		icon: 'download',
	},
	propose: {
		label: 'Plan proposal (Claude)',
		hint: 'Concepts, highlights, diagrams, pictures placed',
		details: 'Claude Code reads the charter, notes.md, your assets and the transcript, and proposes the edit as a draft to accept or discard.',
		icon: 'sparkles',
	},
	reset: {
		label: 'Reset to the default edit',
		hint: 'Start again from the basic captions, in a few seconds',
		details: 'Rebuilds the default edit (basic captions, zooms, named pictures) from the transcription already made. It replaces the current edit and deletes its history: your edits, Claude’s proposal and transcript corrections are gone. Exports stay.',
		icon: 'reset',
	},
	import: {
		label: 'Launch the video',
		hint: 'Transcription, face tracking and first edit',
		details: 'Probe, WhisperX large-v3 + Silero VAD, burst fallback when speech is skipped, face track, media typing, first plan (caption blocks, assets named mode__trigger, segments and zooms). On a video already launched it re-transcribes and replaces the edit.',
		icon: 'clapper',
	},
	preview: {
		label: 'Prepare media',
		hint: 'Subscribe overlay, logo and speaker cutouts',
		details: 'Keyed subscribe overlay, logo cutouts, speaker cutout behind bg pictures (GPU). The export does it anyway when needed.',
		icon: 'media',
	},
};
const JOB_LABELS: Record<string, string> = Object.fromEntries(Object.entries(JOB_INFO).map(([k, v]) => [k, v.label]));

// Where an export is copied: remembered in this browser (empty = only the project's exports folder).
const EXPORT_DIR_KEY = 'autoshort.exportDir';
const EXPORT_SRT_KEY = 'autoshort.exportSrt';
const readSetting = (key: string): string | null => {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
};
const writeSetting = (key: string, value: string) => {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		/* private window: not remembered */
	}
};

const ExportTarget: React.FC<{slug: string; value: ExportParams; onChange: (v: ExportParams) => void}> = ({slug, value, onChange}) => {
	const [picking, setPicking] = useState(false);
	const [error, setError] = useState('');
	const set = (patch: Partial<ExportParams>) => {
		const next = {...value, ...patch};
		if (patch.dest !== undefined) writeSetting(EXPORT_DIR_KEY, next.dest);
		if (patch.srt !== undefined) writeSetting(EXPORT_SRT_KEY, next.srt ? '1' : '0');
		onChange(next);
	};
	const browse = async () => {
		setError('');
		setPicking(true);
		try {
			const {path} = await api.pickFolder(value.dest);
			if (path) set({dest: path});
		} catch (e) {
			setError(String(e));
		} finally {
			setPicking(false);
		}
	};
	return (
		<div className="export-target card">
			<div className="row">
				<span className="small">Export to</span>
				<input className="grow mono small" value={value.dest} placeholder={`projects/${slug}/exports only`} onChange={(e) => set({dest: e.target.value})} />
				<button className="small" disabled={picking} onClick={browse}>{picking ? 'Choose in the window…' : 'Browse…'}</button>
				{value.dest ? <button className="small" title="Keep the export in the project folder only" onClick={() => set({dest: ''})}>✕</button> : null}
			</div>
			{value.dest ? (
				<div className="row">
					<span className="small">File name</span>
					<input className="grow small" value={value.name} placeholder={slug} onChange={(e) => set({name: e.target.value})} />
					<span className="muted small">.mp4</span>
					<label className="check small"><input type="checkbox" checked={value.srt} onChange={(e) => set({srt: e.target.checked})} /> .srt too</label>
				</div>
			) : null}
			<p className="muted small">
				{value.dest
					? 'A copy goes to this folder (never overwritten: _v2, _v3… if the name is taken); the project keeps its own copy.'
					: 'Pick a folder to also get the video there.'}
			</p>
			{error ? <p className="error small">{error}</p> : null}
		</div>
	);
};

type ExportParams = {dest: string; name: string; srt: boolean};

// Jobs that build the plan ask first whether the rush is already edited or raw (to cut).
const ASKS_CUTS = new Set(['import', 'reset']);

const CutsDialog: React.FC<{current: boolean | null; replaces: boolean; onChoose: (cuts: 'edited' | 'raw') => void; onCancel: () => void}> = ({current, replaces, onChoose, onCancel}) => (
	<div className="modal-backdrop" onClick={onCancel}>
		<div className="modal card" onClick={(e) => e.stopPropagation()}>
			<h3>How was this video filmed?</h3>
			{replaces ? <p className="error small">The current edit of this video is replaced and its history deleted: there is no way back.</p> : null}
			<button className={`choice ${current !== true ? 'primary' : ''}`} onClick={() => onChoose('edited')}>
				<strong>Already edited</strong>
				<span className="small">Nothing is cut: captions, zooms and pictures are added on the video as it is.</span>
			</button>
			<button className={`choice ${current === true ? 'primary' : ''}`} onClick={() => onChoose('raw')}>
				<strong>Raw, edit it from scratch</strong>
				<span className="small">Silences, hesitations (euh…), repeated takes and the start / end are cut. Every cut can be restored.</span>
			</button>
			<div className="row">
				<span className="grow muted small">This choice is kept for this video (Claude proposal, reset).</span>
				<button className="small" onClick={onCancel}>Cancel</button>
			</div>
		</div>
	</div>
);

// Jobs read the plan from disk: pending edits are saved first (with a History snapshot).
export const saveThenStart = async (slug: string, type: string, params: Record<string, unknown> = {}) => {
	if (editor.get().saveStatus !== 'saved' && editor.get().plan) await api.savePlan(slug, editor.get().plan!, true);
	return api.startJob(slug, type, params);
};

export const JobsPanel: React.FC<{
	standalone?: boolean;
	startType?: string;
	startParams?: Record<string, unknown>;
	onFinished?: () => void;
	// Only list these job types, without the action buttons (a panel that starts its own jobs).
	listOnly?: string[];
}> = ({standalone, startType, startParams, onFinished, listOnly}) => {
	const derived = useContext(DerivedContext);
	const slug = derived?.slug ?? decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
	const [jobs, setJobs] = useState<JobInfo[]>([]);
	const [open, setOpen] = useState<string | null>(null);
	const [detail, setDetail] = useState<JobInfo | null>(null);
	const [error, setError] = useState('');
	const finished = useRef(new Set<string>());
	const [asking, setAsking] = useState<{type: string; params: Record<string, unknown>} | null>(null);
	const savedCuts = editor.get().plan?.themeOverrides?.editing as {autoCuts?: boolean} | undefined;
	const [exportParams, setExportParams] = useState<ExportParams>(() => ({dest: readSetting(EXPORT_DIR_KEY) ?? '', name: '', srt: readSetting(EXPORT_SRT_KEY) !== '0'}));

	useEffect(() => {
		let alive = true;
		const tick = async () => {
			try {
				const list = (await api.jobs(slug)).filter((j) => !listOnly || listOnly.includes(j.type));
				if (!alive) return;
				setJobs(list);
				for (const j of list) {
					if (j.status !== 'running' && j.status !== 'queued' && !finished.current.has(j.id)) {
						finished.current.add(j.id);
						if (Date.now() / 1000 - (j.finished ?? 0) < 10) {
							onFinished?.();
							// An import or a reset replaced the plan on disk: load it (the old one is gone).
							if (ASKS_CUTS.has(j.type)) derived?.reloadPlan();
							else derived?.reload();
						}
					}
				}
				if (open) setDetail(await api.job(open));
			} catch {
				/* backend restarting */
			}
		};
		tick();
		const id = window.setInterval(tick, 1000);
		return () => {
			alive = false;
			window.clearInterval(id);
		};
	}, [slug, open]);

	const start = async (type: string, params: Record<string, unknown> = {}) => {
		setError('');
		try {
			// Jobs read the plan from disk: save pending edits first. An import or a reset replaces the plan: stop saving it.
			if (ASKS_CUTS.has(type)) editor.set({locked: true, saveStatus: 'saved'});
			const job = ASKS_CUTS.has(type) ? await api.startJob(slug, type, params) : await saveThenStart(slug, type, params);
			setOpen(job.id);
		} catch (e) {
			if (ASKS_CUTS.has(type)) editor.set({locked: false});
			setError(String(e));
		}
	};

	const types = startType ? [startType] : ['export', 'propose', 'reset', 'import', 'preview'];
	const running = jobs.some((j) => j.status === 'running' || j.status === 'queued');

	return (
		<div className="jobs">
			{types.includes('export') && !listOnly ? <ExportTarget slug={slug} value={exportParams} onChange={setExportParams} /> : null}
			{listOnly ? null : (
			<div className="actions">
				{types.map((t) => {
					const info = JOB_INFO[t];
					return (
						<button
							key={t}
							className={`action ${t === 'export' || startType ? 'primary' : ''}`}
							disabled={running}
							title={info?.details}
							onClick={() => {
								const params = t === startType ? startParams : t === 'export' ? {dest: exportParams.dest.trim(), name: exportParams.name.trim(), srt: exportParams.srt} : {};
								if (ASKS_CUTS.has(t)) setAsking({type: t, params: params ?? {}});
								else start(t, params);
							}}
						>
							<span className="icon-wrap">
								<Icon name={info?.icon ?? 'wand'} size={18} />
							</span>
							<span className="action-title">{info?.label ?? t}</span>
							<span className="action-hint">{info?.hint ?? ''}</span>
						</button>
					);
				})}
			</div>
			)}
			{asking ? (
				<CutsDialog
					current={savedCuts?.autoCuts ?? null}
					replaces={Boolean(editor.get().plan)}
					onCancel={() => setAsking(null)}
					onChoose={(cuts) => {
						start(asking.type, {...asking.params, cuts});
						setAsking(null);
					}}
				/>
			) : null}
			{error ? <p className="error small">{error}</p> : null}
			<ul className="job-list">
				{jobs.map((j) => (
					<li key={j.id} className={`job ${j.status}`}>
						<div className="row" onClick={() => setOpen(open === j.id ? null : j.id)}>
							<strong>{JOB_LABELS[j.type] ?? j.type}</strong>
							<span className={`tag ${j.status === 'done' ? 'ok' : j.status === 'failed' ? 'err' : ''}`}>{j.status}</span>
							<span className="small grow">{j.message}</span>
							{j.status === 'running' ? <button className="small" onClick={(e) => { e.stopPropagation(); api.cancelJob(j.id); }}>Cancel</button> : null}
						</div>
						<div className="progress"><div style={{width: `${Math.round(j.progress * 100)}%`}} /></div>
						{j.result?.output ? <p className="small ok">→ exports/{j.result.output} · {j.result.lufs} LUFS · TP {j.result.truePeak} dBTP</p> : null}
						{j.result?.copiedTo ? <p className="small ok">→ {j.result.copiedTo}</p> : null}
						{open === j.id && detail ? (
							<>
								<ol className="steps small">
									{detail.steps.map((s, i) => (
										<li key={s} className={i < detail.stepIndex || detail.status === 'done' ? 'done' : i === detail.stepIndex ? 'current' : ''}>{s}</li>
									))}
								</ol>
								<pre className="log">{detail.logs.join('\n')}</pre>
							</>
						) : null}
					</li>
				))}
			</ul>
		</div>
	);
};

/* ---------------- history ---------------- */

export const HistoryPanel: React.FC = () => {
	const {slug} = useDerived();
	const [items, setItems] = useState<HistoryItem[]>([]);
	useEffect(() => {
		api.history(slug).then(setItems).catch(() => {});
	}, [slug]);
	return (
		<div className="history">
			<p className="muted small">The plan autosaves; a snapshot is kept at most once a minute, before exporting, and before accepting a Claude draft when you choose to keep the current version. Restoring is undoable.</p>
			<button onClick={async () => { await api.savePlan(slug, editor.get().plan!, true); setItems(await api.history(slug)); }}>Snapshot now</button>
			<ul>
				{items.map((h) => (
					<li key={h.name} className="row">
						<span className="grow small">
							<span className="mono">{h.at.replace('T', ' ')}</span>
							{h.label ? <span className="history-label" title={h.label}>{h.label}</span> : null}
						</span>
						<button className="small" onClick={async () => {
							const plan = parsePlan(await api.historyItem(slug, h.name));
							editor.apply(() => plan);
						}}>Restore</button>
					</li>
				))}
			</ul>
		</div>
	);
};
