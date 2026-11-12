import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {registerCustomDiagrams} from '../composition/custom/registry';
import {buildEdl} from '../edl/buildEdl';
import {keptSegments} from '../edl/time';
import {lintPlan} from '../lint/lint';
import type {Analysis} from '../model/analysis';
import {parsePlan} from '../model/plan';
import {ThemeSchema, resolveTheme} from '../model/theme';
import {api, type VideoState} from './api';
import {ColorModeToggle} from './colorMode';
import {Icon} from './icons';
import {FreeLinks, SocialLinks} from './links';
import {DerivedContext, fmtTime, player, type Derived} from './context';
import {FileDrop} from './FileDrop';
import {editor, useEditor} from './editorStore';
import {Inspector} from './Inspector';
import {CatalogPanel, HistoryPanel, JobsPanel, LintPanel, TranscriptPanel} from './Panels';
import {Preview} from './Preview';
import {StylesPanel} from './Styles';
import {Timeline} from './Timeline';

// Hand-written diagrams of the project (projects/<slug>/diagrams/*.tsx, escape hatch), imported at runtime
// through Vite's /@fs/ route (projects/ may be moved to another drive in config.json).
const loadCustomDiagrams = async (slug: string, files: string[]) => {
	if (!files.length) return;
	const {projectsRoot} = await fetch('/api/config').then((r) => r.json());
	const entries: Record<string, React.FC<any>> = {};
	for (const file of files) {
		const path = `${String(projectsRoot).replace(/\\/g, '/')}/${slug}/diagrams/${file}`;
		try {
			const mod = (await import(/* @vite-ignore */ `/@fs/${path}`)) as Record<string, unknown>;
			const component = Object.values(mod).find((v) => typeof v === 'function') as React.FC<any> | undefined;
			if (component) entries[`${slug}/${file.replace(/\.tsx$/, '')}`] = component;
		} catch (err) {
			console.warn('custom diagram failed to load', path, err);
		}
	}
	registerCustomDiagrams(entries);
};

type Tab = 'inspector' | 'styles' | 'lint' | 'transcript' | 'catalog' | 'jobs' | 'history';

