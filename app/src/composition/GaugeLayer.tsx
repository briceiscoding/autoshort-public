// Port of engine/src/GaugeLayer.tsx. The bar is cropped from the source picture with CSS (no prepared copy).
import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Options} from 'roughjs/bin/core';
import type {RoughGenerator} from 'roughjs/bin/generator';
import type {EdlGauge} from '../edl/types';
import {useTheme, useVideoUrl} from './context';
import {Wobble} from './diagrams/primitives';
import {Sketch} from './diagrams/Sketch';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const CARD_LEFT = 90;
const CARD_WIDTH = 840;
const CARD_TOP = 330;
const CARD_HEIGHT = 680;
const BAR_LEFT = 50;
const BAR_TOP = 300;
const BAR_WIDTH = 740;
const BAR_HEIGHT = 87;
const ENTER_S = 0.2;
const CURSOR_DRAW_S = 0.2;
const CURSOR_GAP = 14;
const LABEL_SIZE = 170;
const SHAKE_PX = 5;
const SHAKE_FRAMES = 3;
const CURSOR_PATH = 'M-20 -130 L20 -130 L20 -52 L54 -52 L0 0 L-54 -52 L-20 -52 Z';

const shakeAt = (frame: number): number => Math.sin(Math.floor(frame / SHAKE_FRAMES) * 12.9898) * SHAKE_PX;

export const GaugeLayer: React.FC<{gauge: EdlGauge}> = ({gauge}) => {
	const theme = useTheme();
	const url = useVideoUrl();
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const time = frame / fps;
	const enter = interpolate(time, [0, ENTER_S], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
	const position = interpolate(time, [ENTER_S, gauge.landing], [gauge.from, gauge.to], {...clamp, easing: Easing.out(Easing.back(1.6))});
	const shape = useMemo(() => (g: RoughGenerator, o: Options) => g.path(CURSOR_PATH, o), []);
	const tipX = CARD_LEFT + BAR_LEFT + position * BAR_WIDTH + shakeAt(frame);
	const tipY = CARD_TOP + BAR_TOP - CURSOR_GAP + shakeAt(frame + 7) * 0.6;
	const [x0, y0, x1, y1] = gauge.box;
	const sx = BAR_WIDTH / (x1 - x0);
	const sy = BAR_HEIGHT / (y1 - y0);

	return (
		<AbsoluteFill style={{backdropFilter: 'blur(30px) brightness(0.5)'}}>
			<div
				style={{
					position: 'absolute',
					left: CARD_LEFT,
					top: CARD_TOP,
					width: CARD_WIDTH,
					height: CARD_HEIGHT,
					borderRadius: 24,
					backgroundColor: '#000',
					boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
					transform: `scale(${0.9 + 0.1 * enter})`,
					opacity: enter,
				}}
			>
				<div style={{position: 'absolute', left: BAR_LEFT, top: BAR_TOP, width: BAR_WIDTH, height: BAR_HEIGHT, overflow: 'hidden'}}>
					<Img
						src={url(gauge.file)}
						style={{
							position: 'absolute',
							left: -x0 * sx,
							top: -y0 * sy,
							width: (gauge.sourceWidth ?? x1) * sx,
							height: (gauge.sourceHeight ?? y1) * sy,
							maxWidth: 'none',
						}}
					/>
				</div>
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: BAR_TOP + BAR_HEIGHT + 40,
						textAlign: 'center',
						fontFamily: theme.fonts.display.family,
						fontSize: LABEL_SIZE,
						lineHeight: 1.1,
						color: theme.colors.white,
					}}
				>
					{gauge.label}
				</div>
			</div>
			<svg width={width} height={height} style={{position: 'absolute', opacity: enter}}>
				<Wobble id={`gauge-wobble-${gauge.id}`}>
					<g transform={`translate(${tipX} ${tipY})`}>
						<Sketch shape={shape} start={0} draw={CURSOR_DRAW_S} seed={7} stroke={theme.colors.white} fill={theme.colors.white} />
					</g>
				</Wobble>
			</svg>
		</AbsoluteFill>
	);
};
