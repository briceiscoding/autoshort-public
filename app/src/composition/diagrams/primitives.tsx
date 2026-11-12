// Port of engine/src/schema/index.tsx: canvas, wobble, float, sticker box, arrow, line, path, icon, image, label.
import React, {useMemo} from 'react';
import {absolutize, normalize, parsePath, serialize} from 'path-data-parser';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Options} from 'roughjs/bin/core';
import type {RoughGenerator} from 'roughjs/bin/generator';
import {measureText} from '../Captions';
import {useTheme, useVideoUrl} from '../context';
import type {IconNode} from './icons';
import {Sketch} from './Sketch';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const GRID_OPACITY = 0.3;
const GRID_GLOW_OPACITY = 0.08;
const FLOAT_PX = 4;
const FLOAT_DEG = 0.9;
const IMAGE_POP_S = 0.25;
const GRID_FADE_S = 0.15;
const TEXT_FADE_S = 0.12;
const WOBBLE_FRAMES = 6;
const WOBBLE_SEEDS = 5;
const WOBBLE_SCALE = 7;

// Hand-animated "boil": displaces everything it wraps, text included, a few times a second.
export const Wobble: React.FC<{id: string; children: React.ReactNode}> = ({id, children}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const seed = 1 + (Math.floor(frame / WOBBLE_FRAMES) % WOBBLE_SEEDS);
	return (
		<>
			<filter id={id} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
				<feTurbulence type="fractalNoise" baseFrequency={0.018} numOctaves={2} seed={seed} />
				<feDisplacementMap in="SourceGraphic" scale={WOBBLE_SCALE} />
			</filter>
			<g filter={`url(#${id})`}>{children}</g>
		</>
	);
};

// Near-black background with a soft lit centre, white grid with a faint glow, vignette toward the edges.
export const SchemaCanvas: React.FC<{children: React.ReactNode; id?: string}> = ({children, id = 'schema'}) => {
	const theme = useTheme();
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const grid = theme.diagrams.grid;
	const gridOpacity = interpolate(frame / fps, [0, GRID_FADE_S], [0, 1], clamp);
	const lines: React.ReactNode[] = [];
	for (let x = (width % grid) / 2; x <= width; x += grid) lines.push(<line key={`v${x}`} x1={x} x2={x} y1={0} y2={height} />);
	for (let y = (height % grid) / 2; y <= height; y += grid) lines.push(<line key={`h${y}`} x1={0} x2={width} y1={y} y2={y} />);
	return (
		<AbsoluteFill
			style={{
				background: `radial-gradient(ellipse 75% 60% at 50% 42%, #2A2A2D 0%, ${theme.colors.diagramBg} 45%, #000000 100%)`,
			}}
		>
			<svg width={width} height={height} style={{position: 'absolute'}}>
				<defs>
					<radialGradient id={`${id}-grid-fade`} cx="50%" cy="42%" r="70%">
						<stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
						<stop offset="60%" stopColor="#FFFFFF" stopOpacity={0.75} />
						<stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.05} />
					</radialGradient>
					<mask id={`${id}-grid-mask`}>
						<rect width={width} height={height} fill={`url(#${id}-grid-fade)`} />
					</mask>
					<filter id={`${id}-grid-glow`} x="-5%" y="-5%" width="110%" height="110%">
						<feGaussianBlur stdDeviation={3} />
					</filter>
					<TintFilter id={`${id}-tint`} color={theme.colors.accent} />
				</defs>
				<g mask={`url(#${id}-grid-mask)`} opacity={gridOpacity} stroke="#FFFFFF">
					<g strokeWidth={6} strokeOpacity={GRID_GLOW_OPACITY} filter={`url(#${id}-grid-glow)`}>
						{lines}
					</g>
					<g strokeWidth={2} strokeOpacity={GRID_OPACITY}>
						{lines}
					</g>
				</g>
				<TintContext.Provider value={`${id}-tint`}>
					<Wobble id={`${id}-wobble`}>{children}</Wobble>
				</TintContext.Provider>
			</svg>
		</AbsoluteFill>
	);
};

const TintContext = React.createContext('schema-tint');

// Recolours a picture with the accent while keeping its shading (folder.png -> pink folder).
const TintFilter: React.FC<{id: string; color: string}> = ({id, color}) => {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
	const k = 1.08;
	const row = (c: number) => `${0.299 * c * k} ${0.587 * c * k} ${0.114 * c * k} 0 0`;
	return (
		<filter id={id} colorInterpolationFilters="sRGB">
			<feColorMatrix type="matrix" values={`${row(r)} ${row(g)} ${row(b)} 0 0 0 1 0`} />
		</filter>
	);
};

// Slow, small continuous drift; each element gets its own phase so they never move in sync.
export const Float: React.FC<{phase: number; cx: number; cy: number; children: React.ReactNode}> = ({phase, cx, cy, children}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const dx = FLOAT_PX * Math.sin(t * 1.6 + phase);
	const dy = FLOAT_PX * Math.sin(t * 1.25 + phase * 1.7);
	const angle = FLOAT_DEG * Math.sin(t * 1.1 + phase * 2.3);
	return <g transform={`translate(${dx} ${dy}) rotate(${angle} ${cx} ${cy})`}>{children}</g>;
};

