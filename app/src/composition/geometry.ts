// Pure geometry of on-screen elements, shared by the composition and the linter (safe zone, face overlap).
import type {EdlAsset, EdlLogo} from '../edl/types';
import type {TextStyle, Theme} from '../model/theme';

export type Rect = {x: number; y: number; w: number; h: number};

export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const insideRect = (inner: Rect, outer: Rect, tolerance = 0): boolean =>
	inner.x >= outer.x - tolerance &&
	inner.y >= outer.y - tolerance &&
	inner.x + inner.w <= outer.x + outer.w + tolerance &&
	inner.y + inner.h <= outer.y + outer.h + tolerance;

export const safeRect = (theme: Theme): Rect => ({
	x: theme.safeZone.x0,
	y: theme.safeZone.y0,
	w: theme.safeZone.x1 - theme.safeZone.x0,
	h: theme.safeZone.y1 - theme.safeZone.y0,
});

// Displayed size of a logo: `size` is the height of its visible area, width limited to the concept width.
export const logoRect = (logo: Pick<EdlLogo, 'size' | 'x' | 'y' | 'alphaBox' | 'sourceWidth' | 'sourceHeight'>, theme: Theme): Rect => {
	const [bw, bh] = logo.alphaBox
		? [logo.alphaBox[2] - logo.alphaBox[0], logo.alphaBox[3] - logo.alphaBox[1]]
		: [logo.sourceWidth ?? logo.size, logo.sourceHeight ?? logo.size];
	let h = logo.size;
	let w = (h * bw) / bh;
	const maxW = theme.textStyles.concept.maxWidth;
	if (w > maxW) {
		h *= maxW / w;
		w = maxW;
	}
	return {x: logo.x - w / 2, y: logo.y - h / 2, w, h};
};

// Card of a `screen` asset (legacy: fitted in 840 x 930 from the media aspect, left edge on the safe zone).
export const screenRect = (asset: Pick<EdlAsset, 'aspect' | 'x' | 'y' | 'width'>, theme: Theme): Rect => {
	const {maxWidth, maxHeight, left, centerY} = theme.screen;
	const aspect = asset.aspect;
	const w = asset.width ?? (aspect ? Math.min(maxWidth, maxHeight * aspect) : maxWidth);
	const h = aspect ? w / aspect : maxHeight;
	const cx = asset.x ?? left + maxWidth / 2;
	const cy = asset.y ?? centerY;
	return {x: cx - w / 2, y: cy - h / 2, w, h};
};

// Area of a concept text (estimated without a canvas: long texts wrap on two lines), background included.
export const conceptRect = (text: string, style: TextStyle, theme: Theme): Rect => {
	const long = text.length > theme.concepts.longAfterChars;
	const size = long ? style.size * theme.concepts.longScale : style.size;
	const lines = long ? 2 : 1;
	const pad = style.background ? style.background.padY : 0;
	const h = size * style.lineHeight * lines + 2 * pad;
	return {x: style.x - style.maxWidth / 2, y: style.y - h / 2, w: style.maxWidth, h};
};

// Caption area for a block of `lines` lines, background included.
export const captionRect = (lines: number, theme: Theme): Rect => {
	const style = theme.textStyles.caption;
	const pad = style.background ? style.background.padY : 0;
	const h = lines * style.size * style.lineHeight + 2 * pad;
	return {x: style.x - style.maxWidth / 2, y: style.y - h / 2, w: style.maxWidth, h};
};

// Diagram drawing area: templates are laid out inside it by construction.
export const diagramRect = (theme: Theme): Rect => ({
	x: theme.safeZone.x0,
	y: theme.safeZone.y0,
	w: theme.safeZone.x1 - theme.safeZone.x0,
	h: theme.diagrams.maxBottomY - theme.safeZone.y0,
});

// Drag snapping: when the centre of a moved rect comes within `threshold` px of the canvas centre lines, it sticks
// to them. Returns the corrected move and which guide lines to show.
export const snapToCenter = (
	rect: Rect,
	dx: number,
	dy: number,
	canvas: {width: number; height: number},
	threshold: number,
): {dx: number; dy: number; vertical: boolean; horizontal: boolean} => {
	const cx = rect.x + rect.w / 2 + dx;
	const cy = rect.y + rect.h / 2 + dy;
	const vertical = Math.abs(cx - canvas.width / 2) <= threshold;
	const horizontal = Math.abs(cy - canvas.height / 2) <= threshold;
	return {
		dx: vertical ? canvas.width / 2 - (rect.x + rect.w / 2) : dx,
		dy: horizontal ? canvas.height / 2 - (rect.y + rect.h / 2) : dy,
		vertical,
		horizontal,
	};
};
