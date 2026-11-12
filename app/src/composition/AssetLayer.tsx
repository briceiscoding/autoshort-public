// Port of engine/src/AssetLayer.tsx: full, screen and bg cut-ins, logos.
import React from 'react';
import {AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {EdlAsset, EdlLogo} from '../edl/types';
import {frameCss} from '../model/theme';
import {useTheme, useVideoUrl} from './context';
import {bgRect, logoRect, screenRect} from './geometry';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const easeOut = Easing.out(Easing.cubic);

// Slow drift (a few px, under a degree) that keeps pictures alive without hurting readability.
const floatTransform = (time: number, phase = 0): string =>
	`translate(${5 * Math.sin(time * 1.5 + phase)}px, ${4 * Math.sin(time * 1.15 + phase * 1.7)}px) ` +
	`rotate(${0.8 * Math.sin(time * 1.05 + phase * 2.3)}deg)`;

// Nervous tremble: summed fast sines (deterministic), scaled up a bit so edges never show.
const shakeTransform = (time: number, amount: number): string => {
	const x = amount * (0.6 * Math.sin(time * 47) + 0.4 * Math.sin(time * 83 + 1.3));
	const y = amount * (0.6 * Math.sin(time * 53 + 0.7) + 0.4 * Math.sin(time * 71 + 2.1));
	const r = (amount / 10) * Math.sin(time * 39 + 0.4);
	return `translate(${x}px, ${y}px) rotate(${r}deg) scale(${1 + (amount * 3) / 1080})`;
};


// Chosen entrance (Inspector): a bounce in from an edge of the frame, or a pop around the picture's centre.
const ENTER_S = 0.45;
const bounce = Easing.out(Easing.back(1.4));
const enterMotion = (
	enter: EdlAsset['enter'],
	time: number,
	origin: {x: number; y: number},
	frame: {width: number; height: number},
): {transform: string; transformOrigin: string} => {
	const p = interpolate(time, [0, ENTER_S], [0, 1], clamp);
	const k = bounce(p);
	const transformOrigin = `${origin.x}px ${origin.y}px`;
	switch (enter) {
		case 'pop':
			return {transform: `scale(${Math.max(0, k)})`, transformOrigin};
		case 'top':
			return {transform: `translateY(${-(1 - k) * frame.height}px)`, transformOrigin};
		case 'bottom':
			return {transform: `translateY(${(1 - k) * frame.height}px)`, transformOrigin};
		case 'left':
			return {transform: `translateX(${-(1 - k) * frame.width}px)`, transformOrigin};
		case 'right':
			return {transform: `translateX(${(1 - k) * frame.width}px)`, transformOrigin};
		default:
			return {transform: 'none', transformOrigin};
	}
};

export const CutInLayer: React.FC<{asset: EdlAsset}> = ({asset}) => {
	const theme = useTheme();
	const url = useVideoUrl();
	const frame = useCurrentFrame();
	const {fps, durationInFrames, width: frameW, height: frameH} = useVideoConfig();
	const time = frame / fps;
	const total = durationInFrames / fps;
	const src = url(asset.file);
	const trimFrames = Math.round((asset.trim ?? 0) * fps);
	// A picture on the video's first frame cuts in: no entrance.
	const enter = asset.start > 0 ? asset.enter : undefined;
	const size = {width: frameW, height: frameH};

	if (asset.mode === 'bg') {
		const fade = enter ? 1 : interpolate(time, [0, 0.25], [0, 1], {...clamp, easing: easeOut});
		const exit = interpolate(time, [total - 0.2, total], [1, 0], clamp);
		const rect = bgRect(asset);
		return (
			<AbsoluteFill style={enterMotion(enter, time, {x: rect.x + rect.w / 2, y: rect.y + rect.h / 2}, size)}>
				<Img
					src={src}
					style={{
						...frameCss(asset.frame),
						display: 'block',
						position: 'absolute',
						width: rect.w,
						left: rect.x,
						top: asset.y ?? 650,
						transform: `translateY(calc(-50% + ${(1 - fade) * 40}px))`,
						opacity: fade * exit,
					}}
				/>
			</AbsoluteFill>
		);
	}

	if (asset.mode === 'screen') {
		// No fade on the video's first frame: a screen opening the hook cuts in.
		const fade = asset.start > 0 ? interpolate(time, [0, 0.2], [0, 1], {...clamp, easing: easeOut}) : 1;
		const rect = screenRect(asset, theme);
		const style: React.CSSProperties = {
			...frameCss(asset.frame),
			display: 'block',
			position: 'absolute',
			left: rect.x,
			top: rect.y + rect.h / 2,
			width: rect.w,
			height: asset.aspect ? rect.h : undefined,
			maxWidth: 'none',
			transform: `translateY(-50%) ${enter ? '' : `scale(${0.9 + 0.1 * fade}) `}${floatTransform(time)}`,
			opacity: enter ? 1 : fade,
			objectFit: 'cover',
		};
		return (
			<AbsoluteFill style={{backdropFilter: 'blur(30px) brightness(0.5)', opacity: enter ? fade : 1}}>
				<AbsoluteFill style={enterMotion(enter, time, {x: rect.x + rect.w / 2, y: rect.y + rect.h / 2}, size)}>
					{asset.video ? <OffthreadVideo src={src} muted trimBefore={trimFrames} style={style} /> : <Img src={src} style={style} />}
				</AbsoluteFill>
			</AbsoluteFill>
		);
	}

	const cover: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover'};
	const shake = asset.shake ?? 0;
	const move = `translate(${(asset.x ?? frameW / 2) - frameW / 2}px, ${(asset.y ?? frameH / 2) - frameH / 2}px) `;
	return (
		<AbsoluteFill style={{overflow: 'hidden', ...enterMotion(enter, time, {x: frameW / 2, y: frameH / 2}, size)}}>
			<AbsoluteFill style={{backgroundColor: '#000'}} />
			<AbsoluteFill
				style={{transform: `${move}scale(${asset.zoom ?? 1})${shake > 0 ? ` ${shakeTransform(time, shake)}` : ''}`, transformOrigin: 'center bottom'}}
			>
				{asset.video ? <OffthreadVideo src={src} muted trimBefore={trimFrames} style={cover} /> : <Img src={src} style={cover} />}
			</AbsoluteFill>
			{asset.dim ? <AbsoluteFill style={{backgroundColor: `rgba(0,0,0,${asset.dim})`}} /> : null}
		</AbsoluteFill>
	);
};

export const LogoLayer: React.FC<{logo: EdlLogo}> = ({logo}) => {
	const theme = useTheme();
	const url = useVideoUrl();
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();
	const time = frame / fps;
	const total = durationInFrames / fps;
	const {width: frameW, height: frameH} = useVideoConfig();
	const pop = theme.logos.popS;
	// The default entrance is the pop; a slide from an edge replaces it.
	const slide = logo.enter && logo.enter !== 'pop' ? logo.enter : undefined;
	const scale = slide ? 1 : interpolate(time, [0, pop * 0.68, pop], [0, 1.15, 1], {...clamp, easing: easeOut});
	const opacity = interpolate(time, [total - 0.15, total], [1, 0], clamp);
	const rect = logoRect(logo, theme);
	const motion = enterMotion(slide, time, {x: rect.x + rect.w / 2, y: rect.y + rect.h / 2}, {width: frameW, height: frameH});
	const shake = logo.shake ?? 0;
	// Visible area only (the legacy pipeline trimmed transparent margins on a copy).
	const box = logo.alphaBox;
	const k = box ? rect.h / (box[3] - box[1]) : 1;
	return (
		<div
			style={{
				position: 'absolute',
				left: rect.x,
				top: rect.y,
				width: rect.w,
				height: rect.h,
				overflow: 'hidden',
				transform: `${motion.transform === 'none' ? '' : `${motion.transform} `}scale(${scale}) ${shake > 0 ? shakeTransform(time, shake) : floatTransform(time, 1.1)}`,
				opacity,
			}}
		>
			{box && logo.sourceWidth && logo.sourceHeight ? (
				<Img
					src={url(logo.file)}
					style={{position: 'absolute', left: -box[0] * k, top: -box[1] * k, width: logo.sourceWidth * k, height: logo.sourceHeight * k, maxWidth: 'none'}}
				/>
			) : (
				<Img src={url(logo.file)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
			)}
		</div>
	);
};
