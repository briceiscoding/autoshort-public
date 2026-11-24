// One sound at a time when listening to the library: a new one stops the previous one, the same one again stops it.
let current: {src: string; audio: HTMLAudioElement} | null = null;

export const listenSfx = (file: string): void => {
	const src = `/library/sfx/${encodeURIComponent(file)}`;
	const previous = current;
	if (previous) {
		previous.audio.pause();
		current = null;
		if (previous.src === src && !previous.audio.ended) return;
	}
	const audio = new Audio(src);
	current = {src, audio};
	audio.addEventListener('ended', () => {
		if (current?.audio === audio) current = null;
	});
	audio.play().catch(() => {});
};
