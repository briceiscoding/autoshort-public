// Port of engine/src/ConceptText.tsx: typewriter with blinking cursor. Look and position: theme.textStyles.concept,
// overridden per concept (plan.concepts[].style), resolved in the EDL.
import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {backgroundCss, textCss, type TextStyle} from '../model/theme';
import {useTheme} from './context';

const CURSOR_LINGER_S = 0.2;
const CURSOR_BLINK_S = 0.3;

// Font size of a concept: long texts are drawn smaller (theme.concepts.longAfterChars / longScale).
export const conceptSize = (text: string, style: TextStyle, longAfterChars: number, longScale: number): number =>
	text.length > longAfterChars ? Math.round(style.size * longScale) : style.size;

export const ConceptText: React.FC<{text: string; duration: number; style: TextStyle}> = ({text, duration, style}) => {
	const theme = useTheme();
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const time = frame / fps;
	const {letterS, fadeS, longAfterChars, longScale} = theme.concepts;

	const typed = Math.min(text.length, Math.floor(time / letterS) + 1);
	const typingEnd = text.length * letterS;
	const showCursor = time < typingEnd + CURSOR_LINGER_S && Math.floor(time / CURSOR_BLINK_S) % 2 === 0;
	const opacity = interpolate(time, [duration - fadeS, duration], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

	// Words stay unbreakable and untyped letters keep their space, so nothing reflows.
	let letterIndex = 0;
	const words = text.split(' ').map((word, wordIndex, all) => {
		const letters = word.split('').map((letter) => {
			const index = letterIndex++;
			return (
				<React.Fragment key={index}>
					<span style={{opacity: index < typed ? 1 : 0}}>{letter}</span>
					{index === typed - 1 && showCursor ? (
						<span style={{display: 'inline-block', width: 0, position: 'relative'}}>
							<span style={{position: 'absolute', left: 4, bottom: '-0.45em', width: 6, height: '0.9em', backgroundColor: style.color}} />
						</span>
					) : null}
				</React.Fragment>
			);
		});
		if (wordIndex < all.length - 1) letterIndex++;
		return (
			<span key={wordIndex} style={{display: 'inline-block', whiteSpace: 'pre'}}>
				{letters}
			</span>
		);
	});

	return (
		<div
			style={{
				position: 'absolute',
				left: style.x - style.maxWidth / 2,
				width: style.maxWidth,
				top: style.y,
				transform: 'translateY(-50%)',
				display: 'flex',
				justifyContent: 'center',
				opacity,
			}}
		>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					justifyContent: 'center',
					columnGap: '0.28em',
					...textCss(style),
					fontSize: conceptSize(text, style, longAfterChars, longScale),
					textAlign: 'center',
					...backgroundCss(style),
				}}
			>
				{words}
			</div>
		</div>
	);
};
