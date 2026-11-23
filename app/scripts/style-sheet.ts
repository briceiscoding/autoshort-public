// Control sheet of the YouTube 16:9 style: a sample 16:9 edit with one moment per element (captions, concept,
// logo, picture cards, diagrams, gauge, subscribe), so the style can be checked next to its references.
// Writes <dir>/data/plan.json and <dir>/data/render/edl.json, and prints the frames to render as JSON.
// Usage: tsx scripts/style-sheet.ts <sheet_dir> <theme.json> <sheet.json>
//   sheet.json: {rush: {file, width, height, fps, duration}, assets: [catalog entries], subscribe: boolean}
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildEdl} from '../src/edl/buildEdl';
import {parsePlan} from '../src/model/plan';
import {ThemeSchema} from '../src/model/theme';

const [dir, themeFile, inputFile] = process.argv.slice(2);
if (!dir || !themeFile || !inputFile) {
	console.error('usage: style-sheet <sheet_dir> <theme.json> <sheet.json>');
	process.exit(2);
}
const theme = ThemeSchema.parse(JSON.parse(readFileSync(themeFile, 'utf-8')));
const input = JSON.parse(readFileSync(inputFile, 'utf-8'));

// Moments of the sheet: [name, start, end]; each still is taken `at` seconds in.
export const MOMENTS = [
	{name: 'captions', start: 0, end: 2, at: 1.3},
	{name: 'concept', start: 2, end: 4.5, at: 4.0},
	{name: 'logo', start: 4.5, end: 6.5, at: 5.8},
	{name: 'screen', start: 6.5, end: 9, at: 8.0},
	{name: 'full', start: 9, end: 11, at: 10.3},
	{name: 'bg', start: 11, end: 13.5, at: 12.8},
	{name: 'diagram-flow', start: 13.5, end: 17.5, at: 17.0},
	{name: 'diagram-comparison', start: 17.5, end: 21.5, at: 21.0},
	{name: 'diagram-tree', start: 21.5, end: 25.5, at: 25.0},
	{name: 'gauge', start: 25.5, end: 28.5, at: 28.0},
	{name: 'subscribe', start: 28.5, end: 31.5, at: 30.5},
] as const;
const DURATION = 32;
const at = (name: string) => MOMENTS.find((m) => m.name === name)!;

// Sample speech: a word every 0.33 s, three words per caption block, one highlighted word per few blocks.
const TEXT = (
	'Voici le style de ta chaîne YouTube avec tes sous-titres tes cartes et tes schémas ' +
	'chaque moment montre un élément du montage pour le comparer à tes références ' +
	'les couleurs les polices et les animations viennent des images que tu as choisies ' +
	'tu peux le corriger en écrivant ce que tu veux changer puis le relancer ici même ' +
	'abonne-toi pour la suite'
).split(' ');
// The text runs again until the end of the sheet, so every moment has its own captions.
const SPOKEN = Array.from({length: Math.floor((DURATION - 0.5) / 0.33)}, (_, i) => TEXT[i % TEXT.length]);
const words = SPOKEN.map((text, i) => ({
	id: `w${i}`,
	text,
	start: Math.round(i * 0.33 * 1000) / 1000,
	end: Math.round((i * 0.33 + 0.3) * 1000) / 1000,
	...(i % 3 === 0 ? {blockStart: true} : {}),
	...(['style', 'cartes', 'polices', 'corriger'].includes(text) ? {highlight: true} : {}),
}));
const wordAt = (t: number) => words.reduce((best, w) => (Math.abs(w.start - t) < Math.abs(best.start - t) ? w : best)).id;

const el = (id: string, label: string, t: number, extra: Record<string, unknown> = {}) => ({id, label, at: t, ...extra});
const has = (id: string) => input.assets.some((a: {id: string}) => a.id === id);
const m = {
	concept: at('concept'),
	logo: at('logo'),
	screen: at('screen'),
	full: at('full'),
	bg: at('bg'),
	flow: at('diagram-flow'),
	comparison: at('diagram-comparison'),
	tree: at('diagram-tree'),
	gauge: at('gauge'),
	subscribe: at('subscribe'),
};

