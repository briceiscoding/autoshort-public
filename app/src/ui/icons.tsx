// UI icons: Lucide (ISC) for actions, Simple Icons (CC0) for the social networks.
import React from 'react';
import {
	ChevronLeft,
	Clapperboard,
	Download,
	FolderOpen,
	Bell,
	Check,
	CircleAlert,
	ExternalLink,
	Moon,
	Music,
	Palette,
	Play,
	Plus,
	Type,
	Upload,
	Redo2,
	RotateCcw,
	ScanFace,
	SkipBack,
	SkipForward,
	Pause,
	Settings,
	MessageSquareText,
	Sparkles,
	Sun,
	Trash2,
	Undo2,
	Wand2,
	type IconNode,
} from 'lucide';
import {siGithub, siInstagram, siTiktok, siYoutube} from 'simple-icons';

const LUCIDE = {
	back: ChevronLeft,
	clapper: Clapperboard,
	download: Download,
	folder: FolderOpen,
	moon: Moon,
	plus: Plus,
	bell: Bell,
	check: Check,
	alert: CircleAlert,
	external: ExternalLink,
	music: Music,
	palette: Palette,
	play: Play,
	type: Type,
	upload: Upload,
	redo: Redo2,
	reset: RotateCcw,
	media: ScanFace,
	start: SkipBack,
	end: SkipForward,
	pause: Pause,
	settings: Settings,
	feedback: MessageSquareText,
	sparkles: Sparkles,
	sun: Sun,
	trash: Trash2,
	undo: Undo2,
	wand: Wand2,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof LUCIDE;

export const Icon: React.FC<{name: IconName; size?: number}> = ({name, size = 16}) => (
	<svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		{LUCIDE[name].map(([tag, attrs], i) => React.createElement(tag, {key: i, ...attrs}))}
	</svg>
);

const BRANDS = {youtube: siYoutube, tiktok: siTiktok, instagram: siInstagram, github: siGithub};

export type Brand = keyof typeof BRANDS;

export const BrandIcon: React.FC<{brand: Brand; size?: number}> = ({brand, size = 16}) => (
	<svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<path d={BRANDS[brand].path} />
	</svg>
);
