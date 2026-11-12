// Drop zone (or file picker) that copies files into the project: the rush, or assets.
import React, {useRef, useState} from 'react';
import {api, type AddedFile} from './api';

const RUSH_ACCEPT = '.mp4,.mov,.mkv,.m4v,.webm';
const ASSET_ACCEPT = 'image/*,video/*,audio/*,.md,.txt';

export const FileDrop: React.FC<{
	slug: string;
	kind: 'rush' | 'assets';
	label: string;
	hint?: string;
	onAdded: (added: AddedFile[]) => void;
}> = ({slug, kind, label, hint, onAdded}) => {
	const input = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);
	const [busy, setBusy] = useState<{name: string; progress: number} | null>(null);
	const [error, setError] = useState('');

	const send = async (files: File[]) => {
		setError('');
		const added: AddedFile[] = [];
		for (const file of kind === 'rush' ? files.slice(0, 1) : files) {
			setBusy({name: file.name, progress: 0});
			try {
				added.push(await api.upload(slug, kind, file, (progress) => setBusy({name: file.name, progress})));
			} catch (e) {
				setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
		setBusy(null);
		if (added.length) onAdded(added);
	};

	return (
		<div
			className={`file-drop${over ? ' over' : ''}${busy ? ' busy' : ''}`}
			onDragOver={(e) => {
				e.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				if (!busy) send([...e.dataTransfer.files]);
			}}
			onClick={() => !busy && input.current?.click()}
		>
			<input
				ref={input}
				type="file"
				hidden
				multiple={kind === 'assets'}
				accept={kind === 'rush' ? RUSH_ACCEPT : ASSET_ACCEPT}
				onChange={(e) => {
					send([...(e.target.files ?? [])]);
					e.target.value = '';
				}}
			/>
			{busy ? (
				<>
					<strong>Copying {busy.name}…</strong>
					<div className="bar">
						<div style={{width: `${Math.round(busy.progress * 100)}%`}} />
					</div>
				</>
			) : (
				<>
					<strong>{label}</strong>
					<span className="muted small">{hint ?? 'Drop files here or click to choose.'}</span>
				</>
			)}
			{error ? <span className="error small">{error}</span> : null}
		</div>
	);
};
