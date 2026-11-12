// Light / dark interface, light by default, remembered in this browser.
import React, {useState} from 'react';
import {Icon} from './icons';

type Mode = 'light' | 'dark';
const KEY = 'autoshort.colorMode';

const read = (): Mode => {
	try {
		return window.localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
	} catch {
		return 'light';
	}
};

const apply = (mode: Mode) => {
	document.documentElement.dataset.theme = mode;
	try {
		window.localStorage.setItem(KEY, mode);
	} catch {
		/* private window: not remembered */
	}
};

export const initColorMode = () => apply(read());

export const ColorModeToggle: React.FC = () => {
	const [mode, setMode] = useState<Mode>(read);
	const next: Mode = mode === 'light' ? 'dark' : 'light';
	return (
		<button
			className="icon-btn"
			title={next === 'dark' ? 'Dark interface' : 'Light interface'}
			aria-label={next === 'dark' ? 'Dark interface' : 'Light interface'}
			onClick={() => {
				apply(next);
				setMode(next);
			}}
		>
			<Icon name={next === 'dark' ? 'moon' : 'sun'} />
		</button>
	);
};
