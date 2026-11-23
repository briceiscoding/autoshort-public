// @kit/format: what a YouTube 16:9 style component (theme/landscape/components/*.tsx) may use.
// One file per slot, its component as `export default`, with the props of that slot (StyleProps below).
// Everything is drawn on a 1920 x 1080 canvas; animations depend only on useCurrentFrame() (deterministic export).
// Read the theme with useTheme(): it is the 16:9 theme (theme.json + theme.landscape.json + the video's overrides).
import type React from 'react';
import type {EdlAsset, EdlCaptionBlock, EdlCaptionWord, EdlConcept, EdlDiagramElement, EdlGauge, EdlLogo, EdlOverlay} from '../../edl/types';
import type {TextStyle, Theme} from '../../model/theme';

export type {EdlAsset, EdlCaptionBlock, EdlCaptionWord, EdlConcept, EdlDiagramElement, EdlGauge, EdlLogo, EdlOverlay, TextStyle, Theme};
export type {TemplateProps} from '../diagrams/templates';

// Props of each slot. Times are seconds from the start of the element (its Sequence) except for captions, which
// get the whole video's blocks in output time.
export type StyleProps = {
	Captions: {blocks: EdlCaptionBlock[]; hiddenDuring?: EdlConcept[]};
	Concept: {text: string; duration: number; style: TextStyle};
	Logo: {logo: EdlLogo};
	// asset.mode: "screen" (card over a blurred frame), "bg" (card behind the speaker, cut out over it), "full".
	CutIn: {asset: EdlAsset};
	Gauge: {gauge: EdlGauge};
	// src: the keyed subscribe clip (1080 x 1920 with alpha), placed with subscribeRect(overlay).
	Subscribe: {overlay: EdlOverlay; src: string};
	// Diagram_<template>.tsx: {elements, id}, element times relative to the diagram start.
	Diagram: {elements: EdlDiagramElement[]; id: string};
};
export type StyleComponent<K extends keyof StyleProps> = React.FC<StyleProps[K]>;

// Context and media.
export {useTheme, useVideoUrl, useLibraryUrl} from '../context';
// Theme helpers: CSS of a text style, of its background box, of a picture frame; font family of a library font file.
export {textCss, backgroundCss, frameCss, fontFamilyOf, withQuotes, canvasFont} from '../../model/theme';
// Geometry of the default layout (rects in canvas px), to reuse or ignore.
export {bgRect, captionRect, conceptRect, fullRect, logoRect, safeRect, screenRect, subscribeRect, type Rect} from '../geometry';
// Captions: the block on screen, its lines, text measures, the shown text of a word (quotes of a keyword).
export {activeBlock, layoutBlock, measureStyled, measureText, splitLines, wordText} from '../Captions';
export {conceptSize} from '../ConceptText';
// The default 16:9 components: wrap or reuse them for what the style does not change.
export {CutInLayer as DefaultCutIn, LogoLayer as DefaultLogo, SubscribeLayer as DefaultSubscribe} from '../AssetLayer';
export {Captions as DefaultCaptions} from '../Captions';
export {ConceptText as DefaultConcept} from '../ConceptText';
export {LandscapeGauge as DefaultGauge, LANDSCAPE_TEMPLATES as DefaultDiagrams} from '../formats/landscape';
// Hand-drawn diagram primitives (rough.js), as in @kit/schema.
export {Arrow, Float, Frame, Icon, Label, Line, PathSketch, SchemaCanvas, SchemaImage, StickerBox, Wobble} from '../diagrams/primitives';
export {ICONS, findIcon} from '../diagrams/icons';
export {Sketch} from '../diagrams/Sketch';
