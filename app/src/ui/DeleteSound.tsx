import React, {useState} from 'react';
import {api} from './api';
import {Icon} from './icons';
import {stopSfx} from './listen';

// Delete a sound of library/sfx in two clicks (it goes to the recycle bin). The answer is shown on the row itself: a
// sound still used by a moment or a video is refused by the server, with where it is used.
export const DeleteSound: React.FC<{file: string; usedBy?: string[]; onDone: () => void}> = ({file, usedBy, onDone}) => {
	const [asking, setAsking] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const message = error ? <span className="error small sound-message">{error}</span> : null;
	if (usedBy?.length)
		return (
			<button className="icon-btn" disabled title={`Used for: ${usedBy.join(', ')}. Replace it there to delete it.`} aria-label="Delete (used)">
				<Icon name="trash" size={14} />
			</button>
		);
	if (!asking)
		return (
			<>
				<button
					className="icon-btn"
					title="Delete this sound"
					aria-label="Delete"
					onClick={() => {
						setError('');
						setAsking(true);
					}}
				>
					<Icon name="trash" size={14} />
				</button>
				{message}
			</>
		);
	return (
		<span className="row">
			<button
				className="small danger"
				disabled={busy}
				onClick={async () => {
					setBusy(true);
					stopSfx();
					try {
						await api.deleteSfx(file);
						onDone();
					} catch (e) {
						setError(e instanceof Error ? e.message : String(e));
					} finally {
						setBusy(false);
						setAsking(false);
					}
				}}
			>
				{busy ? 'Deleting…' : 'Delete'}
			</button>
			<button className="small" onClick={() => setAsking(false)}>
				Cancel
			</button>
		</span>
	);
};