export const Editor: React.FC<{slug: string}> = ({slug}) => {
	const [video, setVideo] = useState<VideoState | null>(null);
	const [sfxFiles, setSfxFiles] = useState<string[]>([]);
	const [error, setError] = useState('');
	const [tab, setTab] = useState<Tab>('inspector');
	const [customReady, setCustomReady] = useState(false);
	const plan = useEditor((s) => s.plan);
	const saveStatus = useEditor((s) => s.saveStatus);
	const canUndo = useEditor((s) => s.past.length > 0);
	const canRedo = useEditor((s) => s.future.length > 0);
	const selection = useEditor((s) => s.selection);

	const reload = useCallback(async () => {
		try {
			const v = await api.video(slug);
			setVideo(v);
			editor.load(v.plan ? parsePlan(v.plan) : null);
		} catch (e) {
			setError(String(e));
		}
	}, [slug]);

	useEffect(() => {
		reload();
		api.sfx().then(setSfxFiles).catch(() => {});
	}, [reload, slug]);

	const schemaFiles = video?.files.diagrams.join('|') ?? null;
	useEffect(() => {
		if (schemaFiles === null) return;
		loadCustomDiagrams(slug, schemaFiles ? schemaFiles.split('|') : []).finally(() => setCustomReady(true));
	}, [slug, schemaFiles]);

	// Refresh analysis, draft and prepared media (after a job) without touching the plan being edited.
	const refreshMeta = useCallback(async () => {
		const v = await api.video(slug);
		setVideo(v);
		if (!editor.get().plan && v.plan) editor.load(parsePlan(v.plan));
	}, [slug]);

	// Autosave, debounced; the backend keeps a history snapshot at most once a minute.
	const saveTimer = useRef<number | undefined>(undefined);
	const version = useEditor((s) => s.version);
	useEffect(() => {
		if (saveStatus !== 'dirty' || !plan || editor.get().locked) return;
		window.clearTimeout(saveTimer.current);
		saveTimer.current = window.setTimeout(async () => {
			editor.set({saveStatus: 'saving'});
			try {
				if (editor.get().locked) return;
				await api.savePlan(slug, editor.get().plan!);
				if (editor.get().saveStatus === 'saving') editor.set({saveStatus: 'saved', saveError: undefined});
			} catch (e) {
				editor.set({saveStatus: 'error', saveError: String(e)});
			}
		}, 700);
	}, [version, saveStatus, plan, slug]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target;
			if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) return;
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
				e.preventDefault();
				editor.undo();
			} else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
				e.preventDefault();
				editor.redo();
			} else if (e.key === ' ') {
				e.preventDefault();
				player.toggle();
			} else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
				const step = e.shiftKey ? 1 : 1 / 30;
				player.seek(Math.max(0, editor.get().time + (e.key === 'ArrowLeft' ? -step : step)));
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	useEffect(() => {
		if (selection?.kind === 'textStyle') setTab('styles');
		else if (selection) setTab((t) => (t === 'lint' || t === 'transcript' ? t : 'inspector'));
	}, [selection]);

	const derived: Derived | null = useMemo(() => {
		if (!plan || !video) return null;
		const theme = resolveTheme(ThemeSchema.parse(video.theme), plan.themeOverrides);
		const edl = buildEdl(plan, theme);
		const analysis = (video.analysis as Analysis | null) ?? null;
		return {
			slug,
			edl,
			theme,
			segments: keptSegments(plan),
			warnings: lintPlan(plan, theme, analysis, edl),
			analysis,
			video,
			sfxFiles,
			reload: refreshMeta,
			reloadPlan: reload,
		};
	}, [plan, video, slug, sfxFiles, refreshMeta, reload]);

	if (error) return <div className="home"><p className="error">{error}</p><a href="#/">Back</a></div>;
	if (!video) return <div className="home">Loading {slug}…</div>;

	if (!plan) {
		return (
			<div className="home">
				<a href="#/" className="back-link">
					<Icon name="back" />
					All shorts
				</a>
				<header className="home-header">
					<h1>{slug}</h1>
					<span className="spacer" />
					<ColorModeToggle />
				</header>
				<p className="muted">Add your assets and your video, then launch it.</p>
				<SetupJobs slug={slug} video={video} onDone={refreshMeta} />
			</div>
		);
	}
	if (!derived) return null;

	const errors = derived.warnings.filter((w) => w.severity === 'error').length;
	const warns = derived.warnings.filter((w) => w.severity === 'warning').length;
	const over = derived.edl.durationAfter > derived.theme.format.targetDurationS;

	return (
		<DerivedContext.Provider value={derived}>
			<div className="editor">
				<header className="topbar">
					<a href="#/" className="brand" title="All shorts">
						<img src="/autoshort-logo.png" alt="" />
						<span className="brand-name">AutoShort</span>
					</a>
					<strong className="title" title={slug}>{slug}</strong>
					<span className={`duration ${over ? 'over' : ''}`} title="Output duration (live)">
						{derived.edl.durationAfter.toFixed(2)} s <span className="muted">/ {derived.theme.format.targetDurationS} s · rush {plan.source.duration.toFixed(1)} s</span>
					</span>
					<button className="icon-btn" disabled={!canUndo} onClick={() => editor.undo()} title="Undo (Ctrl+Z)" aria-label="Undo">
						<Icon name="undo" />
					</button>
					<button className="icon-btn" disabled={!canRedo} onClick={() => editor.redo()} title="Redo (Ctrl+Y)" aria-label="Redo">
						<Icon name="redo" />
					</button>
					<span className={`save ${saveStatus}`} title={editor.get().saveError}>
						{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'dirty' ? 'Unsaved' : 'Save failed'}
					</span>
					<span className="spacer" />
					<button className={errors ? 'lint-btn err' : warns ? 'lint-btn warn' : 'lint-btn'} onClick={() => setTab('lint')}>
						{errors} errors · {warns} warnings
					</button>
					<ColorModeToggle />
					<button className="primary" onClick={() => setTab('jobs')}>
						<Icon name="download" />
						Export
					</button>
				</header>
				{video.draft ? <DraftBanner slug={slug} onDone={reload} /> : null}
				<div className="workspace">
					<section className="preview-col">{customReady ? <Preview /> : <div className="muted">Loading diagrams…</div>}</section>
					<section className="side-col">
						<nav className="tabs">
							{(['inspector', 'styles', 'lint', 'transcript', 'catalog', 'jobs', 'history'] as Tab[]).map((t) => (
								<button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
									{t === 'lint' ? `Checks (${derived.warnings.length})` : t[0].toUpperCase() + t.slice(1)}
								</button>
							))}
						</nav>
						<div className="tab-body">
							{tab === 'inspector' ? <Inspector /> : null}
							{tab === 'styles' ? <StylesPanel /> : null}
							{tab === 'lint' ? <LintPanel /> : null}
							{tab === 'transcript' ? <TranscriptPanel /> : null}
							{tab === 'catalog' ? <CatalogPanel /> : null}
							{tab === 'jobs' ? <JobsPanel /> : null}
							{tab === 'history' ? <HistoryPanel /> : null}
						</div>
					</section>
				</div>
				<Timeline />
				<footer className="statusbar muted small">
					<span className="grow" style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
						Space play/pause · ←/→ frame (Shift: 1 s) · Ctrl+Z / Ctrl+Y · playhead {fmtTime(editor.get().time)}
					</span>
					<SocialLinks size={14} />
				</footer>
			</div>
		</DerivedContext.Provider>
	);
};

