// Port of engine/src/schema/Sketch.tsx: rough.js strokes drawn progressively, with boil.
import React, {useMemo} from 'react';
import rough from 'roughjs';
import type {Options} from 'roughjs/bin/core';
import type {RoughGenerator} from 'roughjs/bin/generator';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {useTheme} from '../context';

const generator = rough.generator();
const SVG_NS = 'http://www.w3.org/2000/svg';
const BOIL_FRAMES = 4;
const BOIL_SEEDS = 7;
const FILL_FADE_S = 0.12;
const STICKER_OFFSET = 10;

export const STROKE_WIDTH = 7;

export type Shape = (g: RoughGenerator, options: Options) => ReturnType<RoughGenerator['line']>;

const lengthCache = new Map<string, number>();

const measure = (d: string): number => {
	const cached = lengthCache.get(d);
	if (cached !== undefined) return cached;
	const path = document.createElementNS(SVG_NS, 'path');
	path.setAttribute('d', d);
	const length = path.getTotalLength();
	if (lengthCache.size > 20000) lengthCache.clear();
	lengthCache.set(d, length);
	return length;
};

// Rough.js chains several subpaths in one `d`; SVG restarts dashes on each of them,
// so they are split and revealed one after the other to draw a single continuous line.
const toSubpaths = (d: string): {d: string; length: number}[] =>
	d
		.split(/(?=M)/)
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => ({d: part, length: measure(part)}));

export const useSeed = (base: number, drawnAt: number): number => {
	const frame = useCurrentFrame();
	if (frame < drawnAt) return base;
	return base + (Math.floor(frame / BOIL_FRAMES) % BOIL_SEEDS);
};

// Times are seconds relative to the diagram's start. Nothing renders before `start`.
export const Sketch: React.FC<{
	shape: Shape;
	start: number;
	draw: number;
	seed: number;
	stroke?: string;
	fill?: string;
	sticker?: boolean;
	strokeWidth?: number;
	roughness?: number;
}> = ({shape, start, draw, seed, stroke, fill, sticker = false, strokeWidth, roughness}) => {
	const theme = useTheme();
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const strokeColor = stroke ?? theme.colors.cream;
	const width = strokeWidth ?? theme.diagrams.strokeWidth;
	const startFrame = Math.round(start * fps);
	const drawFrames = Math.max(1, Math.round(draw * fps));
	const drawnAt = startFrame + drawFrames;
	const currentSeed = useSeed(seed, drawnAt);

	const {outlines, fills} = useMemo(() => {
		const options: Options = {
			seed: currentSeed,
			roughness: roughness ?? theme.diagrams.roughness,
			bowing: 1,
			strokeWidth: width,
			stroke: strokeColor,
			disableMultiStroke: true,
			preserveVertices: false,
		};
		const outline = generator.toPaths(shape(generator, options));
		const solid = fill ? generator.toPaths(shape(generator, {...options, fill, fillStyle: 'solid', stroke: 'none'})) : [];
		return {
			outlines: outline.flatMap((p) => toSubpaths(p.d)),
			fills: solid.filter((p) => p.fill && p.fill !== 'none').map((p) => p.d),
		};
	}, [currentSeed, fill, shape, strokeColor, width, roughness, theme.diagrams.roughness]);

	if (frame < startFrame) return null;

	const progress = interpolate(frame, [startFrame, drawnAt], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const fillOpacity = interpolate(frame, [drawnAt, drawnAt + FILL_FADE_S * fps], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const total = outlines.reduce((sum, p) => sum + p.length, 0);
	let remaining = progress * total;

	return (
		<g>
			{sticker
				? fills.map((d, i) => (
						<path
							key={`shadow-${i}`}
							d={d}
							fill={theme.colors.accent}
							opacity={fillOpacity}
							transform={`translate(${STICKER_OFFSET} ${STICKER_OFFSET})`}
						/>
					))
				: null}
			{fills.map((d, i) => (
				<path key={`fill-${i}`} d={d} fill={fill} opacity={fillOpacity} />
			))}
			{outlines.map((part, i) => {
				const shown = Math.min(part.length, remaining);
				remaining -= shown;
				if (shown <= 0) return null;
				return (
					<path
						key={i}
						d={part.d}
						fill="none"
						stroke={strokeColor}
						strokeWidth={width}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray={`${shown} ${part.length + 1}`}
					/>
				);
			})}
		</g>
	);
};
