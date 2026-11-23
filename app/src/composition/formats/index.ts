// Composition layers of each output format. The short (9:16) and the YouTube video (16:9) are two ways of editing:
// each format picks its own component for every kind of on-screen element, so a format can get its own visuals,
// placements and animations without touching the other. Positions and sizes come from the format's theme.
import type React from 'react';
import type {EdlAsset, EdlGauge, EdlLogo, EdlOverlay} from '../../edl/types';
import {CutInLayer, LogoLayer, SubscribeLayer} from '../AssetLayer';
import {Captions} from '../Captions';
import {ConceptText} from '../ConceptText';
import {TEMPLATES, type TemplateProps} from '../diagrams/templates';
import {GaugeLayer} from '../GaugeLayer';
import {LANDSCAPE_TEMPLATES, LandscapeGauge} from './landscape';
import {withStyle} from './style';

export type FormatId = 'short' | 'landscape';

export type FormatLayers = {
	CutIn: React.FC<{asset: EdlAsset}>;
	Logo: React.FC<{logo: EdlLogo}>;
	Concept: typeof ConceptText;
	Captions: typeof Captions;
	Gauge: React.FC<{gauge: EdlGauge}>;
	Subscribe: React.FC<{overlay: EdlOverlay; src: string}>;
	// Diagram templates by name (the plan's diagrams[].template).
	diagrams: Record<string, React.FC<TemplateProps>>;
};

export const FORMAT_LAYERS: Record<FormatId, FormatLayers> = {
	short: {CutIn: CutInLayer, Logo: LogoLayer, Concept: ConceptText, Captions, Gauge: GaugeLayer, Subscribe: SubscribeLayer, diagrams: TEMPLATES},
	landscape: {
		CutIn: CutInLayer,
		Logo: LogoLayer,
		Concept: ConceptText,
		Captions,
		Gauge: LandscapeGauge,
		Subscribe: SubscribeLayer,
		diagrams: LANDSCAPE_TEMPLATES,
	},
};

// The 16:9 layers include the YouTube style made from the author's references (formats/style.ts), when there is one.
export const layersOf = (format?: string): FormatLayers =>
	format === 'landscape' ? withStyle(FORMAT_LAYERS.landscape) : FORMAT_LAYERS.short;
