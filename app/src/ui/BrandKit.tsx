// Brand kit: what every short uses from the library (subscribe reminder, sound effects, fonts), with a guided import
// for each, so a new user can make the app their own.
import React, {useEffect, useRef, useState} from 'react';
import {api, type BrandKit} from './api';
import {ColorModeToggle} from './colorMode';
import {Icon} from './icons';
import {FreeLinks, HomeFooter} from './links';

const MOMENTS: Record<string, {label: string; hint: string}> = {
	cutIn: {label: 'A picture appears', hint: 'screen, full and bg pictures'},
	logo: {label: 'A logo appears', hint: 'short pop'},
	zoom: {label: 'Zoom in', hint: 'every zoomed sentence'},
	conceptTyping: {label: 'Concept word typed', hint: 'keyboard, cut at the last letter'},
	diagramOpen: {label: 'Diagram opens', hint: 'whoosh'},
	diagramElement: {label: 'Diagram element drawn', hint: 'one per element'},
	gauge: {label: 'Gauge appears', hint: ''},
	gaugeLanding: {label: 'Gauge lands', hint: ''},
};

// A hidden file input opened by a button.
const PickFile: React.FC<{accept: string; label: string; busy: boolean; onPick: (file: File) => void; primary?: boolean}> = ({accept, label, busy, onPick, primary}) => {
	const input = useRef<HTMLInputElement>(null);
	return (
		<>
			<button className={`small ${primary ? 'primary' : ''}`} disabled={busy} onClick={() => input.current?.click()}>
				<Icon name="upload" size={14} />
				{busy ? 'Importing…' : label}
			</button>
			<input
				ref={input}
				type="file"
				accept={accept}
				hidden
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = '';
					if (file) onPick(file);
				}}
			/>
		</>
	);
};

const Status: React.FC<{ok: boolean; okText?: string; missingText?: string}> = ({ok, okText = 'Ready', missingText = 'Missing'}) => (
	<span className={`status ${ok ? 'ok' : 'missing'}`}>
		<Icon name={ok ? 'check' : 'alert'} size={14} />
		{ok ? okText : missingText}
	</span>
);

export const BrandKitPage: React.FC = () => {
	const [kit, setKit] = useState<BrandKit | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState('');
	const [done, setDone] = useState('');
	const reload = () => api.brandKit().then(setKit).catch((e) => setError(String(e)));
	useEffect(() => {
		reload();
	}, []);
	const run = async (key: string, task: () => Promise<{file: string}>, message: string) => {
		setError('');
		setDone('');
		setBusy(key);
		try {
			const {file} = await task();
			setDone(`${message}: ${file}`);
			await reload();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	};
	const missing = kit ? Number(!kit.subscribe.exists) + kit.sfx.filter((s) => !s.exists).length : 0;

	return (
		<div className="home brand-kit">
			<a href="#/" className="back-link">
				<Icon name="back" />
				All shorts
			</a>
			<header className="home-header">
				<h1>Brand kit</h1>
				<span className="spacer" />
				<ColorModeToggle />
			</header>
			<p className="muted lead">
				What every short uses from your library. Import your own files to make AutoShort yours: they apply to all your videos.
				{kit ? (missing ? ` ${missing} item(s) to set up.` : ' Everything is set up.') : null}
			</p>
			{error ? <p className="error">{error}</p> : null}
			{done ? <p className="ok">{done}</p> : null}
			{!kit ? <p>Loading…</p> : null}

			{kit ? (
				<div className="kit-grid">
					<section className="card kit-section">
						<div className="kit-head">
							<span className="kit-icon"><Icon name="bell" size={18} /></span>
							<h3 className="grow">Subscribe reminder</h3>
							<Status ok={kit.subscribe.exists} missingText="Not set: no reminder shown" />
						</div>
						<p className="muted small">
							A short animation on a green background (the green is removed at export). It appears when you say a call to action such as
							“abonne-toi” or “suis-moi”. Use your own, or one you have the right to use.
						</p>
						{kit.subscribe.exists ? <video className="kit-preview" src={`/library/${kit.subscribe.file}`} muted loop autoPlay playsInline /> : null}
						<div className="row">
							<PickFile
								accept=".mp4,.mov,.webm,.mkv,video/*"
								label={kit.subscribe.exists ? 'Replace the animation' : 'Import an animation'}
								primary={!kit.subscribe.exists}
								busy={busy === 'subscribe'}
								onPick={(f) => run('subscribe', () => api.uploadSubscribe(f), 'Subscribe animation imported')}
							/>
							<span className="grow" />
							<FreeLinks kind="subscribe" label="Find one" />
						</div>
					</section>

					<section className="card kit-section">
						<div className="kit-head">
							<span className="kit-icon"><Icon name="music" size={18} /></span>
							<h3 className="grow">Sound effects</h3>
							<Status ok={kit.sfx.every((s) => s.exists)} missingText="Some sounds are missing" />
						</div>
						<p className="muted small">One sound per moment of the edit, played under your voice. Short sounds (under a second) work best.</p>
						<ul className="sfx-list">
							{kit.sfx.map((s) => (
								<li key={s.rule}>
									<div className="grow">
										<strong>{MOMENTS[s.rule]?.label ?? s.rule}</strong>
										<span className="muted small">
											{s.exists ? s.file : `missing${s.file ? `: ${s.file}` : ''}`}
											{MOMENTS[s.rule]?.hint ? ` · ${MOMENTS[s.rule].hint}` : ''}
										</span>
									</div>
									{s.exists && s.file ? (
										<button className="icon-btn" title="Listen" aria-label="Listen" onClick={() => new Audio(`/library/sfx/${encodeURIComponent(s.file!)}`).play()}>
											<Icon name="play" />
										</button>
									) : null}
									<PickFile
										accept=".wav,.mp3,.ogg,.m4a,.flac,audio/*"
										label="Replace"
										primary={!s.exists}
										busy={busy === s.rule}
										onPick={(f) => run(s.rule, () => api.uploadSfx(f, s.rule), `${MOMENTS[s.rule]?.label ?? s.rule}`)}
									/>
								</li>
							))}
						</ul>
						<div className="row">
							<FreeLinks kind="sfx" label="Free sounds" />
						</div>
					</section>

					<section className="card kit-section">
						<div className="kit-head">
							<span className="kit-icon"><Icon name="type" size={18} /></span>
							<h3 className="grow">Fonts and colours</h3>
						</div>
						<p className="muted small">
							Open any short, then the <strong>Styles</strong> tab: import a Google Fonts family by name or a font file, change colours, outline and
							shadow, then “Save as default for all videos”.
						</p>
						<div className="row">
							<FreeLinks kind="fonts" label="Fonts" />
						</div>
					</section>

					<section className="card kit-section">
						<div className="kit-head">
							<span className="kit-icon"><Icon name="palette" size={18} /></span>
							<h3 className="grow">Pictures, b-roll and music</h3>
						</div>
						<p className="muted small">
							Add them to each short (Assets). Name a picture <code>mode__word.png</code> to show it when you say that word, e.g.{' '}
							<code>logo__docker.png</code>, <code>screen__dashboard.png</code>, <code>bg__server.jpg</code>.
						</p>
						<div className="free-list">
							<FreeLinks kind="pictures" label="Pictures" />
							<FreeLinks kind="broll" label="B-roll videos" />
							<FreeLinks kind="logos" label="Logos" />
							<FreeLinks kind="music" label="Music" />
						</div>
					</section>
				</div>
			) : null}
			<p className="muted small">Check the licence of every file you download before publishing your videos.</p>
			<HomeFooter />
		</div>
	);
};