const plan = parsePlan({
	schemaVersion: 1,
	slug: 'style-sheet',
	title: 'YouTube 16:9 style control sheet',
	source: {
		rush: input.rush.file,
		width: input.rush.width,
		height: input.rush.height,
		fps: input.rush.fps,
		duration: input.rush.duration,
		crop: {x: 0, y: 0, width: input.rush.width, height: input.rush.height},
	},
	output: {format: 'landscape'},
	assets: input.assets,
	words,
	spans: [{id: 's0', start: 0, end: Math.max(DURATION, input.rush.duration), keep: true}],
	concepts: [{id: 'c0', start: m.concept.start, end: m.concept.end, text: 'Idée clé', trigger: wordAt(m.concept.start)}],
	logos: has('sheet_logo') ? [{id: 'l0', asset: 'sheet_logo', start: m.logo.start, end: m.logo.end}] : [],
	cutIns: [
		...(has('sheet_screen') ? [{id: 'a0', asset: 'sheet_screen', mode: 'screen', start: m.screen.start, end: m.screen.end}] : []),
		...(has('sheet_full') ? [{id: 'a1', asset: 'sheet_full', mode: 'full', start: m.full.start, end: m.full.end}] : []),
		...(has('sheet_photo') ? [{id: 'a2', asset: 'sheet_photo', mode: 'bg', start: m.bg.start, end: m.bg.end}] : []),
	],
	gauges: has('sheet_gauge')
		? [{id: 'g0', asset: 'sheet_gauge', start: m.gauge.start, end: m.gauge.end, box: [0, 0, 1000, 160], label: 'Niveau', from: 0.15, to: 0.8, landing: 1.2}]
		: [],
	diagrams: [
		{
			id: 'd0',
			template: 'flow',
			start: m.flow.start,
			end: m.flow.end,
			elements: [el('e0', 'Idée', m.flow.start, {icon: 'lightbulb'}), el('e1', 'Script', m.flow.start + 0.6), el('e2', 'Tournage', m.flow.start + 1.2, {accent: true}), el('e3', 'Montage', m.flow.start + 1.8)],
		},
		{
			id: 'd1',
			template: 'comparison',
			start: m.comparison.start,
			end: m.comparison.end,
			elements: [
				el('e0', 'Avant', m.comparison.start),
				el('e1', 'Après', m.comparison.start + 0.3, {accent: true}),
				el('e2', 'Des heures', m.comparison.start + 0.8, {strike: true}),
				el('e3', 'Dix minutes', m.comparison.start + 1.0, {check: true}),
			],
		},
		{
			id: 'd2',
			template: 'tree',
			start: m.tree.start,
			end: m.tree.end,
			elements: [el('e0', 'Projet', m.tree.start), el('e1', 'Rush', m.tree.start + 0.6), el('e2', 'Images', m.tree.start + 1.0), el('e3', 'Exports', m.tree.start + 1.4)],
		},
	],
	sfx: [],
	music: null,
	subscribe: input.subscribe
		? {start: m.subscribe.start, scale: theme.subscribe.scale, x: theme.subscribe.x, y: theme.subscribe.y, keyColor: theme.subscribe.keyColor}
		: null,
	hideCaptionsDuringConcepts: true,
	unplacedAssets: [],
});

const edl = buildEdl(plan, theme);
mkdirSync(join(dir, 'data', 'render'), {recursive: true});
writeFileSync(join(dir, 'data', 'plan.json'), JSON.stringify(plan, null, 1));
writeFileSync(join(dir, 'data', 'render', 'edl.json'), JSON.stringify(edl, null, 1));
const moments = MOMENTS.filter((mo) => mo.name !== 'subscribe' || input.subscribe).map((mo) => ({name: mo.name, frame: Math.round(mo.at * edl.fps)}));
console.log(`SHEET ${JSON.stringify(moments)}`);