// Raster picture that pops in: scale 0 > 115 % > 100 %. `src` is relative to the video folder.
export const SchemaImage: React.FC<{src: string; x: number; y: number; size: number; start: number; tint?: boolean}> = ({
	src,
	x,
	y,
	size,
	start,
	tint = false,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const url = useVideoUrl();
	const tintId = React.useContext(TintContext);
	const t = frame / fps - start;
	if (t < 0) return null;
	const scale = interpolate(t, [0, IMAGE_POP_S * 0.6, IMAGE_POP_S], [0, 1.15, 1], clamp);
	const [cx, cy] = [x + size / 2, y + size / 2];
	return (
		<g transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}>
			<image href={url(src)} x={x} y={y} width={size} height={size} filter={tint ? `url(#${tintId})` : undefined} />
		</g>
	);
};

export const Label: React.FC<{
	x: number;
	y: number;
	text: string;
	start: number;
	size?: number;
	color?: string;
	anchor?: 'start' | 'middle' | 'end';
}> = ({x, y, text, start, size = 60, color, anchor = 'middle'}) => {
	const theme = useTheme();
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const opacity = interpolate(frame / fps, [start, start + TEXT_FADE_S], [0, 1], clamp);
	return (
		<text
			x={x}
			y={y}
			fill={color ?? theme.colors.cream}
			opacity={opacity}
			fontFamily={theme.fonts.display.family}
			fontSize={size}
			style={{textTransform: 'uppercase'}}
			textAnchor={anchor}
			dominantBaseline="central"
		>
			{text}
		</text>
	);
};

type Common = {start: number; draw: number; seed: number};

export const Frame: React.FC<Common & {x: number; y: number; w: number; h: number}> = ({x, y, w, h, ...common}) => {
	const shape = useMemo(() => (g: RoughGenerator, o: Options) => g.rectangle(x, y, w, h, o), [x, y, w, h]);
	return <Sketch shape={shape} {...common} />;
};

// Room kept between a sticker's border and its label (the hand-drawn border wobbles a few px).
export const STICKER_PAD_X = 70;
export const STICKER_PAD_Y = 34;
const CANVAS_MARGIN = 60;

export type StickerFit = {x: number; y: number; w: number; h: number; size: number; labelX: number};

// Sticker box sized for its label: it grows around its centre (up to maxW and the canvas edges) so the label keeps
// STICKER_PAD_X on both sides, and the label shrinks only when even the widest box is too narrow.
// `iconSpace` is reserved on the left for an icon drawn inside the box.
export const stickerFit = (
	box: {x: number; y: number; w: number; h: number},
	label: string,
	size: number,
	family: string,
	opts: {iconSpace?: number; maxW?: number; canvasWidth?: number} = {},
): StickerFit => {
	const iconSpace = opts.iconSpace ?? 0;
	const canvasWidth = opts.canvasWidth ?? 1080;
	const maxW = Math.min(opts.maxW ?? Infinity, canvasWidth - 2 * CANVAS_MARGIN);
	const textW = label ? measureText(label.toUpperCase(), `${size}px ${family}`) : 0;
	const need = textW + 2 * STICKER_PAD_X + iconSpace;
	const w = Math.max(box.w, Math.min(need, maxW));
	const fitted = need > w && textW > 0 ? Math.floor((size * (w - 2 * STICKER_PAD_X - iconSpace)) / textW) : size;
	const h = Math.max(box.h, Math.round(fitted + 2 * STICKER_PAD_Y));
	const cx = box.x + box.w / 2;
	const x = Math.min(Math.max(cx - w / 2, CANVAS_MARGIN), canvasWidth - CANVAS_MARGIN - w);
	const y = box.y + box.h / 2 - h / 2;
	return {x, y, w, h, size: fitted, labelX: x + iconSpace + (w - iconSpace) / 2};
};

// Sticker: filled box with a solid accent offset shadow and a centred label, sized to keep padding around the label.
export const StickerBox: React.FC<
	Common & {x: number; y: number; w: number; h: number; label?: string; labelY?: number; size?: number; labelColor?: string; iconSpace?: number; maxW?: number}
> = ({label, labelY, size = 60, labelColor, iconSpace, maxW, ...rest}) => {
	const theme = useTheme();
	const {width} = useVideoConfig();
	const {x: x0, y: y0, w: w0, h: h0, ...common} = rest;
	const fit = stickerFit({x: x0, y: y0, w: w0, h: h0}, label ?? '', size, theme.fonts.display.family, {iconSpace, maxW, canvasWidth: width});
	const {x, y, w, h} = fit;
	const shape = useMemo(() => (g: RoughGenerator, o: Options) => g.rectangle(x, y, w, h, o), [x, y, w, h]);
	return (
		<>
			<Sketch shape={shape} fill={theme.colors.diagramBg} sticker {...common} />
			{label ? (
				<Label x={fit.labelX} y={labelY ?? y + h / 2} text={label} size={fit.size} color={labelColor} start={common.start + common.draw} />
			) : null}
		</>
	);
};

