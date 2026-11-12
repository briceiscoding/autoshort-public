// Diagram templates: the template owns the layout, the plan only provides the content.
// Times on elements are seconds relative to the diagram's start.
// tree, hub, balance and forbidden are generalised from earlier hand-written diagrams.
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {EdlDiagramElement} from '../../edl/types';
import {useTheme} from '../context';
import {findIcon, type IconNode} from './icons';
import {Arrow, Float, Icon, Label, Line, PathSketch, SchemaCanvas, SchemaImage, StickerBox, stickerFit} from './primitives';

export type TemplateProps = {elements: EdlDiagramElement[]; id: string};

const iconOf = (e: EdlDiagramElement, fallback: string): IconNode[] => findIcon(e.icon) ?? findIcon(fallback) ?? [];

// Vertical rows from `top`, spread so that n rows never pass `bottom` (safe zone and caption room).
const rows = (n: number, top: number, idealStep: number, bottom: number): number[] => {
	const step = n > 1 ? Math.min(idealStep, (bottom - top) / (n - 1)) : 0;
	return Array.from({length: n}, (_, i) => top + i * step);
};

/* ---------- tree: root (folder or box) with children on a trunk, optional accent strike ---------- */

const TREE = {rootSize: 330, rootX: 110, rootY: 190, trunkX: 270, trunkTop: 470, branchEnd: 360, iconSize: 140, labelX: 535, strikeTo: 915};
const BRANCH_S = 0.12;
const CHILD_ICON_S = 0.2;
const STRIKE_S = 0.2;

const TreeChild: React.FC<{element: EdlDiagramElement; y: number; top: number; seed: number; small: boolean}> = ({element, y, top, seed, small}) => {
	const theme = useTheme();
	const iconAt = element.start + BRANCH_S;
	const labelAt = iconAt + CHILD_ICON_S;
	const iconSize = small ? 110 : TREE.iconSize;
	return (
		<>
			<Line from={[TREE.trunkX, top]} to={[TREE.trunkX, y]} start={element.start} draw={BRANCH_S * 0.6} seed={seed} />
			<Line from={[TREE.trunkX, y]} to={[TREE.branchEnd, y]} start={element.start + BRANCH_S * 0.6} draw={BRANCH_S * 0.4} seed={seed + 1} />
			<Float phase={seed} cx={TREE.labelX} cy={y}>
				{element.image ? (
					<SchemaImage src={element.image} x={TREE.branchEnd - 5} y={y - (small ? 65 : 80)} size={small ? 130 : 160} start={iconAt} tint />
				) : (
					<Icon
						nodes={iconOf(element, 'file')}
						x={TREE.branchEnd + 15}
						y={y - iconSize / 2}
						size={iconSize}
						color={element.accent ? theme.colors.accent : undefined}
						start={iconAt}
						draw={CHILD_ICON_S}
						seed={seed + 2}
					/>
				)}
				<Label x={TREE.labelX} y={y} text={element.label} size={small ? 66 : 80} anchor="start" start={labelAt} />
				{element.strike ? (
					<Line
						from={[TREE.branchEnd - 10, y + 6]}
						to={[TREE.strikeTo, y - 10]}
						color={theme.colors.accent}
						start={labelAt + 0.1}
						draw={STRIKE_S}
						seed={seed + 3}
					/>
				) : null}
				{element.check ? (
					<Icon nodes={iconOf({...element, icon: 'check'}, 'check')} x={830} y={y - 50} size={100} color={theme.colors.success} start={labelAt + 0.1} draw={0.2} seed={seed + 4} />
				) : null}
			</Float>
		</>
	);
};

export const TreeTemplate: React.FC<TemplateProps> = ({elements, id}) => {
	const [root, ...children] = elements;
	if (!root) return <SchemaCanvas id={id}>{null}</SchemaCanvas>;
	const ys = rows(children.length, 650, 195, 1100);
	const small = children.length > 3;
	return (
		<SchemaCanvas id={id}>
			<Float phase={0.4} cx={TREE.rootX + TREE.rootSize / 2} cy={TREE.rootY + TREE.rootSize / 2}>
				{root.image ? (
					<>
						<SchemaImage src={root.image} x={TREE.rootX} y={TREE.rootY} size={TREE.rootSize} start={root.start} tint />
						<Label x={TREE.rootX + TREE.rootSize / 2} y={TREE.rootY + 200} text={root.label} size={84} start={root.start + 0.15} />
					</>
				) : (
					<StickerBox x={TREE.rootX} y={280} w={330} h={150} label={root.label} size={78} start={root.start} draw={root.draw} seed={401} />
				)}
			</Float>
			{children.map((child, i) => (
				<TreeChild key={child.id} element={child} y={ys[i]} top={i === 0 ? TREE.trunkTop : ys[i - 1]} seed={411 + i * 10} small={small} />
			))}
		</SchemaCanvas>
	);
};

