// Derived data shared by the editor panels (EDL, lint, theme), recomputed on every plan change.
import {createContext, useContext} from 'react';
import type {Edl} from '../edl/types';
import type {KeptSegment} from '../edl/time';
import type {LintWarning} from '../lint/lint';
import type {Analysis} from '../model/analysis';
import type {Theme} from '../model/theme';
import type {VideoState} from './api';

export type Derived = {
	slug: string;
	edl: Edl;
	theme: Theme;
	segments: KeptSegment[];
	warnings: LintWarning[];
	analysis: Analysis | null;
	video: VideoState;
	sfxFiles: string[];
	reload: () => Promise<void>;
	// Load the plan from disk, dropping the one in memory and its undo stack (after an import or a reset).
	reloadPlan: () => Promise<void>;
};

export const DerivedContext = createContext<Derived | null>(null);

export const useDerived = (): Derived => {
	const value = useContext(DerivedContext);
	if (!value) throw new Error('DerivedContext missing');
	return value;
};

// Imperative access to the Player (seek, play) from any panel.
export const player = {
	seek: (_seconds: number) => {},
	toggle: () => {},
	isPlaying: () => false,
	// Output duration in seconds (for "go to the end").
	duration: () => 0,
};

export const fmtTime = (t: number): string => {
	const m = Math.floor(t / 60);
	const s = t - m * 60;
	return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
