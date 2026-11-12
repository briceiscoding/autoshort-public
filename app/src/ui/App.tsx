import React, {useEffect, useState} from 'react';
import {api, type VideoSummary} from './api';
import {BrandKitPage} from './BrandKit';
import {ColorModeToggle} from './colorMode';
import {Editor} from './Editor';
import {Icon} from './icons';
import {SocialLinks} from './links';
import {SettingsPage} from './Settings';
import {HelpPage} from './Help';

const slugFromHash = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));

export const App: React.FC = () => {
	const [slug, setSlug] = useState(slugFromHash());
	useEffect(() => {
		const onHash = () => setSlug(slugFromHash());
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	}, []);
	// "~" never appears in a short's slug: the brand kit page cannot collide with a short.
	if (slug === '~brand-kit') return <BrandKitPage />;
	if (slug === '~settings') return <SettingsPage />;
	if (slug === '~help' || slug.startsWith('~help/')) return <HelpPage section={slug.split('/')[1]} />;
	return slug ? <Editor key={slug} slug={slug} /> : <VideoList />;
};

const VideoList: React.FC = () => {
	const [videos, setVideos] = useState<VideoSummary[] | null>(null);
	const [error, setError] = useState('');
	const [name, setName] = useState('');
	const [confirming, setConfirming] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);
	const refresh = () => api.videos().then(setVideos).catch((e) => setError(String(e)));
	useEffect(() => {
		refresh();
	}, []);
	const remove = async (slug: string) => {
		setError('');
		setDeleting(slug);
		try {
			await api.deleteVideo(slug);
			setConfirming(null);
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setDeleting(null);
		}
	};
	const create = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		try {
			const {slug} = await api.createVideo(name);
			window.location.hash = `#/${encodeURIComponent(slug)}`;
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};
	return (
		<div className="home">
			<header className="home-header">
				<img className="logo" src="/autoshort-logo.png" alt="" />
				<h1>
					Auto<span>Short</span>
				</h1>
				<span className="spacer" />
				<a className="button" href="#/~brand-kit" title="Subscribe reminder, sound effects, fonts: make AutoShort yours">
					<Icon name="palette" />
					Brand kit
				</a>
				<a className="button" href="#/~help" title="Help: a guide to every feature">
					<Icon name="help" />
					<span className="btn-label">Help</span>
				</a>
				<a className="button" href="#/~settings" title="Settings: connect Claude Code (your subscription or an API key)">
					<Icon name="settings" />
					<span className="btn-label">Settings</span>
				</a>
				<ColorModeToggle />
			</header>
			<form className="new-project card" onSubmit={create}>
				<h3>New short</h3>
				<div className="row" style={{flexWrap: 'nowrap'}}>
					<input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. My first short" autoFocus />
					<button className="primary" disabled={!name.trim()}>
						<Icon name="plus" />
						Create
					</button>
				</div>
				<p className="muted small">Then drop the video you filmed and your pictures: the app keeps its own copy of everything.</p>
			</form>
			{error ? <p className="error">{error}</p> : null}
			{!videos ? <p>Loading…</p> : null}
			{videos && !videos.length ? <p className="muted">No short yet.</p> : null}
			<div className="video-grid">
				{videos?.map((v) => (
					<a key={v.slug} className="video-card" href={`#/${encodeURIComponent(v.slug)}`}>
						<strong>{v.slug}</strong>
						<span className="muted">{v.rush.join(', ') || 'no video yet'}</span>
						<span>
							{v.hasPlan ? <em className="tag ok">edited</em> : <em className="tag warn">to import</em>}
							{v.hasDraft ? <em className="tag">draft</em> : null}
							{v.outputs.length ? <em className="tag">{v.outputs.length} exports</em> : null}
						</span>
						<span className="muted small">Edited {new Date(v.modified).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'})}</span>
						{confirming === v.slug ? (
							<span className="row delete-confirm" onClick={(e) => e.preventDefault()}>
								<span className="small">Delete this short? Rush, pictures and exports go to the recycle bin.</span>
								<button className="small danger" disabled={deleting === v.slug} onClick={() => remove(v.slug)}>
									{deleting === v.slug ? 'Deleting…' : 'Delete'}
								</button>
								<button className="small" disabled={deleting === v.slug} onClick={() => setConfirming(null)}>Cancel</button>
							</span>
						) : (
							<button
								className="small delete-video"
								title="Delete this short"
								onClick={(e) => {
									e.preventDefault();
									setConfirming(v.slug);
								}}
							>
								<Icon name="trash" />
							</button>
						)}
					</a>
				))}
			</div>
			<footer className="home-footer muted small">
				<span className="grow">AutoShort · local editor for face cam shorts</span>
				<SocialLinks withLabels />
			</footer>
		</div>
	);
};
