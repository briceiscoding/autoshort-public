// Plan data model: the editable source of truth, expressed in RUSH time (seconds in the source file).
// The EDL (output time) is always derived from it, see src/edl/buildEdl.ts.
// The JSON Schema contract in /schema is generated from these zod schemas (npm run gen:schema).
import {z} from 'zod';
import {FrameStylePatchSchema, TextStylePatchSchema} from './theme';

export const SCHEMA_VERSION = 1;

const Id = z.string().min(1);
const Seconds = z.number().min(0);

export const WordSchema = z
	.object({
		id: Id,
		// Caption text, exactly what was said (corrections only, never invented).
		text: z.string().min(1),
		start: Seconds,
		end: Seconds,
		// Alignment confidence from WhisperX (0..1), null when the aligner could not place the word.
		score: z.number().min(0).max(1).nullable().optional(),
		// Text before a manual or vocabulary correction, kept for traceability.
		original: z.string().optional(),
		// This word opens a new caption block.
		blockStart: z.boolean().optional(),
		// Highlighted word (accent background, magnifier).
		highlight: z.boolean().optional(),
	})
	.strict();

export const CutReason = z.enum(['silence', 'hesitation', 'repetition', 'false-start', 'outside', 'manual']);

// Spans partition the rush from 0 to its duration. A cut is a span with keep=false.
export const SpanSchema = z
	.object({
		id: Id,
		start: Seconds,
		end: Seconds,
		keep: z.boolean(),
		zoom: z.boolean().default(false),
		// Plays the zoom SFX when this span starts zoomed.
		zoomSfx: z.boolean().optional(),
		reason: CutReason.optional(),
		note: z.string().optional(),
	})
	.strict();

export const MediaKind = z.enum(['image', 'video', 'audio']);

// Catalog entry, typed at import (never guessed at render time).
export const AssetSchema = z
	.object({
		id: Id,
		// Path relative to the video folder, e.g. "assets/mail.png".
		file: z.string().min(1),
		kind: MediaKind,
		width: z.number().int().positive().optional(),
		height: z.number().int().positive().optional(),
		duration: z.number().positive().optional(),
		hasAlpha: z.boolean().optional(),
		// Visible (non transparent) area of a picture: [x0, y0, x1, y1] in source pixels.
		alphaBox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
	})
	.strict();

const Timed = {
	id: Id,
	start: Seconds,
	end: Seconds,
	// Word id the event was anchored to (informative, the times are authoritative).
	trigger: z.string().optional(),
};

export const ConceptSchema = z
	.object({
		...Timed,
		text: z.string().min(1),
		// Look of this concept only, over the concept text style of the video (font, size, position...).
		style: TextStylePatchSchema.optional(),
	})
	.strict();

export const LogoSchema = z
	.object({
		...Timed,
		asset: Id,
		// Height in px (theme default 180).
		size: z.number().positive().optional(),
		// Centre of the logo in canvas px (theme default x 540, y 420).
		x: z.number().optional(),
		y: z.number().optional(),
		// Background removal applied on a copy at export.
		process: z.enum(['luma_key', 'rembg']).nullable().optional(),
		sfx: z.boolean().optional(),
		// Entrance (absent or pop = the default pop) and trembling strength in px, like pictures.
		enter: z.enum(['pop', 'top', 'bottom', 'left', 'right']).optional(),
		shake: z.number().min(0).optional(),
	})
	.strict();

export const CutInMode = z.enum(['full', 'screen', 'bg']);
// How a picture comes in: absent = the default of its mode (fade, slide up or cut), pop = scales up with a bounce,
// top / bottom / left / right = slides in from that edge of the frame with a bounce.
export const CutInEnter = z.enum(['pop', 'top', 'bottom', 'left', 'right']);

export const CutInSchema = z
	.object({
		...Timed,
		asset: Id,
		mode: CutInMode,
		// Seconds skipped at the start of a video asset.
		trim: z.number().min(0).optional(),
		// Extra scale of a full asset, from its bottom edge.
		zoom: z.number().positive().optional(),
		enter: CutInEnter.optional(),
		// Opacity of the dark veil (0..1).
		dim: z.number().min(0).max(1).optional(),
		// Trembling strength in px; 0 or absent = still.
		shake: z.number().min(0).optional(),
		// Placement override in canvas px: centre and width of a screen or bg card; for a full picture, x / y move its
		// centre (default 540 / 960) and zoom sets its size.
		x: z.number().optional(),
		y: z.number().optional(),
		width: z.number().positive().optional(),
		sfx: z.boolean().optional(),
		// Corners, border and shadow of this picture only (screen and bg modes), over the frame style of the video.
		frame: FrameStylePatchSchema.optional(),
	})
	.strict();