const DraftBanner: React.FC<{slug: string; onDone: () => Promise<void>}> = ({slug, onDone}) => (
	<div className="draft-banner">
		A plan draft from Claude is waiting for review. Accepting replaces the current plan (the current one stays in History).
		<button className="primary" onClick={async () => { await api.acceptDraft(slug); await onDone(); }}>Accept draft</button>
		<button onClick={async () => { await api.discardDraft(slug); await onDone(); }}>Discard</button>
	</div>
);

const SetupJobs: React.FC<{slug: string; video: VideoState; onDone: () => Promise<void>}> = ({slug, video, onDone}) => {
	const [prompt, setPrompt] = useState('');
	const assets = video.files.assets;
	return (
		<div className="setup">
			<div className="card">
				<h3>1. Assets</h3>
				{video.files.rush.length ? (
					<p>
						Video: <strong>{video.files.rush[0]}</strong>
					</p>
				) : (
					<FileDrop slug={slug} kind="rush" label="Drop the video you filmed" hint="One video per short (mp4, mov, mkv). The app copies it, your original is never touched." onAdded={onDone} />
				)}
				<FileDrop
					slug={slug}
					kind="assets"
					label="Add pictures, videos, music (optional)"
					hint="Name them mode__trigger.png (screen__mail.png, logo__google.png…) to place them on the word they belong to. A notes.md gives instructions to the Claude proposal."
					onAdded={onDone}
				/>
				{assets.length ? <p className="muted small">{assets.length} file(s): {assets.join(', ')}</p> : null}
				<div className="free-list">
					<FreeLinks kind="pictures" label="Free pictures" />
					<FreeLinks kind="broll" label="B-roll" />
					<FreeLinks kind="music" label="Music" />
				</div>
				<button className="small" onClick={() => api.openFolder(slug)}>Open the project folder</button>
			</div>
			<div className="card">
				<h3>2. Vidéo</h3>
				<p className="muted small">
					Probe, WhisperX large-v3 + Silero VAD, burst fallback when speech is skipped, face track, media typing, first plan (caption blocks,
					assets named mode__trigger, one segment per sentence with alternating zooms). You choose next whether your video is already edited (nothing cut) or raw (cut it).
				</p>
				<label>
					Vocabulary hint for Whisper (optional)
					<input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Claude, Next.js, Supabase…" />
				</label>
				{video.files.rush.length ? (
					<JobsPanel standalone startType="import" startParams={{prompt}} onFinished={onDone} />
				) : (
					<p className="muted small">Add the video first.</p>
				)}
			</div>
		</div>
	);
};
