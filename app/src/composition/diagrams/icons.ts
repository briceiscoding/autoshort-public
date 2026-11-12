// Icon library for diagrams: the legacy hand-tuned sketch icons first, then any Lucide icon by kebab-case name.
import {icons as lucideIcons} from 'lucide';

export type IconNode =
	| ['path', {d: string}]
	| ['circle', {cx: number; cy: number; r: number}]
	| ['line', {x1: number; y1: number; x2: number; y2: number}]
	| ['rect', {x: number; y: number; width: number; height: number; rx?: number}]
	| ['ellipse', {cx: number; cy: number; rx: number; ry: number}]
	| ['polyline', {points: string}]
	| ['polygon', {points: string}];

// Hand-tuned sketch icons, used before the Lucide set.
export const BUILTIN_ICONS: Record<string, IconNode[]> = {
	check: [['path', {d: 'M20 6 9 17l-5-5'}]],
	'memory-stick': [
		['path', {d: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.1a2 2 0 0 0 0 3.837V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.1a2 2 0 0 0 0-3.837Z'}],
		['line', {x1: 8, y1: 9, x2: 8, y2: 11}],
		['line', {x1: 12, y1: 9, x2: 12, y2: 11}],
		['line', {x1: 16, y1: 9, x2: 16, y2: 11}],
		['line', {x1: 2, y1: 15, x2: 22, y2: 15}],
	],
	'code-xml': [
		['path', {d: 'M18 16 L22 12 L18 8'}],
		['path', {d: 'M6 8 L2 12 L6 16'}],
		['line', {x1: 14.5, y1: 4, x2: 9.5, y2: 20}],
	],
	'triangle-alert': [
		['path', {d: 'M10.27 4 L2.27 18 A2 2 0 0 0 4 21 L20 21 A2 2 0 0 0 21.73 18 L13.73 4 A2 2 0 0 0 10.27 4 Z'}],
		['line', {x1: 12, y1: 9, x2: 12, y2: 13}],
		['line', {x1: 12, y1: 16.6, x2: 12, y2: 17.4}],
	],
	move: [
		['line', {x1: 12, y1: 2, x2: 12, y2: 22}],
		['line', {x1: 2, y1: 12, x2: 22, y2: 12}],
		['path', {d: 'M9 5 L12 2 L15 5'}],
		['path', {d: 'M9 19 L12 22 L15 19'}],
		['path', {d: 'M5 9 L2 12 L5 15'}],
		['path', {d: 'M19 9 L22 12 L19 15'}],
	],
	play: [['path', {d: 'M7 4 L20 12 L7 20 Z'}]],
	star: [['path', {d: 'M12 2 L15 8.6 L22 9.3 L16.8 14 L18.2 21 L12 17.4 L5.8 21 L7.2 14 L2 9.3 L9 8.6 Z'}]],
	'stick-figure': [
		['circle', {cx: 12, cy: 4.5, r: 3.5}],
		['line', {x1: 12, y1: 8, x2: 12, y2: 16}],
		['line', {x1: 12, y1: 10.5, x2: 6, y2: 14.5}],
		['line', {x1: 12, y1: 10.5, x2: 18, y2: 14.5}],
		['line', {x1: 12, y1: 16, x2: 7, y2: 23}],
		['line', {x1: 12, y1: 16, x2: 17, y2: 23}],
	],
	'cinema-camera': [
		['circle', {cx: 6.5, cy: 5, r: 3.2}],
		['circle', {cx: 13, cy: 5, r: 3.2}],
		['path', {d: 'M3 9 L16 9 L16 17.5 L3 17.5 Z'}],
		['path', {d: 'M16 11 L21.5 8.5 L21.5 18 L16 15.5'}],
		['line', {x1: 9.5, y1: 17.5, x2: 5, y2: 24}],
		['line', {x1: 9.5, y1: 17.5, x2: 14, y2: 24}],
	],
	crosshair: [
		['circle', {cx: 12, cy: 12, r: 10}],
		['line', {x1: 22, y1: 12, x2: 18, y2: 12}],
		['line', {x1: 6, y1: 12, x2: 2, y2: 12}],
		['line', {x1: 12, y1: 6, x2: 12, y2: 2}],
		['line', {x1: 12, y1: 22, x2: 12, y2: 18}],
	],
	user: [
		['path', {d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'}],
		['circle', {cx: 12, cy: 7, r: 4}],
	],
	'rotate-cw': [
		['path', {d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'}],
		['path', {d: 'M21 3v5h-5'}],
	],
};

// Legacy camelCase names used by the hand-written diagrams.
export const ICONS: Record<string, IconNode[]> = {
	...BUILTIN_ICONS,
	memory: BUILTIN_ICONS['memory-stick'],
	code: BUILTIN_ICONS['code-xml'],
	alert: BUILTIN_ICONS['triangle-alert'],
	stickFigure: BUILTIN_ICONS['stick-figure'],
	cinemaCamera: BUILTIN_ICONS['cinema-camera'],
	rotateCw: BUILTIN_ICONS['rotate-cw'],
};

const pascal = (name: string): string =>
	name
		.split(/[-_ ]+/)
		.filter(Boolean)
		.map((p) => p[0].toUpperCase() + p.slice(1))
		.join('');

const num = (v: unknown): number => Number(v ?? 0);

export const iconNames = (): string[] => [
	...Object.keys(BUILTIN_ICONS),
	...Object.keys(lucideIcons).map((n) => n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()),
];

export const findIcon = (name: string | undefined): IconNode[] | null => {
	if (!name) return null;
	if (BUILTIN_ICONS[name]) return BUILTIN_ICONS[name];
	const raw = (lucideIcons as Record<string, unknown>)[pascal(name)] as [string, Record<string, string>][] | undefined;
	if (!raw) return null;
	return raw
		.map(([tag, a]): IconNode | null => {
			switch (tag) {
				case 'path':
					return ['path', {d: a.d}];
				case 'circle':
					return ['circle', {cx: num(a.cx), cy: num(a.cy), r: num(a.r)}];
				case 'line':
					return ['line', {x1: num(a.x1), y1: num(a.y1), x2: num(a.x2), y2: num(a.y2)}];
				case 'rect':
					return ['rect', {x: num(a.x), y: num(a.y), width: num(a.width), height: num(a.height), rx: num(a.rx)}];
				case 'ellipse':
					return ['ellipse', {cx: num(a.cx), cy: num(a.cy), rx: num(a.rx), ry: num(a.ry)}];
				case 'polyline':
					return ['polyline', {points: a.points}];
				case 'polygon':
					return ['polygon', {points: a.points}];
				default:
					return null;
			}
		})
		.filter((n): n is IconNode => n !== null);
};