/* ---------- hub: a sticker box and what it looks at, one accent arrow + icon + label per row ---------- */

const HUB = {box: {x: 330, y: 250, w: 420, h: 150}, trunkX: 170, arrowTo: 255, iconX: 270, iconSize: 140, labelX: 440};
const HUB_ARROW_S = 0.18;
const HUB_ICON_S = 0.25;

const HubRow: React.FC<{element: EdlDiagramElement; y: number; top: number; seed: number}> = ({element, y, top, seed}) => {
	const theme = useTheme();
	return (
		<>
			<Line from={[HUB.trunkX, top]} to={[HUB.trunkX, y]} start={element.start} draw={0.12} seed={seed} />
			<Arrow from={[HUB.trunkX, y]} to={[HUB.arrowTo, y]} headSize={26} start={element.start + 0.12} draw={HUB_ARROW_S} seed={seed + 1} />
			<Float phase={seed} cx={HUB.labelX} cy={y}>
				<Icon
					nodes={iconOf(element, 'circle')}
					x={HUB.iconX}
					y={y - HUB.iconSize / 2}
					size={HUB.iconSize}
					color={element.accent ? theme.colors.accent : undefined}
					start={element.start + 0.12 + HUB_ARROW_S}
					draw={HUB_ICON_S}
					seed={seed + 2}
				/>
				<Label
					x={HUB.labelX}
					y={y}
					text={element.label}
					size={66}
					anchor="start"
					color={element.accent ? theme.colors.accent : undefined}
					start={element.start + 0.3 + HUB_ICON_S}
				/>
			</Float>
		</>
	);
};

export const HubTemplate: React.FC<TemplateProps> = ({elements, id}) => {
	const [hub, ...items] = elements;
	if (!hub) return <SchemaCanvas id={id}>{null}</SchemaCanvas>;
	const midY = HUB.box.y + HUB.box.h / 2;
	const ys = rows(items.length, 575, 215, 1060);
	return (
		<SchemaCanvas id={id}>
			<Float phase={1.3} cx={HUB.box.x + HUB.box.w / 2} cy={midY}>
				<StickerBox {...HUB.box} label={hub.label} size={84} start={hub.start} draw={hub.draw} seed={511} />
			</Float>
			{items.length ? <Line from={[HUB.box.x, midY]} to={[HUB.trunkX, midY]} start={hub.start + hub.draw} draw={0.15} seed={515} /> : null}
			{items.map((item, i) => (
				<HubRow key={item.id} element={item} y={ys[i]} top={i === 0 ? midY : ys[i - 1]} seed={521 + i * 10} />
			))}
		</SchemaCanvas>
	);
};

/* ---------- balance: a hesitant scale, two plates, an optional accent verdict ---------- */

const PIVOT: [number, number] = [540, 400];
const ARM = 280;
const BASE_Y = 930;
const STRING_DROP = 190;
const PLATE_HALF = 95;
const PLATE_DEPTH = 55;

const beamAngle = (t: number): number => 7 * Math.sin(t * 1.9) + 2.5 * Math.sin(t * 4.3 + 0.8);

const Plate: React.FC<{element: EdlDiagramElement; side: -1 | 1; angle: number; seed: number}> = ({element, side, angle, seed}) => {
	const theme = useTheme();
	const rad = (angle * Math.PI) / 180;
	const hx = PIVOT[0] + side * ARM * Math.cos(rad);
	const hy = PIVOT[1] + side * ARM * Math.sin(rad);
	const restX = PIVOT[0] + side * ARM;
	const plateY = PIVOT[1] + STRING_DROP;
	const bowl = `M${restX - PLATE_HALF} ${plateY} Q${restX} ${plateY + PLATE_DEPTH * 2} ${restX + PLATE_HALF} ${plateY} Z`;
	return (
		<g transform={`translate(${hx - restX} ${hy - PIVOT[1]})`}>
			<Line from={[restX, PIVOT[1]]} to={[restX - PLATE_HALF, plateY]} start={element.start} draw={element.draw * 0.25} seed={seed} />
			<Line from={[restX, PIVOT[1]]} to={[restX + PLATE_HALF, plateY]} start={element.start} draw={element.draw * 0.25} seed={seed + 1} />
			<PathSketch d={bowl} fill={theme.colors.diagramBg} start={element.start + element.draw * 0.25} draw={element.draw * 0.75} seed={seed + 2} />
			<Label
				x={restX}
				y={plateY + 150}
				text={element.label}
				size={80}
				color={element.accent ? theme.colors.accent : undefined}
				start={element.start + element.draw}
			/>
		</g>
	);
};

