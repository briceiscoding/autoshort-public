import type {FrameStyle, TextStyle} from '../model/theme';
// EDL: the plan resolved to OUTPUT time. Derived, never edited by hand.
// Field names follow the legacy edl.json of the montage_shorts_claude pipeline so both can be compared.

export type EdlSegment = {
	id: string;
	srcStart: number;
	srcEnd: number;
	outStart: number;
	outEnd: number;
	zoom: boolean;
	zoomSfx: boolean;
	text: string;
};

export type EdlCaptionWord = {
	id: string;
	text: string;
	start: number;
	end: number;
	highlight: boolean;
	keyword?: boolean;
};

export type EdlCaptionBlock = {
	start: number;
	end: number;
	text: string;
	words: EdlCaptionWord[];
};

export type EdlConcept = {id: string; text: string; start: number; end: number; typing: number; style: TextStyle};

export type EdlLogo = {
	id: string;
	file: string;
	trigger: string;
	start: number;
	end: number;
	size: number;
	x: number;
	y: number;
	// Visible area of the picture [x0, y0, x1, y1] in source pixels, trimmed like the legacy pipeline.
	alphaBox?: [number, number, number, number];
	sourceWidth?: number;
	sourceHeight?: number;
	process?: 'luma_key' | 'rembg' | null;
	enter?: 'pop' | 'top' | 'bottom' | 'left' | 'right';
	shake?: number;
	rotate?: number;
};

export type EdlAsset = {
	id: string;
	file: string;
	mode: 'full' | 'screen' | 'bg';
	video: boolean;
	start: number;
	end: number;
	trim?: number;
	zoom?: number;
	dim?: number;
	shake?: number;
	enter?: 'pop' | 'top' | 'bottom' | 'left' | 'right';
	rotate?: number;
	aspect?: number;
	x?: number;
	y?: number;
	width?: number;
	// Corners, border and shadow (screen and bg cards), resolved from the theme, the video and the picture.
	frame: FrameStyle;
};

export type EdlGauge = {
	id: string;
	file: string;
	box: [number, number, number, number];
	label: string;
	from: number;
	to: number;
	landing: number;
	start: number;
	end: number;
	sourceWidth?: number;
	sourceHeight?: number;
};

export type EdlDiagramElement = {
	id: string;
	label: string;
	icon?: string;
	image?: string;
	accent?: boolean;
	strike?: boolean;
	check?: boolean;
	kind?: string;
	trigger?: string;
	draw: number;
	start: number;
};

export type EdlDiagram = {
	id: string;
	template: string;
	component?: string;
	description?: string;
	start: number;
	end: number;
	elements: EdlDiagramElement[];
};

export type EdlSfx = {
	time: number;
	file: string;
	duration?: number;
	fadeOut?: number;
	gain?: number;
	reason: string;
	// Plan event that produced this sound (for the timeline).
	ref?: string;
};

export type EdlOverlay = {
	file: string;
	start: number;
	end: number;
	scale: number;
	x: number;
	y: number;
	keyColor: string;
	enter?: 'pop' | 'top' | 'bottom' | 'left' | 'right';
	rotate?: number;
	shake?: number;
};

export type Edl = {
	slug: string;
	source: string;
	fps: number;
	width: number;
	height: number;
	crop: {x: number; y: number; width: number; height: number; sourceWidth: number};
	durationBefore: number;
	durationAfter: number;
	segments: EdlSegment[];
	captions: EdlCaptionBlock[];
	concepts: EdlConcept[];
	logos: EdlLogo[];
	assets: EdlAsset[];
	gauges: EdlGauge[];
	diagrams: EdlDiagram[];
	sfx: EdlSfx[];
	overlaySubscribe: EdlOverlay | null;
	music: {file: string; underVoiceDb: number} | null;
	hideCaptionsDuringConcepts: boolean;
	unplacedAssets: string[];
};
