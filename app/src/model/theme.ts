// Visual identity: theme/theme.json, applied by default, overridable per video (plan.themeOverrides).
import {z} from 'zod';

const Color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const Opacity = z.number().min(0).max(1);

// Look of one type of on-screen text (captions, highlighted words, concepts). Edited in the Styles tab: theme.json
// holds the default of every video, plan.themeOverrides.textStyles the version of one video, and a concept can
// override it for itself (plan.concepts[].style).
export const TextStyleSchema = z
	.object({
		// Font file in the library, e.g. "fonts/Poppins-ExtraBold.ttf" (ttf, otf, woff, woff2).
		font: z.string().min(1),
		size: z.number().positive(),
		// Faux bold / italic on top of the font file (choose a Bold file for a real bold).
		bold: z.boolean(),
		italic: z.boolean(),
		uppercase: z.boolean(),
		letterSpacing: z.number(),
		lineHeight: z.number().positive(),
		color: Color,
		// Outline drawn behind the letters (px).
		stroke: z.object({width: z.number().min(0), color: Color}).strict().nullable(),
		shadow: z.object({x: z.number(), y: z.number(), blur: z.number().min(0), color: Color, opacity: Opacity}).strict().nullable(),
		// Box behind the text (captions: the whole block; highlight: the word; concept: the whole text).
		background: z
			.object({
				color: Color,
				opacity: Opacity,
				radius: z.number().min(0),
				padX: z.number().min(0),
				padY: z.number().min(0),
				// Border of the box (px), absent or 0 = none.
				borderWidth: z.number().min(0).optional(),
				borderColor: Color.optional(),
			})
			.strict()
			.nullable(),
		// Quotes drawn around the text: « » (french) or “ ” (english); absent = none.
		quotes: z.enum(['french', 'english']).optional(),
		// Centre of the text on the 1080 x 1920 canvas and its maximum width (unused by the highlight and keyword styles).
		x: z.number(),
		y: z.number(),
		maxWidth: z.number().positive(),
	})
	.strict();

export type TextStyle = z.infer<typeof TextStyleSchema>;

// Look of the pictures and videos added as cut-ins (screen cards, pictures behind the head): rounded corners,
// border and drop shadow. Same layers as text styles: theme.json, plan.themeOverrides.frameStyles, cutIns[].frame.
export const FrameStyleSchema = z
	.object({
		radius: z.number().min(0),
		border: z.object({width: z.number().min(0), color: Color, opacity: Opacity}).strict().nullable(),
		shadow: z.object({x: z.number(), y: z.number(), blur: z.number().min(0), color: Color, opacity: Opacity}).strict().nullable(),
	})
	.strict();

export type FrameStyle = z.infer<typeof FrameStyleSchema>;
export const FrameStylePatchSchema = FrameStyleSchema.partial();
export type FrameStylePatch = z.infer<typeof FrameStylePatchSchema>;
export const FRAME_STYLE_KINDS = ['screen', 'bg'] as const;
export type FrameStyleKind = (typeof FRAME_STYLE_KINDS)[number];
export const TextStylePatchSchema = TextStyleSchema.partial();
export type TextStylePatch = z.infer<typeof TextStylePatchSchema>;
// keyword: the call-to-action word inside the captions (e.g. MONTAGE in « commente MONTAGE »).
export const TEXT_STYLE_KINDS = ['caption', 'highlight', 'concept', 'keyword'] as const;
export type TextStyleKind = (typeof TEXT_STYLE_KINDS)[number];

export const ThemeSchema = z
	.object({
		schemaVersion: z.literal(1),
		format: z
			.object({
				width: z.number().int(),
				height: z.number().int(),
				fps: z.number(),
				// Keep 60 fps when the rush is 60 fps.
				keepSource60: z.boolean(),
				crf: z.number(),
				preset: z.string(),
				audioBitrate: z.string(),
				audioRate: z.number(),
				targetDurationS: z.number(),
			})
			.strict(),
		colors: z
			.object({accent: Color, white: Color, cream: Color, diagramBg: Color, success: Color})
			.strict(),
		// Fonts of the diagrams, gauges and hand-written diagrams (@kit/theme).
		fonts: z
			.object({
				caption: z.object({family: z.string(), file: z.string()}).strict(),
				display: z.object({family: z.string(), file: z.string()}).strict(),
			})
			.strict(),
		textStyles: z.object({caption: TextStyleSchema, highlight: TextStyleSchema, concept: TextStyleSchema, keyword: TextStyleSchema}).strict(),
		frameStyles: z.object({screen: FrameStyleSchema, bg: FrameStyleSchema}).strict(),
		safeZone: z.object({x0: z.number(), x1: z.number(), y0: z.number(), y1: z.number()}).strict(),
		captions: z
			.object({
				wordGap: z.number(),
				minBlockS: z.number(),
				popS: z.number(),
				minWords: z.number(),
				maxWords: z.number(),
				maxLineChars: z.number(),
				// Lines per caption block; a block too wide for them is shrunk to fit (1 = always a single line).
				maxLines: z.number().int().min(1).default(2),
			})
			.strict(),
		highlight: z
			.object({
				blobTimes: z.array(z.number()),
				blobScales: z.array(z.number()),
			})
			.strict(),
		concepts: z
			.object({
				// Texts longer than this are drawn at longScale x the style size.
				longAfterChars: z.number(),
				longScale: z.number().positive(),
				letterS: z.number(),
				fadeS: z.number(),
				minSpacingS: z.number(),
				maxS: z.number(),
			})
			.strict(),
		// Import: false = the rush is already edited, nothing is cut (no silence, hesitation or repetition cuts).
		editing: z.object({autoCuts: z.boolean()}).strict(),
		logos: z.object({size: z.number(), centerX: z.number(), centerY: z.number(), popS: z.number()}).strict(),
		screen: z
			.object({maxWidth: z.number(), maxHeight: z.number(), left: z.number(), centerY: z.number()})
			.strict(),
		diagrams: z
			.object({
				minS: z.number(),
				maxS: z.number(),
				grid: z.number(),
				strokeWidth: z.number(),
				roughness: z.number(),
				maxBottomY: z.number(),
				maxElements: z.number(),
			})
			.strict(),
		zoom: z.object({scale: z.number(), originY: z.number()}).strict(),
		audio: z
			.object({
				voiceLufs: z.number(),
				truePeak: z.number(),
				lra: z.number(),
				sfxUnderVoiceDb: z.number(),
				musicUnderVoiceDb: z.number(),
				previewSfxGain: z.number(),
				previewMusicGain: z.number(),
			})
			.strict(),
		sfx: z
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
			.strict(),
		subscribe: z
			.object({file: z.string(), scale: z.number(), x: z.number(), y: z.number(), keyColor: z.string()})
			.strict(),
		calm: z.object({enabled: z.boolean()}).strict(),
		hesitations: z.array(z.string()),
		callToAction: z.array(z.string()),
	})
	.strict();