export const BalanceTemplate: React.FC<TemplateProps> = ({elements, id}) => {
	const theme = useTheme();
	const [scale, yes, no, verdict] = elements;
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const angle = beamAngle(frame / fps);
	if (!scale) return <SchemaCanvas id={id}>{null}</SchemaCanvas>;
	return (
		<SchemaCanvas id={id}>
			<Line from={[PIVOT[0], PIVOT[1]]} to={[PIVOT[0], BASE_Y]} start={scale.start} draw={scale.draw * 0.35} seed={711} />
			<Line from={[PIVOT[0] - 150, BASE_Y]} to={[PIVOT[0] + 150, BASE_Y]} start={scale.start + scale.draw * 0.35} draw={scale.draw * 0.25} seed={712} />
			<g transform={`rotate(${angle} ${PIVOT[0]} ${PIVOT[1]})`}>
				<Line from={[PIVOT[0] - ARM, PIVOT[1]]} to={[PIVOT[0] + ARM, PIVOT[1]]} start={scale.start + scale.draw * 0.6} draw={scale.draw * 0.4} seed={713} />
			</g>
			{yes ? <Plate element={yes} side={-1} angle={angle} seed={721} /> : null}
			{no ? <Plate element={no} side={1} angle={angle} seed={731} /> : null}
			{verdict ? (
				<Float phase={2.7} cx={540} cy={1060}>
					<Label x={540} y={1060} text={verdict.label} size={110} color={verdict.accent === false ? undefined : theme.colors.accent} start={verdict.start} />
				</Float>
			) : null}
		</SchemaCanvas>
	);
};

/* ---------- forbidden: a subject, an alert sign, then a big accent cross and its label ---------- */

const FIGURE = {x: 330, y: 270, size: 420};
const CROSS = {left: 360, right: 720, top: 280, bottom: 700};
const ALERT = {x: 735, y: 230, size: 180};

export const ForbiddenTemplate: React.FC<TemplateProps> = ({elements, id}) => {
	const theme = useTheme();
	const [subject, alert, verdict] = elements.length >= 3 ? elements : [elements[0], undefined, elements[1]];
	if (!subject) return <SchemaCanvas id={id}>{null}</SchemaCanvas>;
	return (
		<SchemaCanvas id={id}>
			<Float phase={0.7} cx={540} cy={480}>
				<Icon nodes={iconOf(subject, 'stick-figure')} {...FIGURE} start={subject.start} draw={subject.draw} seed={611} />
			</Float>
			{alert ? (
				<Float phase={2.1} cx={ALERT.x + ALERT.size / 2} cy={ALERT.y + ALERT.size / 2}>
					<Icon nodes={iconOf(alert, 'triangle-alert')} {...ALERT} color={theme.colors.accent} start={alert.start} draw={alert.draw} seed={621} />
				</Float>
			) : null}
			{verdict ? (
				<>
					<Line from={[CROSS.left, CROSS.top]} to={[CROSS.right, CROSS.bottom]} color={theme.colors.accent} strokeWidth={14} start={verdict.start} draw={verdict.draw / 2} seed={631} />
					<Line
						from={[CROSS.right, CROSS.top]}
						to={[CROSS.left, CROSS.bottom]}
						color={theme.colors.accent}
						strokeWidth={14}
						start={verdict.start + verdict.draw / 2}
						draw={verdict.draw / 2}
						seed={641}
					/>
					<Float phase={3.4} cx={540} cy={880}>
						<Label x={540} y={880} text={verdict.label} size={120} color={theme.colors.accent} start={verdict.start + verdict.draw} />
					</Float>
				</>
			) : null}
		</SchemaCanvas>
	);
};

/* ---------- flow: steps stacked top to bottom, linked by arrows ---------- */

// Room for the step icon on the left of a flow box: 36 px margin + 90 px icon + gap.
const FLOW_ICON_SPACE = 140;

