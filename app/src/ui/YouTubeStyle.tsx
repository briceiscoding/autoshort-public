// YouTube 16:9 style: the author drops screenshots (or short clips) of edits they like, Claude makes the style of
// their 16:9 videos from them (theme + components), and a control sheet shows each element next to the references.
// One style for every 16:9 video; the shorts are never touched. Every change keeps the previous version.
import React, {useEffect, useRef, useState} from 'react';
import {api, type JobInfo, type StyleState} from './api';
import {ColorModeToggle} from './colorMode';
import {Icon} from './icons';
import {HomeFooter} from './links';

const SHEET_LABELS: Record<string, string> = {
	captions: 'Captions',
	concept: 'Concept word',
	logo: 'Logo',
	screen: 'Picture card',
	full: 'Full frame picture',
	bg: 'Picture behind you',
	'diagram-flow': 'Diagram: steps',
	'diagram-comparison': 'Diagram: comparison',
	'diagram-tree': 'Diagram: tree',
	gauge: 'Gauge',
	subscribe: 'Subscribe reminder',
};

const running = (job?: JobInfo) => job && (job.status === 'queued' || job.status === 'running');

export const YouTubeStylePage: React.FC = () => {
	const [state, setState] = useState<StyleState | null>(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState('');
	const [note, setNote] = useState('');
	const [feedback, setFeedback] = useState('');
	const [stamp, setStamp] = useState(Date.now());
	const input = useRef<HTMLInputElement>(null);
	const job = state?.jobs[0];

	const reload = async () => {
		try {
			const s = await api.style();
			setState(s);
			setStamp(Date.now());
			return s;
		} catch (e) {
			setError(String(e instanceof Error ? e.message : e));
			return null;
		}
	};
	useEffect(() => {
		reload().then((s) => s && setNote(s.note));
	}, []);
	// While a style job runs, follow it; reload the style when it ends.
	useEffect(() => {
		if (!running(job)) return;
		const timer = window.setInterval(async () => {
			const s = await reload();
			if (s && !running(s.jobs[0])) window.clearInterval(timer);
		}, 2000);
		return () => window.clearInterval(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [job?.id, job?.status]);

	const act = async (key: string, task: () => Promise<unknown>) => {
		setError('');
		setBusy(key);
		try {
			await task();
			await reload();
		} catch (e) {
			setError(String(e instanceof Error ? e.message : e));
		} finally {
			setBusy('');
		}
	};
	const addFiles = (files: FileList | null) =>
		files?.length &&
		act('add', async () => {
			for (const file of Array.from(files)) await api.addStyleRef(file);
		});
	const file = (path: string) => `/style-files/${path}?t=${stamp}`;
	const hasStyle = Boolean(state && (state.description || state.components.length || state.sheet.length));

	return (
		<div className="home brand-kit youtube-style">
			<a href="#/~brand-kit" className="back-link">
				<Icon name="back" />
				Brand kit
			</a>
			<header className="home-header">
				<h1>YouTube 16:9 style</h1>
				<span className="spacer" />
				<ColorModeToggle />
			</header>
			<p className="muted lead">
				Drop screenshots of YouTube edits you like (or short clips: pictures are taken from them). Claude makes the style of your 16:9 videos from
				them: fonts, colours, captions, cards, diagrams and animations. Your shorts keep their own style.
			</p>
			{error ? <p className="error">{error}</p> : null}
			{!state ? <p>Loading…</p> : null}

			{state ? (
				<>
					<section className="card kit-section">
						<div className="kit-head">
							<span className="kit-icon"><Icon name="media" size={18} /></span>
							<h3 className="grow">References ({state.refs.length})</h3>
							<button className="small primary" disabled={busy === 'add'} onClick={() => input.current?.click()}>
								<Icon name="upload" size={14} />
								{busy === 'add' ? 'Importing…' : 'Add pictures or clips'}
							</button>
							<input
								ref={input}
								type="file"
								multiple
								hidden
								accept=".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm,.mkv,.m4v,image/*,video/*"
								onChange={(e) => {
									const files = e.target.files;
									e.target.value = '';
									addFiles(files);
								}}
							/>
						</div>
						<div
							className="style-refs"
							onDragOver={(e) => e.preventDefault()}
							onDrop={(e) => {
								e.preventDefault();
								addFiles(e.dataTransfer.files);
							}}
						>
							{state.refs.length ? null : <p className="muted small">Drop pictures here.</p>}
							{state.refs.map((r) => (
								<figure key={r.file} className="style-ref">
									<img src={file(`refs/${r.file}`)} alt={r.file} loading="lazy" />
									<input
										className="small"
										defaultValue={r.note}
										placeholder="What you like here (optional)"
										onBlur={(e) => e.target.value !== r.note && act('note', () => api.setStyleNotes({refs: {[r.file]: e.target.value}}))}
									/>
									<button className="icon-btn" title="Remove this reference" aria-label="Remove" onClick={() => act('del', () => api.deleteStyleRef(r.file))}>
										<Icon name="trash" size={14} />
									</button>
								</figure>
							))}
						</div>
						<label className="small">
							What you want overall (optional)
							<textarea
								rows={2}
								value={note}
								onChange={(e) => setNote(e.target.value)}
								onBlur={() => note !== state.note && act('note', () => api.setStyleNotes({note}))}
								placeholder="e.g. clean and bold, captions low with a yellow highlight, cards sliding in from the right"
							/>
						</label>
						<div className="row">
							<button
								className="primary"
								disabled={!state.refs.length || Boolean(running(job)) || Boolean(busy)}
								onClick={() => act('create', () => api.startStyleJob('create'))}
								title="Claude reads every reference and writes the style (a few minutes, on your Claude subscription)"
							>
								<Icon name="sparkles" size={16} />
								{hasStyle ? 'Make the style again from the references' : 'Make the style'}
							</button>
						</div>
					</section>

					{job ? (
						<section className="card kit-section">
							<div className="kit-head">
								<h3 className="grow">{job.steps[0]}</h3>
								<span className={`tag ${job.status === 'done' ? 'ok' : job.status === 'failed' ? 'warn' : ''}`}>{job.status}</span>
							</div>
							{running(job) ? (
								<div className="progress">
									<div style={{width: `${Math.round(job.progress * 100)}%`}} />
								</div>
							) : null}
							<p className="muted small">{job.message}</p>
							{job.status === 'failed' ? <pre className="small job-log">{job.logs.slice(-12).join('\n')}</pre> : null}
						</section>
					) : null}

					{hasStyle ? (
						<section className="card kit-section">
							<div className="kit-head">
								<span className="kit-icon"><Icon name="palette" size={18} /></span>
								<h3 className="grow">Your style</h3>
								<button className="small" disabled={Boolean(running(job))} onClick={() => act('sheet', () => api.startStyleJob('sheet'))} title="Render the control sheet again (after a change in the Styles tab)">
									<Icon name="reset" size={14} />
									Refresh the sheet
								</button>
							</div>
							{state.description ? <div className="style-description small">{state.description}</div> : null}
							{state.components.length ? (
								<p className="muted small">Custom elements: {state.components.map((c) => c.replace(/\.tsx$/, '')).join(', ')}</p>
							) : null}
							<div className="style-sheet">
								{state.sheet.map((s) => (
									<figure key={s.name}>
										<a href={file(`sheet/${s.file}`)} target="_blank" rel="noreferrer">
											<img src={file(`sheet/${s.file}`)} alt={s.name} loading="lazy" />
										</a>
										<figcaption className="small muted">{SHEET_LABELS[s.name] ?? s.name}</figcaption>
									</figure>
								))}
							</div>
							<label className="small">
								What to change
								<textarea
									rows={3}
									value={feedback}
									onChange={(e) => setFeedback(e.target.value)}
									placeholder="e.g. captions lower and thinner, the accent colour more orange, cards should slide in from the right"
								/>
							</label>
							<div className="row">
								<button
									className="primary"
									disabled={!feedback.trim() || Boolean(running(job)) || Boolean(busy)}
									onClick={() => act('revise', async () => {
										await api.startStyleJob('revise', feedback);
										setFeedback('');
									})}
								>
									<Icon name="wand" size={16} />
									Revise the style
								</button>
							</div>
						</section>
					) : null}

					{state.history.length ? (
						<section className="card kit-section">
							<div className="kit-head">
								<span className="kit-icon"><Icon name="undo" size={18} /></span>
								<h3 className="grow">Previous versions</h3>
							</div>
							<p className="muted small">Each change keeps the style as it was before. Going back keeps the current one too.</p>
							<ul className="sfx-list">
								{state.history.slice(0, 12).map((h) => (
									<li key={h.id}>
										<div className="grow">
											<strong>{h.id.replace(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2}).*/, '$3/$2/$1 $4:$5')}</strong>
											<span className="muted small">{h.label}</span>
										</div>
										<button className="small" disabled={Boolean(running(job)) || Boolean(busy)} onClick={() => act('restore', () => api.restoreStyle(h.id))}>
											Go back to this version
										</button>
									</li>
								))}
							</ul>
						</section>
					) : null}
				</>
			) : null}
			<HomeFooter />
		</div>
	);
};
