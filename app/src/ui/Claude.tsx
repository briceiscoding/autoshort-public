// Claude tab: give feedback on the edit and get a revised draft from Claude Code, or ask for a new proposal from
// scratch. The draft then waits for review in the banner at the top (accept, keeping or not the current version).
import React, {useEffect, useState} from 'react';
import {api, type ClaudeSettings} from './api';
import {useDerived} from './context';
import {Icon} from './icons';
import {JobsPanel, saveThenStart} from './Panels';

const DRAFT_KEY = 'autoshort.feedbackDraft.';
const EXAMPLES = [
	'Fewer concepts, only the strongest words',
	'Add a diagram when I explain how it works',
	'Put the logo pictures one second earlier',
	'Highlight the numbers',
];

const readDraft = (slug: string) => {
	try {
		return window.localStorage.getItem(DRAFT_KEY + slug) ?? '';
	} catch {
		return '';
	}
};
const writeDraft = (slug: string, text: string) => {
	try {
		if (text) window.localStorage.setItem(DRAFT_KEY + slug, text);
		else window.localStorage.removeItem(DRAFT_KEY + slug);
	} catch {
		/* private window: not remembered */
	}
};

export const ClaudePanel: React.FC = () => {
	const {slug, video} = useDerived();
	const [feedback, setFeedback] = useState(() => readDraft(slug));
	const [status, setStatus] = useState<ClaudeSettings | null>(null);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		api.claudeSettings().then(setStatus).catch(() => setStatus(null));
	}, []);
	useEffect(() => {
		let alive = true;
		const tick = () =>
			api.jobs(slug).then((jobs) => alive && setRunning(jobs.some((j) => j.status === 'running' || j.status === 'queued'))).catch(() => {});
		tick();
		const id = window.setInterval(tick, 1000);
		return () => {
			alive = false;
			window.clearInterval(id);
		};
	}, [slug]);

	const update = (text: string) => {
		setFeedback(text);
		writeDraft(slug, text);
	};
	const start = async (withFeedback: boolean) => {
		setError('');
		try {
			await saveThenStart(slug, 'propose', withFeedback ? {feedback: feedback.trim()} : {});
			setRunning(true);
			if (withFeedback) update('');
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<div className="claude-panel">
			<h3>Feedback to Claude</h3>
			<p className="muted small">
				Say what to change in this edit. Claude Code revises the current edit (your manual changes included) and keeps the rest. The result arrives as a
				draft at the top: accept it, keeping or not the current version in History, or discard it.
			</p>
			{status && !status.installed ? (
				<p className="note warn small">
					Claude Code is not installed on this computer. <a href="#/~settings">Open Settings</a>
				</p>
			) : status ? (
				<p className="muted small">
					Claude Code through {status.mode === 'subscription' ? 'your subscription token' : status.mode === 'apiKey' ? 'an API key (billed per use)' : 'the login of this computer'} ·{' '}
					<a href="#/~settings">Settings</a>
				</p>
			) : null}
			{video.draft ? <p className="note warn small">A draft is already waiting at the top: a new request replaces it.</p> : null}
			<textarea
				className="feedback-input"
				rows={5}
				value={feedback}
				onChange={(e) => update(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && feedback.trim() && !running) start(true);
				}}
				placeholder="e.g. The concept at 0:12 is too early, cut the hesitation at the start, add a diagram about the three steps…"
				aria-label="Your feedback"
			/>
			<div className="feedback-examples">
				{EXAMPLES.map((ex) => (
					<button key={ex} className="small" type="button" onClick={() => update(feedback ? `${feedback.trimEnd()}\n${ex}` : ex)}>
						{ex}
					</button>
				))}
			</div>
			<div className="row">
				<button className="primary" disabled={!feedback.trim() || running} onClick={() => start(true)} title="Ctrl+Enter">
					<Icon name="feedback" />
					{running ? 'Claude is working…' : 'Revise with this feedback'}
				</button>
				<button disabled={running} onClick={() => start(false)} title="Ignore the current edit and propose again from the transcript">
					<Icon name="sparkles" />
					New proposal from scratch
				</button>
			</div>
			{error ? <p className="error small">{error}</p> : null}
			<JobsPanel standalone listOnly={['propose']} />
		</div>
	);
};
