// Settings: how AutoShort reaches Claude Code (proposals and revisions from your feedback). The token is saved on this
// computer only (settings.local.json) and never shown again in full.
import React, {useEffect, useState} from 'react';
import {api, type ClaudeSettings} from './api';
import {ColorModeToggle} from './colorMode';
import {Icon} from './icons';
import {HomeFooter} from './links';

const MODE_TEXT: Record<ClaudeSettings['mode'], string> = {
	subscription: 'Your Claude subscription (token saved in AutoShort)',
	apiKey: 'An Anthropic API key (billed per use)',
	login: 'The login of Claude Code on this computer',
};

export const SettingsPage: React.FC = () => {
	const [status, setStatus] = useState<ClaudeSettings | null>(null);
	const [token, setToken] = useState('');
	const [busy, setBusy] = useState<'save' | 'remove' | 'test' | null>(null);
	const [error, setError] = useState('');
	const [test, setTest] = useState<{ok: boolean; message: string} | null>(null);

	useEffect(() => {
		api.claudeSettings().then(setStatus).catch((e) => setError(String(e)));
	}, []);

	const run = async (kind: 'save' | 'remove' | 'test', fn: () => Promise<void>) => {
		setBusy(kind);
		setError('');
		setTest(null);
		try {
			await fn();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="home settings">
			<a href="#/" className="back-link">
				<Icon name="back" />
				All shorts
			</a>
			<header className="home-header">
				<h1>Settings</h1>
				<span className="spacer" />
				<ColorModeToggle />
			</header>

			<section className="card settings-card">
				<div className="kit-head">
					<span className="kit-icon"><Icon name="sparkles" size={18} /></span>
					<h3 className="grow">Claude connection</h3>
					{status ? (
						<span className={`status ${status.installed ? 'ok' : 'missing'}`}>
							<Icon name={status.installed ? 'check' : 'alert'} size={14} />
							{status.installed ? `Claude Code ${status.version?.replace(/\s*\(Claude Code\)/, '') ?? ''}` : 'Claude Code not installed'}
						</span>
					) : null}
				</div>
				<p className="muted small">
					AutoShort asks Claude Code to propose the edit of a short and to revise it from your feedback (Claude tab of the editor). Claude Code runs on
					this computer and needs one of these:
				</p>
				<ol className="settings-plans small">
					<li>
						<strong>A Claude Pro or Max subscription</strong> (or a Team / Enterprise seat that includes Claude Code). In a terminal, run{' '}
						<code>claude setup-token</code>, sign in, then paste the token below (it starts with <code>sk-ant-oat</code>). Use counts toward your
						subscription limits.
					</li>
					<li>
						<strong>An Anthropic API key</strong>, billed per use, separately from any subscription: create one in the{' '}
						<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">Anthropic Console</a> and paste it below (it
						starts with <code>sk-ant-api</code>).
					</li>
				</ol>
				<p className="muted small">
					The free Claude plan does not include Claude Code. If you already signed in by running <code>claude</code> in a terminal on this computer, you
					can leave the field empty: AutoShort uses that login.
				</p>
				{status && !status.installed ? (
					<p className="note warn small">
						Install Claude Code first: <code>npm install -g @anthropic-ai/claude-code</code> (needs Node.js), then reopen this page.
					</p>
				) : null}

				{status ? (
					<p className="small">
						Connected through: <strong>{MODE_TEXT[status.mode]}</strong>
						{status.token ? <span className="muted mono"> · {status.token}</span> : null}
					</p>
				) : (
					<p>Loading…</p>
				)}
				{status?.mode === 'login' && status.systemApiKey ? (
					<p className="note warn small">
						An ANTHROPIC_API_KEY variable is set on this computer: Claude Code uses it (billed per use) before your subscription login. Paste a
						subscription token here to use your subscription instead.
					</p>
				) : null}

				<form
					className="row settings-token"
					onSubmit={(e) => {
						e.preventDefault();
						run('save', async () => {
							setStatus(await api.saveClaudeToken(token));
							setToken('');
						});
					}}
				>
					<input
						className="grow"
						type="password"
						autoComplete="off"
						spellCheck={false}
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder={status?.token ? 'Paste a new token to replace it' : 'sk-ant-oat… or sk-ant-api…'}
						aria-label="Claude token"
					/>
					<button className="primary" disabled={!token.trim() || Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
				</form>
				<div className="row">
					<button disabled={Boolean(busy) || !status?.installed} onClick={() => run('test', async () => setTest(await api.testClaude()))}>
						{busy === 'test' ? 'Testing… (up to a minute)' : 'Test the connection'}
					</button>
					{status?.token ? (
						<button className="danger" disabled={Boolean(busy)} onClick={() => run('remove', async () => setStatus(await api.saveClaudeToken('')))}>
							{busy === 'remove' ? 'Removing…' : 'Remove the saved token'}
						</button>
					) : null}
				</div>
				{test ? <p className={`note ${test.ok ? 'ok' : 'warn'} small`}>{test.message}</p> : null}
				{error ? <p className="error small">{error}</p> : null}
				<p className="muted small">
					The token stays on this computer (settings.local.json in the AutoShort folder, never committed): only Claude Code sends it, to Anthropic.
				</p>
			</section>
			<HomeFooter />
		</div>
	);
};