export const GaugeSchema = z
	.object({
		...Timed,
		asset: Id,
		// Crop of the gauge bar in the source picture: [x0, y0, x1, y1].
		box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
		label: z.string(),
		from: z.number().min(0).max(1),
		to: z.number().min(0).max(1),
		// Seconds after the start when the cursor lands.
		landing: z.number().positive(),
		sfx: z.boolean().optional(),
	})
	.strict();

export const DiagramTemplate = z.enum(['tree', 'hub', 'balance', 'forbidden', 'flow', 'comparison', 'custom']);

export const DiagramElementSchema = z
	.object({
		id: Id,
		label: z.string(),
		// Lucide icon name (kebab case) or one of the built-in sketch icons (stick-figure, cinema-camera...).
		icon: z.string().optional(),
		// Asset id of a picture (e.g. folder.png, tinted with the accent).
		image: z.string().optional(),
		accent: z.boolean().optional(),
		strike: z.boolean().optional(),
		check: z.boolean().optional(),
		// Free description kept from the plan proposal.
		kind: z.string().optional(),
		trigger: z.string().optional(),
		// Rush time when the element appears.
		at: Seconds,
		// Drawing duration in seconds.
		draw: z.number().positive().default(0.4),
	})
	.strict();

export const DiagramSchema = z
	.object({
		...Timed,
		template: DiagramTemplate,
		// Escape hatch: name of a hand-written component in projects/<slug>/diagrams/<component>.tsx.
		component: z.string().optional(),
		title: z.string().optional(),
		description: z.string().optional(),
		elements: z.array(DiagramElementSchema).max(8),
		sfx: z.boolean().optional(),
	})
	.strict();

export const SfxSchema = z
	.object({
		id: Id,
		// File name in library/sfx.
		file: z.string().min(1),
		at: Seconds,
		duration: z.number().positive().optional(),
		gain: z.number().positive().optional(),
		reason: z.string().optional(),
	})
	.strict();

export const MusicSchema = z
	.object({
		asset: Id,
		underVoiceDb: z.number().default(22),
	})
	.strict();

export const SubscribeSchema = z
	.object({
		start: Seconds,
		trigger: z.string().optional(),
		scale: z.number().positive(),
		x: z.number(),
		y: z.number(),
		keyColor: z.string(),
	})
	.strict();

export const SfxRulesSchema = z
	.object({
		cutIn: z.string().nullable(),
		logo: z.string().nullable(),
		conceptTyping: z.string().nullable(),
		diagramOpen: z.string().nullable(),
		diagramElement: z.string().nullable(),
		gauge: z.string().nullable(),
		gaugeLanding: z.string().nullable(),
		zoom: z.string().nullable(),
	})
	.partial()
	.strict();

export const SourceSchema = z
	.object({
		rush: z.string().min(1),
		width: z.number().int().positive(),
		height: z.number().int().positive(),
		fps: z.number().positive(),
		duration: z.number().positive(),
		// Window of the source shown on the 9:16 canvas (cover from the full height).
		crop: z
			.object({
				x: z.number(),
				y: z.number(),
				width: z.number().positive(),
				height: z.number().positive(),
			})
			.strict(),
	})
	.strict();

export const PlanSchema = z
	.object({
		schemaVersion: z.literal(SCHEMA_VERSION),
		slug: z.string().min(1),
		title: z.string().optional(),
		source: SourceSchema,
		output: z.object({fps: z.number().positive().optional()}).strict().optional(),
		assets: z.array(AssetSchema),
		words: z.array(WordSchema),
		spans: z.array(SpanSchema).min(1),
		concepts: z.array(ConceptSchema),
		logos: z.array(LogoSchema),
		cutIns: z.array(CutInSchema),
		gauges: z.array(GaugeSchema),
		diagrams: z.array(DiagramSchema),
		sfx: z.array(SfxSchema),
		music: MusicSchema.nullable(),
		subscribe: SubscribeSchema.nullable(),
		sfxRules: SfxRulesSchema.optional(),
		hideCaptionsDuringConcepts: z.boolean().default(true),
		// Partial theme override for this video only (deep merged over theme.json).
		themeOverrides: z.record(z.string(), z.unknown()).optional(),
		unplacedAssets: z.array(z.string()).default([]),
		notes: z.string().optional(),
	})
	.strict();

export type Word = z.infer<typeof WordSchema>;
export type Span = z.infer<typeof SpanSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type Logo = z.infer<typeof LogoSchema>;
export type CutIn = z.infer<typeof CutInSchema>;
export type Gauge = z.infer<typeof GaugeSchema>;
export type Diagram = z.infer<typeof DiagramSchema>;
export type DiagramElement = z.infer<typeof DiagramElementSchema>;
export type SfxEvent = z.infer<typeof SfxSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type PlanInput = z.input<typeof PlanSchema>;

export const parsePlan = (data: unknown): Plan => PlanSchema.parse(data);
