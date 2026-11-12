// Port of engine/src/AssetLayer.tsx: full, screen and bg cut-ins, logos.
import React from 'react';
import {AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {EdlAsset, EdlLogo} from '../edl/types';
import {frameCss} from '../model/theme';
import {useTheme, useVideoUrl} from './context';
import {logoRect, screenRect} from './geometry';

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


export const CutInLayer: React.FC<{asset: EdlAsset}> = ({asset}) => {
	const theme = useTheme();
	const url = useVideoUrl();
	const frame = useCurrentFrame();
	const {fps, durationInFrames} = useVideoConfig();
	const time = frame / fps;
	const total = durationInFrames / fps;
	const src = url(asset.file);
	const trimFrames = Math.round((asset.trim ?? 0) * fps);

	if (asset.mode === 'bg') {
		const enter = interpolate(time, [0, 0.25], [0, 1], {...clamp, easing: easeOut});
		const exit = interpolate(time, [total - 0.2, total], [1, 0], clamp);
		const width = asset.width ?? 900;
		return (
			<AbsoluteFill>
				<Img
					src={src}
					style={{
						...frameCss(asset.frame),
						display: 'block',
						position: 'absolute',
						width,
						left: (asset.x ?? 540) - width / 2,
						top: asset.y ?? 650,
						transform: `translateY(calc(-50% + ${(1 - enter) * 40}px))`,
						opacity: enter * exit,
					}}
				/>
			</AbsoluteFill>
		);
	}

	if (asset.mode === 'screen') {
		// No fade on the video's first frame: a screen opening the hook cuts in.
		const enter = asset.start > 0 ? interpolate(time, [0, 0.2], [0, 1], {...clamp, easing: easeOut}) : 1;
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
			transform: `translateY(-50%) scale(${0.9 + 0.1 * enter}) ${floatTransform(time)}`,
			opacity: enter,
			objectFit: 'cover',
		};
		return (
			<AbsoluteFill style={{backdropFilter: 'blur(30px) brightness(0.5)'}}>
				{asset.video ? <OffthreadVideo src={src} muted trimBefore={trimFrames} style={style} /> : <Img src={src} style={style} />}
			</AbsoluteFill>
		);
	}

	const cover: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover'};
	const shake = asset.shake ?? 0;
	return (
		<AbsoluteFill style={{backgroundColor: '#000', overflow: 'hidden'}}>
			<AbsoluteFill style={{transform: `scale(${asset.zoom ?? 1})${shake > 0 ? ` ${shakeTransform(time, shake)}` : ''}`, transformOrigin: 'center bottom'}}>
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
	const pop = theme.logos.popS;
	const scale = interpolate(time, [0, pop * 0.68, pop], [0, 1.15, 1], {...clamp, easing: easeOut});
	const opacity = interpolate(time, [total - 0.15, total], [1, 0], clamp);
	const rect = logoRect(logo, theme);
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
				transform: `scale(${scale}) ${floatTransform(time, 1.1)}`,
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
