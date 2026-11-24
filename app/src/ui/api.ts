// Backend client.
import type {Analysis} from '../model/analysis';
import type {Asset, Plan} from '../model/plan';

// "short" (9:16), "landscape" (YouTube 16:9) or "rough" (rough cut: silences cut, nothing added), chosen when the
// project is created.
export type VideoFormat = 'short' | 'landscape' | 'rough';

export type VideoSummary = {
	slug: string;
	format?: VideoFormat;
	hasPlan: boolean;
	hasDraft: boolean;
	rush: string[];
	outputs: string[];
	modified: string;
};

export type VideoState = {
	slug: string;
	format?: VideoFormat;
	plan: Plan | null;
	draft: Plan | null;
	analysis: Analysis | null;
	theme: unknown;
	files: {assets: string[]; rush: string[]; exports: string[]; diagrams: string[]};
	// Absolute path of the project folder (projects/<slug>).
	folder: string;
	prepared: {subscribe: string | null; mattes: {file: string; start: number; end: number}[]};
	notes: string | null;
	// What produced the waiting draft: the author's feedback, or null for a proposal from scratch.
	draftRequest: {feedback: string | null; at: number} | null;
};

export type HistoryItem = {name: string; at: string; size: number; label: string | null};

// How Claude Code is connected (the saved token never comes back, only a masked form).
export type ClaudeSettings = {
	installed: boolean;
	version: string | null;
	command: string;
	mode: 'subscription' | 'apiKey' | 'login';
	token: string | null;
	systemApiKey: boolean;
};

export type StyleState = {
	refs: {file: string; note: string}[];
	note: string;
	components: string[];
	description: string | null;
	fonts: string[];
	sheet: {name: string; file: string}[];
	history: {id: string; label: string}[];
	jobs: JobInfo[];
};

export type JobInfo = {
	id: string;
	slug: string;
	type: string;
	status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
	progress: number;
	message: string;
	step: string | null;
	steps: string[];
	stepIndex: number;
	logs: string[];
	created: number;
	finished: number | null;
	result: Record<string, string>;
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const res = await fetch(url, {headers: {'content-type': 'application/json'}, ...init});
	if (!res.ok) {
		let detail = res.statusText;
		try {
			detail = (await res.json()).detail ?? detail;
		} catch {
			/* not json */
		}
		throw new Error(detail);
	}
	return res.json() as Promise<T>;
};

export type AddedFile = {file: string; size: number; asset: Asset | null};

export type BrandKit = {
	subscribe: {file: string; exists: boolean};
	sfx: {rule: string; file: string | null; exists: boolean}[];
	sfxFiles: string[];
	// Where each sound is used (moments, videos): it cannot be deleted then.
	sfxUses: Record<string, string[]>;
};

const uploadRaw = async (url: string, file: File): Promise<{file: string}> => {
	const res = await fetch(url, {method: 'PUT', body: file});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.detail ?? res.statusText);
	return body as {file: string};
};

const slugUrl = (slug: string) => `/api/videos/${encodeURIComponent(slug)}`;

// Streamed upload (the rush can be several GB), with progress.
const uploadFile = (slug: string, kind: 'rush' | 'assets', file: File, onProgress?: (fraction: number) => void): Promise<AddedFile> =>
	new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', `${slugUrl(slug)}/files/${kind}/${encodeURIComponent(file.name)}`);
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
		xhr.onload = () => {
			let body: any = null;
			try {
				body = JSON.parse(xhr.responseText);
			} catch {
				/* not json */
			}
			if (xhr.status >= 200 && xhr.status < 300) resolve(body as AddedFile);
			else reject(new Error(body?.detail ?? xhr.statusText));
		};
		xhr.onerror = () => reject(new Error('upload failed'));
		xhr.send(file);
	});

