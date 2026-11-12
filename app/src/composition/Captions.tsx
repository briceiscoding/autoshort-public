// Port of engine/src/Captions.tsx: word pop, highlighted word magnifier, hidden during concepts.
// Look and position come from theme.textStyles.caption / .highlight (Styles tab).
import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {EdlCaptionBlock, EdlCaptionWord, EdlConcept} from '../edl/types';
import {backgroundCss, canvasFont, textCss, type TextStyle, type Theme, withQuotes} from '../model/theme';
import {useTheme} from './context';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const easeOut = Easing.out(Easing.cubic);

let measureContext: CanvasRenderingContext2D | null = null;

export const measureText = (text: string, font: string): number => {
	measureContext ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
	if (!measureContext) return text.length * 40;
	measureContext.font = font;
	return measureContext.measureText(text).width;
};

// Width of a text drawn in a style (case, letter spacing and size included), without its background.
export const measureStyled = (text: string, style: TextStyle, size = style.size): number => {
	const shown = style.uppercase ? text.toUpperCase() : text;
	return measureText(shown, canvasFont(style, size)) + style.letterSpacing * shown.length;
};

// A call-to-action word has its own style (quotes included), above the highlight style.
const wordStyle = (word: EdlCaptionWord, theme: Theme): TextStyle =>
	word.keyword ? theme.textStyles.keyword : word.highlight ? theme.textStyles.highlight : theme.textStyles.caption;
const styled = (word: EdlCaptionWord) => word.keyword || word.highlight;
export const wordText = (word: EdlCaptionWord, theme: Theme): string => (word.keyword ? withQuotes(word.text, theme.textStyles.keyword) : word.text);

const wordWidth = (word: EdlCaptionWord, theme: Theme): number => {
	const style = wordStyle(word, theme);
	return measureStyled(wordText(word, theme), style) + (styled(word) && style.background ? 2 * style.background.padX : 0);
};

// Lines are fixed from the resting widths, so a swelling word never makes the text re-wrap.
export const splitLines = (words: EdlCaptionWord[], theme: Theme): EdlCaptionWord[][] => {
	const lines: EdlCaptionWord[][] = [];
	const {maxWidth} = theme.textStyles.caption;
	let lineWidth = 0;
	for (const word of words) {
		const width = wordWidth(word, theme);
		if (lines.length > 0 && lineWidth + theme.captions.wordGap + width <= maxWidth) {
			lines[lines.length - 1].push(word);
			lineWidth += theme.captions.wordGap + width;
		} else {
			lines.push([word]);
			lineWidth = width;
		}
	}
	return lines;
};

// Extra width a highlighted word takes at the peak of its magnifier (it pushes its neighbours).
const swellWidth = (words: EdlCaptionWord[], theme: Theme): number => {
	const peak = Math.max(1, ...theme.highlight.blobScales);
	return Math.max(0, ...words.filter((w) => w.highlight).map((w) => (peak - 1) * wordWidth(w, theme)));
};

// Lines of a block and the scale that keeps it within captions.maxLines lines: with maxLines 1 the block always
// stays on one line, shrunk when it would not fit (the magnifier swell included).
export const layoutBlock = (words: EdlCaptionWord[], theme: Theme): {lines: EdlCaptionWord[][]; scale: number} => {
	const maxLines = theme.captions.maxLines ?? 2;
	if (maxLines > 1) {
		const lines = splitLines(words, theme);
		if (lines.length <= maxLines) return {lines, scale: 1};
	}
	const {maxWidth} = theme.textStyles.caption;
	if (maxLines === 1) {
		const width = words.reduce((sum, w, i) => sum + wordWidth(w, theme) + (i ? theme.captions.wordGap : 0), 0) + swellWidth(words, theme);
		return {lines: [words], scale: Math.min(1, maxWidth / Math.max(width, 1))};
	}
	// Several lines allowed but not enough: shrink until the block wraps on maxLines lines.
	let scale = 1;
	let lines = splitLines(words, theme);
	while (lines.length > maxLines && scale > 0.4) {
		scale -= 0.05;
		lines = splitLines(words, {...theme, textStyles: {...theme.textStyles, caption: {...theme.textStyles.caption, maxWidth: maxWidth / scale}}});
	}
	return {lines, scale};
};

const Word: React.FC<{word: EdlCaptionWord; time: number; theme: Theme}> = ({word, time, theme}) => {
	const t = time - word.start;
	const opacity = interpolate(t, [0, 0.05], [0, 1], clamp);
	const pop = theme.captions.popS;
	if (!word.highlight) {
		const scale = interpolate(t, [0, pop * 0.6, pop], [0.7, 1.1, 1], {...clamp, easing: easeOut});
		if (word.keyword) {
			const style = theme.textStyles.keyword;
			return (
				<span style={{display: 'inline-block', ...textCss(style), fontSize: style.size, ...backgroundCss(style), opacity, transform: `scale(${scale})`}}>
					{wordText(word, theme)}
				</span>
			);
		}
		return <span style={{display: 'inline-block', opacity, transform: `scale(${scale})`}}>{word.text}</span>;
	}
	// Magnifier "blob": the word swells smoothly and pushes its neighbours, then settles back.
	const style = wordStyle(word, theme);
	const {blobTimes, blobScales} = theme.highlight;
	const blob = interpolate(t, blobTimes, blobScales, {...clamp, easing: Easing.inOut(Easing.sin)});
	const push = (Math.max(blob - 1, 0) * wordWidth(word, theme)) / 2;
	return (
		<span
			style={{
				display: 'inline-block',
				margin: `0 ${push}px`,
				...textCss(style),
				fontSize: style.size,
				...backgroundCss(style),
				opacity,
				transform: `scale(${blob})`,
			}}
		>
			{wordText(word, theme)}
		</span>
	);
};

export const activeBlock = (blocks: EdlCaptionBlock[], time: number, hiddenDuring: EdlConcept[], fadeS: number): EdlCaptionBlock | null => {
	if (hiddenDuring.some((c) => time >= c.start && time < c.end - fadeS)) return null;
	return blocks.find((b) => time >= b.start && time < b.end) ?? null;
};

export const Captions: React.FC<{blocks: EdlCaptionBlock[]; hiddenDuring?: EdlConcept[]}> = ({blocks, hiddenDuring = []}) => {
	const theme = useTheme();
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const time = frame / fps;
	const block = activeBlock(blocks, time, hiddenDuring, theme.concepts.fadeS);
	if (!block) return null;
	const style = theme.textStyles.caption;
	const {lines, scale} = layoutBlock(block.words, theme);
	return (
		<div
			style={{
				position: 'absolute',
				left: style.x - style.maxWidth / 2,
				top: style.y,
				width: style.maxWidth,
				transform: 'translateY(-50%)',
				display: 'flex',
				justifyContent: 'center',
			}}
		>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					rowGap: 4,
					...textCss(style),
					fontSize: style.size,
					textAlign: 'center',
					...backgroundCss(style),
					transform: scale < 1 ? `scale(${scale})` : undefined,
					transformOrigin: 'center',
				}}
			>
				{lines.map((line) => (
					<div key={line[0].start} style={{display: 'flex', justifyContent: 'center', alignItems: 'center', columnGap: theme.captions.wordGap, whiteSpace: 'nowrap'}}>
						{line.map((word) => (
							<Word key={`${word.id}`} word={word} time={time} theme={theme} />
						))}
					</div>
				))}
			</div>
		</div>
	);
};
