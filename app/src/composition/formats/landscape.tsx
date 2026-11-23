// YouTube 16:9 layers (1920 x 1080). A different way of editing than the short: its own diagram layouts and gauge
// card, while captions, concepts, logos and cut-ins follow the 16:9 theme (theme/theme.landscape.json).
// Templates not redrawn yet for 16:9 keep their vertical design, centred on a 1080 px wide stage.
import React from 'react';
import {useVideoConfig} from 'remotion';
import type {EdlGauge} from '../../edl/types';
import {useTheme} from '../context';
import {findIcon} from '../diagrams/icons';
import {Arrow, DiagramStageProvider, Float, Icon, Label, Line, SchemaCanvas, StickerBox, stickerFit} from '../diagrams/primitives';
import {TEMPLATES, type TemplateProps} from '../diagrams/templates';
import {CARD_HEIGHT, CARD_WIDTH, GaugeLayer} from '../GaugeLayer';

// Vertical templates are laid out in 1080 x 1920 with their content between y 190 and 1150: that band is fitted
// between the top margin and the bottom of the diagram area (theme diagrams.maxBottomY, above the captions), centred.
const PORTRAIT = {width: 1080, bandTop: 190, bandBottom: 1150};
const STAGE_TOP = 40;

export const staged = (Template: React.FC<TemplateProps>): React.FC<TemplateProps> => {
	const Staged: React.FC<TemplateProps> = (props) => {
		const theme = useTheme();
		const {width} = useVideoConfig();
		const scale = Math.min(1, (theme.diagrams.maxBottomY - STAGE_TOP) / (PORTRAIT.bandBottom - PORTRAIT.bandTop));
		const stage = {
			width: PORTRAIT.width,
			scale,
			dx: (width - PORTRAIT.width * scale) / 2,
			dy: STAGE_TOP - PORTRAIT.bandTop * scale,
		};
		return (
			<DiagramStageProvider value={stage}>
				<Template {...props} />
			</DiagramStageProvider>
		);
	};
	return Staged;
};

/* ---------- flow: steps side by side, left to right, linked by arrows ---------- */

const FLOW_GAP = 80;
const FLOW_MARGIN = 100;

export const LandscapeFlow: React.FC<TemplateProps> = ({elements, id}) => {
	const theme = useTheme();
	const {width, height} = useVideoConfig();
	const n = Math.min(elements.length, 5);
	const w = Math.min(460, (width - 2 * FLOW_MARGIN - (n - 1) * FLOW_GAP) / Math.max(n, 1));
	const h = 170;
	const y = height / 2 - h / 2 - 40;
	const size = n > 3 ? 48 : 58;
	const x0 = (width - (n * w + (n - 1) * FLOW_GAP)) / 2;
	return (
		<SchemaCanvas id={id}>
			{elements.slice(0, n).map((e, i) => {
				const x = x0 + i * (w + FLOW_GAP);
				const icon = findIcon(e.icon);
				const fit = stickerFit({x, y, w, h}, e.label, size, theme.fonts.display.family, {maxW: w, canvasWidth: width});
				return (
					<React.Fragment key={e.id}>
						{i > 0 ? (
							<Arrow from={[x - FLOW_GAP + 14, y + h / 2]} to={[x - 14, y + h / 2]} headSize={24} start={e.start} draw={0.15} seed={811 + i * 10} />
						) : null}
						<Float phase={i * 1.3} cx={x + w / 2} cy={y + h / 2}>
							{icon ? (
								<Icon nodes={icon} x={x + w / 2 - 60} y={y - 160} size={120} start={e.start + e.draw} draw={0.2} seed={818 + i * 10} />
							) : null}
							<StickerBox
								x={fit.x}
								y={y}
								w={fit.w}
								h={h}
								maxW={w}
								label={e.label}
								size={size}
								labelColor={e.accent ? theme.colors.accent : undefined}
								start={e.start + (i > 0 ? 0.15 : 0)}
								draw={e.draw}
								seed={815 + i * 10}
							/>
						</Float>
					</React.Fragment>
				);
			})}
		</SchemaCanvas>
	);
};

/* ---------- comparison: two wide columns; element 0 and 1 are the headers, the rest alternate left / right ---------- */

export const LandscapeComparison: React.FC<TemplateProps> = ({elements, id}) => {
	const theme = useTheme();
	const {width} = useVideoConfig();
	const bottom = theme.diagrams.maxBottomY;
	const [left, right, ...items] = elements;
	const cols = [width * 0.29, width * 0.71];
	const rowsN = Math.ceil(items.length / 2);
	const step = rowsN > 1 ? Math.min(150, (bottom - 60 - 420) / (rowsN - 1)) : 0;
	return (
		<SchemaCanvas id={id}>
			{[left, right].map((head, i) =>
				head ? (
					<Float key={head.id} phase={i * 2} cx={cols[i]} cy={230}>
						<StickerBox x={cols[i] - 260} y={160} w={520} h={140} maxW={760} label={head.label} size={66} labelColor={head.accent ? theme.colors.accent : undefined} start={head.start} draw={head.draw} seed={911 + i * 10} />
					</Float>
				) : null,
			)}
			{left && right ? <Line from={[width / 2, 160]} to={[width / 2, bottom]} start={right.start} draw={0.3} seed={931} /> : null}
			{items.map((e, i) => {
				const col = cols[i % 2];
				const y = 420 + Math.floor(i / 2) * step;
				const icon = e.check ? findIcon('check') : e.strike ? findIcon('x') : findIcon(e.icon);
				const color = e.check ? theme.colors.success : e.strike || e.accent ? theme.colors.accent : undefined;
				return (
					<Float key={e.id} phase={i + 0.5} cx={col} cy={y}>
						{icon ? <Icon nodes={icon} x={col - 300} y={y - 45} size={90} color={color} start={e.start} draw={0.25} seed={941 + i * 10} /> : null}
						<Label x={col - 190} y={y} text={e.label} size={56} anchor="start" start={e.start + 0.2} />
					</Float>
				);
			})}
		</SchemaCanvas>
	);
};

export const LANDSCAPE_TEMPLATES: Record<string, React.FC<TemplateProps>> = {
	...Object.fromEntries(Object.entries(TEMPLATES).map(([name, Template]) => [name, staged(Template)])),
	flow: LandscapeFlow,
	comparison: LandscapeComparison,
};

// Gauge card centred in the 16:9 frame.
export const LandscapeGauge: React.FC<{gauge: EdlGauge}> = ({gauge}) => {
	const {width, height} = useVideoConfig();
	return <GaugeLayer gauge={gauge} cardLeft={(width - CARD_WIDTH) / 2} cardTop={(height - CARD_HEIGHT) / 2} />;
};