export const Arrow: React.FC<Common & {from: [number, number]; to: [number, number]; color?: string; both?: boolean; headSize?: number}> = ({
	from,
	to,
	color,
	both = false,
	headSize = 40,
	...common
}) => {
	const theme = useTheme();
	const shape = useMemo(() => {
		const head = (tip: [number, number], tail: [number, number]) => {
			const angle = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
			const wing = (delta: number): [number, number] => [tip[0] - headSize * Math.cos(angle + delta), tip[1] - headSize * Math.sin(angle + delta)];
			const [a, b] = [wing(0.5), wing(-0.5)];
			return `M${a[0]} ${a[1]} L${tip[0]} ${tip[1]} L${b[0]} ${b[1]}`;
		};
		const d = [`M${from[0]} ${from[1]} L${to[0]} ${to[1]}`, head(to, from), both ? head(from, to) : ''].join(' ');
		return (g: RoughGenerator, o: Options) => g.path(d, o);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [from[0], from[1], to[0], to[1], both, headSize]);
	return <Sketch shape={shape} stroke={color ?? theme.colors.accent} {...common} />;
};

export const Line: React.FC<Common & {from: [number, number]; to: [number, number]; color?: string; strokeWidth?: number}> = ({
	from,
	to,
	color,
	...common
}) => {
	const shape = useMemo(
		() => (g: RoughGenerator, o: Options) => g.line(from[0], from[1], to[0], to[1], o),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[from[0], from[1], to[0], to[1]],
	);
	return <Sketch shape={shape} stroke={color} {...common} />;
};

export const PathSketch: React.FC<Common & {d: string; color?: string; fill?: string; strokeWidth?: number}> = ({d, color, ...common}) => {
	const shape = useMemo(() => (g: RoughGenerator, o: Options) => g.path(d, o), [d]);
	return <Sketch shape={shape} stroke={color} {...common} />;
};

const circlePath = (px: number, py: number, rx: number, ry: number): string => {
	const kx = rx * 0.5523;
	const ky = ry * 0.5523;
	return (
		`M${px - rx} ${py} C${px - rx} ${py - ky} ${px - kx} ${py - ry} ${px} ${py - ry} ` +
		`C${px + kx} ${py - ry} ${px + rx} ${py - ky} ${px + rx} ${py} ` +
		`C${px + rx} ${py + ky} ${px + kx} ${py + ry} ${px} ${py + ry} ` +
		`C${px - kx} ${py + ry} ${px - rx} ${py + ky} ${px - rx} ${py}`
	);
};

const pointsPath = (points: string, x: number, y: number, unit: number, close: boolean): string => {
	const nums = points.trim().split(/[\s,]+/).map(Number);
	const parts: string[] = [];
	for (let i = 0; i + 1 < nums.length; i += 2) parts.push(`${i === 0 ? 'M' : 'L'}${x + nums[i] * unit} ${y + nums[i + 1] * unit}`);
	return parts.join(' ') + (close ? ' Z' : '');
};

export const nodeToPath = (node: IconNode, x: number, y: number, unit: number): string => {
	switch (node[0]) {
		case 'path': {
			const segments = normalize(absolutize(parsePath(node[1].d)));
			return serialize(segments.map((seg) => ({key: seg.key, data: seg.data.map((v, i) => (i % 2 === 0 ? x + v * unit : y + v * unit))})));
		}
		case 'line': {
			const {x1, y1, x2, y2} = node[1];
			return `M${x + x1 * unit} ${y + y1 * unit} L${x + x2 * unit} ${y + y2 * unit}`;
		}
		case 'circle': {
			const {cx, cy, r} = node[1];
			return circlePath(x + cx * unit, y + cy * unit, r * unit, r * unit);
		}
		case 'ellipse': {
			const {cx, cy, rx, ry} = node[1];
			return circlePath(x + cx * unit, y + cy * unit, rx * unit, ry * unit);
		}
		case 'rect': {
			const {x: rx0, y: ry0, width, height} = node[1];
			const [a, b, w, h] = [x + rx0 * unit, y + ry0 * unit, width * unit, height * unit];
			return `M${a} ${b} L${a + w} ${b} L${a + w} ${b + h} L${a} ${b + h} Z`;
		}
		case 'polyline':
			return pointsPath(node[1].points, x, y, unit, false);
		case 'polygon':
			return pointsPath(node[1].points, x, y, unit, true);
	}
};

export const Icon: React.FC<Common & {nodes: IconNode[]; x: number; y: number; size: number; color?: string; strokeWidth?: number}> = ({
	nodes,
	x,
	y,
	size,
	color,
	...common
}) => {
	const shape = useMemo(() => {
		const unit = size / 24;
		const d = nodes.map((node) => nodeToPath(node, x, y, unit)).join(' ');
		return (g: RoughGenerator, o: Options) => g.path(d, {...o, roughness: 0.9});
	}, [nodes, x, y, size]);
	return <Sketch shape={shape} stroke={color} {...common} />;
};