export type Theme = z.infer<typeof ThemeSchema>;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export const deepMerge = <T>(base: T, override: unknown): T => {
	if (!isObject(base) || !isObject(override)) return (override === undefined ? base : override) as T;
	const out: Json = {...base};
	for (const [key, value] of Object.entries(override)) {
		out[key] = isObject(value) && isObject(out[key]) ? deepMerge(out[key], value) : value;
	}
	return out as T;
};

export const resolveTheme = (base: Theme, overrides?: Record<string, unknown>): Theme =>
	overrides ? ThemeSchema.parse(deepMerge(base, overrides)) : base;

// The text as drawn: with the quotes of its style around it.
export const withQuotes = (text: string, style: Pick<TextStyle, 'quotes'>): string =>
	style.quotes === 'french' ? `« ${text} »` : style.quotes === 'english' ? `“${text}”` : text;

// Font family name under which a library font file is registered (FontFace), the same in preview and export.
export const fontFamilyOf = (file: string): string => `AS_${file.replace(/[^A-Za-z0-9]/g, '_')}`;

const hexAlpha = (color: string, opacity: number): string =>
	`${color}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}`;

// CSS of a text style (font, colour, outline, shadow). Position, size and background are applied by each layer.
// Every property is explicit: a highlighted word sits inside the caption block and must not inherit its outline.
export const textCss = (style: TextStyle) => ({
	fontFamily: fontFamilyOf(style.font),
	fontWeight: style.bold ? 700 : 400,
	fontStyle: style.italic ? 'italic' : 'normal',
	textTransform: style.uppercase ? ('uppercase' as const) : ('none' as const),
	letterSpacing: `${style.letterSpacing}px`,
	lineHeight: style.lineHeight,
	color: style.color,
	WebkitTextStroke: style.stroke && style.stroke.width > 0 ? `${style.stroke.width * 2}px ${style.stroke.color}` : '0px transparent',
	paintOrder: 'stroke fill' as const,
	textShadow: style.shadow ? `${style.shadow.x}px ${style.shadow.y}px ${style.shadow.blur}px ${hexAlpha(style.shadow.color, style.shadow.opacity)}` : 'none',
});

export const backgroundCss = (style: TextStyle) =>
	style.background
		? {
				backgroundColor: hexAlpha(style.background.color, style.background.opacity),
				borderRadius: style.background.radius,
				padding: `${style.background.padY}px ${style.background.padX}px`,
				...(style.background.borderWidth
					? {border: `${style.background.borderWidth}px solid ${style.background.borderColor ?? '#FFFFFF'}`}
					: {}),
			}
		: {};

// CSS of a picture or video card (the border is drawn inside its size).
export const frameCss = (frame: FrameStyle) => ({
	borderRadius: frame.radius,
	boxSizing: 'border-box' as const,
	border: frame.border && frame.border.width > 0 ? `${frame.border.width}px solid ${hexAlpha(frame.border.color, frame.border.opacity)}` : 'none',
	boxShadow: frame.shadow
		? `${frame.shadow.x}px ${frame.shadow.y}px ${frame.shadow.blur}px ${hexAlpha(frame.shadow.color, frame.shadow.opacity)}`
		: 'none',
});

// Canvas font string to measure a text in this style.
export const canvasFont = (style: TextStyle, size = style.size): string =>
	`${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${size}px ${fontFamilyOf(style.font)}`;

// Every library font a theme needs loaded before rendering.
export const themeFontFiles = (theme: Theme): string[] =>
	[...new Set([theme.fonts.caption.file, theme.fonts.display.file, ...TEXT_STYLE_KINDS.map((k) => theme.textStyles[k].font)])];