export const api = {
	videos: () => request<VideoSummary[]>('/api/videos'),
	createVideo: (name: string, format: VideoFormat = 'short') =>
		request<{slug: string; format: VideoFormat}>('/api/videos', {method: 'POST', body: JSON.stringify({name, format})}),
	// The project folder goes to the recycle bin.
	deleteVideo: (slug: string) => request<{ok: boolean}>(slugUrl(slug), {method: 'DELETE'}),
	// Native folder picker (opened by the backend on this computer); null when cancelled.
	pickFolder: (initial = '') => request<{path: string | null}>('/api/pick-folder', {method: 'POST', body: JSON.stringify({initial})}),
	upload: uploadFile,
	copyFile: (slug: string, kind: 'rush' | 'assets', path: string) =>
		request<AddedFile>(`${slugUrl(slug)}/files/${kind}/copy`, {method: 'POST', body: JSON.stringify({path})}),
	openFolder: (slug: string, sub = '') => request(`${slugUrl(slug)}/open-folder${sub ? `?sub=${encodeURIComponent(sub)}` : ''}`, {method: 'POST'}),
	video: (slug: string) => request<VideoState>(`/api/videos/${encodeURIComponent(slug)}`),
	savePlan: (slug: string, plan: Plan, snapshot = false) =>
		request<{ok: boolean; savedAt: string}>(`/api/videos/${encodeURIComponent(slug)}/plan${snapshot ? '?snapshot=true' : ''}`, {
			method: 'PUT',
			body: JSON.stringify(plan),
		}),
	history: (slug: string) => request<HistoryItem[]>(`/api/videos/${encodeURIComponent(slug)}/history`),
	historyItem: (slug: string, name: string) => request<Plan>(`/api/videos/${encodeURIComponent(slug)}/history/${encodeURIComponent(name)}`),
	// keep: the current plan is saved in History first.
	acceptDraft: (slug: string, keep = true) => request(`/api/videos/${encodeURIComponent(slug)}/draft/accept?keep=${keep}`, {method: 'POST'}),
	claudeSettings: () => request<ClaudeSettings>('/api/settings/claude'),
	// An empty token goes back to the login of the claude command on this computer.
	saveClaudeToken: (token: string) => request<ClaudeSettings>('/api/settings/claude', {method: 'PUT', body: JSON.stringify({token})}),
	testClaude: () => request<{ok: boolean; message: string}>('/api/settings/claude/test', {method: 'POST'}),
	discardDraft: (slug: string) => request(`/api/videos/${encodeURIComponent(slug)}/draft`, {method: 'DELETE'}),
	sfx: () => request<string[]>('/api/library/sfx'),
	fonts: () => request<string[]>('/api/library/fonts'),
	uploadFont: async (file: File) => {
		const res = await fetch(`/api/library/fonts/${encodeURIComponent(file.name)}`, {method: 'PUT', body: file});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(body.detail ?? res.statusText);
		return body as {file: string};
	},
	importGoogleFont: (family: string) => request<{files: string[]}>('/api/library/fonts/google', {method: 'POST', body: JSON.stringify({family})}),
	brandKit: () => request<BrandKit>('/api/library/brand-kit'),
	// A sound effect for library/sfx; with a moment (theme sfx rule), used for it in every video.
	// To the recycle bin; refused while a moment or a video uses it (the message says where).
	deleteSfx: (file: string) => request<{deleted: string}>(`/api/library/sfx/${encodeURIComponent(file)}`, {method: 'DELETE'}),
	uploadSfx: (file: File, rule?: string) => uploadRaw(`/api/library/sfx/${encodeURIComponent(file.name)}${rule ? `?rule=${rule}` : ''}`, file),
	uploadSubscribe: (file: File) => uploadRaw(`/api/library/brand/subscribe/${encodeURIComponent(file.name)}`, file),
	// Change the default theme of every video of a format (theme/theme.json, or theme/theme.landscape.json for 16:9).
	patchTheme: (patch: Record<string, unknown>, format: VideoFormat = 'short') =>
		request<unknown>(`/api/theme?format=${format}`, {method: 'PATCH', body: JSON.stringify(patch)}),
	startJob: (slug: string, type: string, params: Record<string, unknown> = {}) =>
		request<JobInfo>(`/api/videos/${encodeURIComponent(slug)}/jobs/${type}`, {method: 'POST', body: JSON.stringify(params)}),
	jobs: (slug: string) => request<JobInfo[]>(`/api/jobs?slug=${encodeURIComponent(slug)}`),
	// YouTube 16:9 style made by Claude from reference pictures (theme/landscape).
	style: () => request<StyleState>('/api/style'),
	addStyleRef: async (file: File): Promise<{files: string[]}> => {
		const res = await fetch(`/api/style/refs/${encodeURIComponent(file.name)}`, {method: 'PUT', body: file});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(body.detail ?? res.statusText);
		return body as {files: string[]};
	},
	deleteStyleRef: (name: string) => request<{ok: true}>(`/api/style/refs/${encodeURIComponent(name)}`, {method: 'DELETE'}),
	setStyleNotes: (notes: {note?: string; refs?: Record<string, string>}) => request<unknown>('/api/style/notes', {method: 'PUT', body: JSON.stringify(notes)}),
	startStyleJob: (mode: 'create' | 'revise' | 'sheet', feedback = '') =>
		request<JobInfo>(`/api/style/jobs/${mode}`, {method: 'POST', body: JSON.stringify({feedback})}),
	restoreStyle: (version: string) => request<{kept: string}>(`/api/style/restore/${encodeURIComponent(version)}`, {method: 'POST'}),
	job: (id: string) => request<JobInfo>(`/api/jobs/${id}`),
	cancelJob: (id: string) => request(`/api/jobs/${id}/cancel`, {method: 'POST'}),
};