export const FlowTemplate: React.FC<TemplateProps> = ({elements, id}) => {
	const theme = useTheme();
	const n = Math.min(elements.length, 5);
	const h = n > 3 ? 120 : 150;
	const ys = rows(n, 260, 240, 1130 - h);
	return (
		<SchemaCanvas id={id}>
			{elements.slice(0, n).map((e, i) => {
				const icon = findIcon(e.icon);
				const x = 190;
				const w = 700;
				return (
					<React.Fragment key={e.id}>
						{i > 0 ? (
							<Arrow from={[540, ys[i - 1] + h + 12]} to={[540, ys[i] - 14]} headSize={26} start={e.start} draw={0.15} seed={811 + i * 10} />
						) : null}
						<Float phase={i * 1.3} cx={540} cy={ys[i] + h / 2}>
							<StickerBox
								x={x}
								y={ys[i]}
								w={w}
								h={h}
								label={e.label}
								iconSpace={icon ? FLOW_ICON_SPACE : 0}
								size={n > 3 ? 56 : 66}
								labelColor={e.accent ? theme.colors.accent : undefined}
								start={e.start + (i > 0 ? 0.15 : 0)}
								draw={e.draw}
								seed={815 + i * 10}
							/>
							{icon ? (
								<Icon
									nodes={icon}
									x={stickerFit({x, y: ys[i], w, h}, e.label, n > 3 ? 56 : 66, theme.fonts.display.family, {iconSpace: FLOW_ICON_SPACE}).x + 36}
									y={ys[i] + (h - 90) / 2}
									size={90}
									start={e.start + e.draw}
									draw={0.2}
									seed={818 + i * 10}
								/>
							) : null}
						</Float>
					</React.Fragment>
				);
			})}
		</SchemaCanvas>
	);
};

/* ---------- comparison: two columns; element 0 and 1 are the headers, the rest alternate left/right ---------- */

export const ComparisonTemplate: React.FC<TemplateProps> = ({elements, id}) => {
	const theme = useTheme();
	const [left, right, ...items] = elements;
	const cols = [300, 780];
	const ys = rows(Math.ceil(items.length / 2), 560, 190, 1080);
	return (
		<SchemaCanvas id={id}>
			{[left, right].map((head, i) =>
				head ? (
					<Float key={head.id} phase={i * 2} cx={cols[i]} cy={340}>
						<StickerBox x={cols[i] - 190} y={270} w={380} h={140} maxW={460} label={head.label} size={66} labelColor={head.accent ? theme.colors.accent : undefined} start={head.start} draw={head.draw} seed={911 + i * 10} />
					</Float>
				) : null,
			)}
			{left && right ? <Line from={[540, 450]} to={[540, 1100]} start={right.start} draw={0.3} seed={931} /> : null}
			{items.map((e, i) => {
				const col = cols[i % 2];
				const y = ys[Math.floor(i / 2)];
				const icon = e.check ? findIcon('check') : e.strike ? findIcon('x') : findIcon(e.icon);
				const color = e.check ? theme.colors.success : e.strike || e.accent ? theme.colors.accent : undefined;
				return (
					<Float key={e.id} phase={i + 0.5} cx={col} cy={y}>
						{icon ? <Icon nodes={icon} x={col - 200} y={y - 45} size={90} color={color} start={e.start} draw={0.25} seed={941 + i * 10} /> : null}
						<Label x={col - 90} y={y} text={e.label} size={56} anchor="start" start={e.start + 0.2} />
					</Float>
				);
			})}
		</SchemaCanvas>
	);
};

export const TEMPLATES: Record<string, React.FC<TemplateProps>> = {
	tree: TreeTemplate,
	hub: HubTemplate,
	balance: BalanceTemplate,
	forbidden: ForbiddenTemplate,
	flow: FlowTemplate,
	comparison: ComparisonTemplate,
};

// Template catalogue for the UI: element roles in order.
export const TEMPLATE_INFO: Record<string, {label: string; roles: string[]; max: number}> = {
	tree: {label: 'Folder tree', roles: ['root', 'child', 'child', 'child', 'child', 'child'], max: 6},
	hub: {label: 'Hub + rows', roles: ['hub', 'row', 'row', 'row', 'row'], max: 5},
	balance: {label: 'Balance', roles: ['scale', 'left plate', 'right plate', 'verdict'], max: 4},
	forbidden: {label: 'Forbidden', roles: ['subject', 'alert', 'verdict'], max: 3},
	flow: {label: 'Flow (steps)', roles: ['step', 'step', 'step', 'step', 'step'], max: 5},
	comparison: {label: 'Comparison', roles: ['left header', 'right header', 'left item', 'right item', 'left item', 'right item'], max: 6},
	custom: {label: 'Custom .tsx (escape hatch)', roles: [], max: 8},
};
