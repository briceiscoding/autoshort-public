// Styles tab: the look of each type of text (captions, highlighted words, concepts) for this video, saved as the
// default of every video on demand, plus the fonts of the library (upload a file or import a Google Fonts family).
// One concept can also get its own look (Inspector), then hand it to every concept ("apply to all").
import React, {useEffect, useState} from 'react';
import type {Concept, CutIn, Plan} from '../model/plan';
import {fontFamilyOf, type FrameStyle, type FrameStyleKind, type FrameStylePatch, type TextStyle, type TextStyleKind, type TextStylePatch} from '../model/theme';
import {api} from './api';
import {useDerived} from './context';
import {editor, useEditor} from './editorStore';
import * as ops from './ops';
import {HelpLink} from './Help';

const apply = editor.apply.bind(editor);

type Target = TextStyleKind | FrameStyleKind;
const isFrame = (t: Target): t is FrameStyleKind => t === 'screen' || t === 'bg';

const LABELS: Record<Target, {title: string; hint: string}> = {
	caption: {title: 'Captions', hint: 'Every caption block. Drag the block on the preview to move all captions.'},
	highlight: {title: 'Highlighted words', hint: 'Important words inside the captions: their background box, its corners and border (Transcript tab: select a word, Highlight).'},
	concept: {title: 'Concepts', hint: 'Big words at the top. Drag one on the preview to move every concept.'},
	screen: {title: 'Screen pictures', hint: 'Pictures and videos in "screen" mode (card over the blurred video): corners, border, shadow.'},
	bg: {title: 'Behind-head pictures', hint: 'Pictures in "bg" mode (behind your head): corners, border, shadow.'},
};

/* ---------------- fonts ---------------- */

let fontCache: string[] | null = null;
const fontListeners = new Set<(fonts: string[]) => void>();

const refreshFonts = async () => {
	fontCache = await api.fonts();
	fontListeners.forEach((l) => l(fontCache!));
};

const useFonts = (): string[] => {
	const [fonts, setFonts] = useState<string[]>(fontCache ?? []);
	useEffect(() => {
		fontListeners.add(setFonts);
		if (!fontCache) refreshFonts().catch(() => {});
		return () => {
			fontListeners.delete(setFonts);
		};
	}, []);
	return fonts;
};

// Loads a library font in the editor page, for the sample next to the font list.
const loadedSamples = new Set<string>();
const useFontSample = (file: string) => {
	useEffect(() => {
		if (loadedSamples.has(file)) return;
		loadedSamples.add(file);
		new FontFace(fontFamilyOf(file), `url('/library/${file.split('/').map(encodeURIComponent).join('/')}')`)
			.load()
			.then((face) => document.fonts.add(face))
			.catch(() => loadedSamples.delete(file));
	}, [file]);
};

const fontLabel = (file: string) => file.replace(/^fonts\//, '').replace(/\.(ttf|otf|woff2?)$/i, '');

export const FontPicker: React.FC<{value: string; onChange: (file: string) => void}> = ({value, onChange}) => {
	const fonts = useFonts();
	const [google, setGoogle] = useState('');
	const [busy, setBusy] = useState('');
	const [error, setError] = useState('');
	useFontSample(value);

	const run = async (label: string, job: () => Promise<string[]>) => {
		setBusy(label);
		setError('');
		try {
			const added = await job();
			await refreshFonts();
			if (added[0]) onChange(added.find((f) => /Regular|Bold/.test(f)) ?? added[0]);
		} catch (e) {
			setError(String(e instanceof Error ? e.message : e));
		} finally {
			setBusy('');
		}
	};

	return (
		<div className="font-picker">
			<label className="field">
				<span>Font</span>
				<select value={value} onChange={(e) => onChange(e.target.value)}>
					{!fonts.includes(value) ? <option value={value}>{fontLabel(value)}</option> : null}
					{fonts.map((f) => (
						<option key={f} value={f}>
							{fontLabel(f)}
						</option>
					))}
				</select>
			</label>
			<div className="font-sample" style={{fontFamily: fontFamilyOf(value)}}>
				Aa Bb Éé 123 — Sous-titre
			</div>
			<div className="row">
				<input
					className="grow"
					value={google}
					placeholder="Google Fonts family, e.g. Bebas Neue"
					onChange={(e) => setGoogle(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && google.trim() && run('google', async () => (await api.importGoogleFont(google)).files)}
				/>
				<button className="small" disabled={!google.trim() || Boolean(busy)} onClick={() => run('google', async () => (await api.importGoogleFont(google)).files)}>
					{busy === 'google' ? 'Importing…' : 'Import'}
				</button>
				<label className="button small">
					{busy === 'file' ? 'Adding…' : 'Add a font file'}
					<input
						type="file"
						accept=".ttf,.otf,.woff,.woff2"
						multiple
						hidden
						onChange={(e) => {
							const files = [...(e.target.files ?? [])];
							e.target.value = '';
							if (files.length) run('file', async () => Promise.all(files.map(async (f) => (await api.uploadFont(f)).file)));
						}}
					/>
				</label>
			</div>
			{error ? <p className="error small">{error}</p> : null}
			<p className="muted small">Fonts go to library/fonts and are available in every video. Pick a Bold file for a real bold.</p>
		</div>
	);
};

/* ---------------- style editor ---------------- */

const Slider: React.FC<{label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void}> = ({
	label,
	value,
	min,
	max,
	step = 1,
	unit = '',
	onChange,
}) => (
	<label className="field slider">
		<span>
			{label}
			<input type="number" className="num" value={value} step={step} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} />
			{unit}
		</span>
		<input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
	</label>
);

const ColorField: React.FC<{label: string; value: string; onChange: (v: string) => void}> = ({label, value, onChange}) => (
	<label className="field color">
		<span>{label}</span>
		<input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
	</label>
);

const Toggle: React.FC<{label: string; value: boolean; onChange: (v: boolean) => void}> = ({label, value, onChange}) => (
	<label className="check">
		<input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}
	</label>
);

const DEFAULT_STROKE = {width: 4, color: '#000000'};
const DEFAULT_SHADOW = {x: 0, y: 6, blur: 14, color: '#000000', opacity: 0.5};
const DEFAULT_BACKGROUND = {color: '#FF0855', opacity: 1, radius: 14, padX: 14, padY: 6};
const DEFAULT_BORDER = {width: 6, color: '#FFFFFF', opacity: 1};

export const StyleEditor: React.FC<{style: TextStyle; onChange: (patch: TextStylePatch) => void; position?: boolean}> = ({style, onChange, position = true}) => {
	const {stroke, shadow, background} = style;
	return (
		<div className="style-editor">
			<FontPicker value={style.font} onChange={(font) => onChange({font})} />
			<Slider label="Size" value={style.size} min={20} max={300} unit="px" onChange={(size) => onChange({size})} />
			<div className="row">
				<Toggle label="Bold" value={style.bold} onChange={(bold) => onChange({bold})} />
				<Toggle label="Italic" value={style.italic} onChange={(italic) => onChange({italic})} />
				<Toggle label="UPPERCASE" value={style.uppercase} onChange={(uppercase) => onChange({uppercase})} />
				<ColorField label="Colour" value={style.color} onChange={(color) => onChange({color})} />
			</div>
			<div className="row">
				<Slider label="Letter spacing" value={style.letterSpacing} min={-10} max={40} unit="px" onChange={(letterSpacing) => onChange({letterSpacing})} />
				<Slider label="Line height" value={style.lineHeight} min={0.7} max={2} step={0.05} onChange={(lineHeight) => onChange({lineHeight})} />
			</div>

			<fieldset>
				<legend>
					<Toggle label="Outline" value={Boolean(stroke)} onChange={(on) => onChange({stroke: on ? DEFAULT_STROKE : null})} />
				</legend>
				{stroke ? (
					<div className="row">
						<Slider label="Width" value={stroke.width} min={0} max={30} unit="px" onChange={(width) => onChange({stroke: {...stroke, width}})} />
						<ColorField label="Colour" value={stroke.color} onChange={(color) => onChange({stroke: {...stroke, color}})} />
					</div>
				) : null}
			</fieldset>

			<fieldset>
				<legend>
					<Toggle label="Shadow" value={Boolean(shadow)} onChange={(on) => onChange({shadow: on ? DEFAULT_SHADOW : null})} />
				</legend>
				{shadow ? (
					<>
						<div className="row">
							<Slider label="X" value={shadow.x} min={-40} max={40} unit="px" onChange={(x) => onChange({shadow: {...shadow, x}})} />
							<Slider label="Y" value={shadow.y} min={-40} max={40} unit="px" onChange={(y) => onChange({shadow: {...shadow, y}})} />
						</div>
						<div className="row">
							<Slider label="Blur" value={shadow.blur} min={0} max={80} unit="px" onChange={(blur) => onChange({shadow: {...shadow, blur}})} />
							<Slider label="Opacity" value={shadow.opacity} min={0} max={1} step={0.05} onChange={(opacity) => onChange({shadow: {...shadow, opacity}})} />
							<ColorField label="Colour" value={shadow.color} onChange={(color) => onChange({shadow: {...shadow, color}})} />
						</div>
					</>
				) : null}
			</fieldset>

			<fieldset>
				<legend>
					<Toggle label="Background box" value={Boolean(background)} onChange={(on) => onChange({background: on ? DEFAULT_BACKGROUND : null})} />
				</legend>
				{background ? (
					<>
						<div className="row">
							<ColorField label="Colour" value={background.color} onChange={(color) => onChange({background: {...background, color}})} />
							<Slider label="Opacity" value={background.opacity} min={0} max={1} step={0.05} onChange={(opacity) => onChange({background: {...background, opacity}})} />
							<Slider label="Corners" value={background.radius} min={0} max={80} unit="px" onChange={(radius) => onChange({background: {...background, radius}})} />
						</div>
						<div className="row">
							<Slider label="Padding x" value={background.padX} min={0} max={80} unit="px" onChange={(padX) => onChange({background: {...background, padX}})} />
							<Slider label="Padding y" value={background.padY} min={0} max={60} unit="px" onChange={(padY) => onChange({background: {...background, padY}})} />
						</div>
						<div className="row">
							<Slider
								label="Border"
								value={background.borderWidth ?? 0}
								min={0}
								max={20}
								unit="px"
								onChange={(borderWidth) => onChange({background: {...background, borderWidth, borderColor: background.borderColor ?? '#FFFFFF'}})}
							/>
							<ColorField
								label="Border colour"
								value={background.borderColor ?? '#FFFFFF'}
								onChange={(borderColor) => onChange({background: {...background, borderColor}})}
							/>
						</div>
					</>
				) : null}
			</fieldset>

			{position ? (
				<fieldset>
					<legend>Position (or drag it on the preview)</legend>
					<div className="row">
						<Slider label="Centre x" value={style.x} min={0} max={1080} onChange={(x) => onChange({x})} />
						<Slider label="Centre y" value={style.y} min={0} max={1920} onChange={(y) => onChange({y})} />
					</div>
					<Slider label="Max width" value={style.maxWidth} min={200} max={1080} unit="px" onChange={(maxWidth) => onChange({maxWidth})} />
				</fieldset>
			) : null}
		</div>
	);
};

/* ---------------- picture frames ---------------- */

export const FrameEditor: React.FC<{frame: FrameStyle; onChange: (patch: FrameStylePatch) => void}> = ({frame, onChange}) => {
	const {border, shadow} = frame;
	return (
		<div className="style-editor">
			<Slider label="Rounded corners" value={frame.radius} min={0} max={200} unit="px" onChange={(radius) => onChange({radius})} />
			<fieldset>
				<legend>
					<Toggle label="Border" value={Boolean(border)} onChange={(on) => onChange({border: on ? DEFAULT_BORDER : null})} />
				</legend>
				{border ? (
					<div className="row">
						<Slider label="Thickness" value={border.width} min={0} max={60} unit="px" onChange={(width) => onChange({border: {...border, width}})} />
						<Slider label="Opacity" value={border.opacity} min={0} max={1} step={0.05} onChange={(opacity) => onChange({border: {...border, opacity}})} />
						<ColorField label="Colour" value={border.color} onChange={(color) => onChange({border: {...border, color}})} />
					</div>
				) : null}
			</fieldset>
			<fieldset>
				<legend>
					<Toggle label="Shadow" value={Boolean(shadow)} onChange={(on) => onChange({shadow: on ? DEFAULT_SHADOW : null})} />
				</legend>
				{shadow ? (
					<>
						<div className="row">
							<Slider label="X" value={shadow.x} min={-60} max={60} unit="px" onChange={(x) => onChange({shadow: {...shadow, x}})} />
							<Slider label="Y" value={shadow.y} min={-60} max={60} unit="px" onChange={(y) => onChange({shadow: {...shadow, y}})} />
						</div>
						<div className="row">
							<Slider label="Blur" value={shadow.blur} min={0} max={120} unit="px" onChange={(blur) => onChange({shadow: {...shadow, blur}})} />
							<Slider label="Opacity" value={shadow.opacity} min={0} max={1} step={0.05} onChange={(opacity) => onChange({shadow: {...shadow, opacity}})} />
							<ColorField label="Colour" value={shadow.color} onChange={(color) => onChange({shadow: {...shadow, color}})} />
						</div>
					</>
				) : null}
			</fieldset>
		</div>
	);
};

// Inspector section of one screen / bg picture: its own frame, or the frame of its kind in this video.
export const CutInFrameSection: React.FC<{cutIn: CutIn}> = ({cutIn}) => {
	const {edl} = useDerived();
	const resolved = edl.assets.find((a) => a.id === cutIn.id)?.frame;
	const [open, setOpen] = useState(Boolean(cutIn.frame));
	if (!resolved || cutIn.mode === 'full') return null;
	const kind = ops.frameKindOf(cutIn.mode);
	return (
		<fieldset>
			<legend>Frame (corners, border, shadow)</legend>
			<div className="row">
				<span className={`tag ${cutIn.frame ? 'warn' : 'ok'}`}>{cutIn.frame ? 'own frame' : `${kind} pictures frame`}</span>
				<button className="small" onClick={() => setOpen((o) => !o)}>
					{open ? 'Hide' : 'Edit this picture only'}
				</button>
				{cutIn.frame ? (
					<>
						<button className="small primary" onClick={() => apply((p) => ops.applyFrameToAll(p, cutIn.id))} title={`Every ${kind} picture of this video takes this frame`}>
							Apply to all {kind} pictures
						</button>
						<button className="small" onClick={() => apply((p) => ops.clearCutInFrame(p, cutIn.id))}>
							Back to the common frame
						</button>
					</>
				) : null}
				<button className="small" onClick={() => editor.select({kind: 'textStyle', target: kind})}>
					Edit all {kind} pictures…
				</button>
			</div>
			{open ? <FrameEditor frame={resolved} onChange={(patch) => apply((p) => ops.setCutInFrame(p, cutIn.id, patch))} /> : null}
		</fieldset>
	);
};

/* ---------------- Styles tab ---------------- */

export const StylesPanel: React.FC = () => {
	const selection = useEditor((s) => s.selection);
	const plan = useEditor((s) => s.plan)!;
	const {theme, reload} = useDerived();
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState('');
	const target: Target = selection?.kind === 'textStyle' ? selection.target : 'caption';

	useEffect(() => {
		if (selection?.kind !== 'textStyle') editor.select({kind: 'textStyle', target});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const group = isFrame(target) ? 'frameStyles' : 'textStyles';
	const overridden = Boolean((plan.themeOverrides?.[group] as Record<string, unknown> | undefined)?.[target]);
	const ownLooks = isFrame(target)
		? plan.cutIns.filter((c) => c.frame && ops.frameKindOf(c.mode) === target).length
		: plan.concepts.filter((c) => c.style).length;
	const clear = (p: Plan) => (isFrame(target) ? ops.clearVideoFrame(p, target) : ops.clearVideoStyle(p, target));
	const dropOwn = (p: Plan): Plan =>
		isFrame(target)
			? {...p, cutIns: p.cutIns.map(({frame, ...c}) => (ops.frameKindOf(c.mode) === target ? c : {...c, ...(frame ? {frame} : {})}))}
			: {...p, concepts: p.concepts.map(({style: _s, ...c}) => c)};

	const saveAsDefault = async () => {
		setSaving(true);
		setMessage('');
		try {
			await api.patchTheme({[group]: {[target]: isFrame(target) ? theme.frameStyles[target] : theme.textStyles[target]}});
			await reload();
			apply(clear);
			setMessage('Saved as the default of every video.');
		} catch (e) {
			setMessage(String(e instanceof Error ? e.message : e));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="inspector styles">
			<nav className="subtabs">
				{(Object.keys(LABELS) as Target[]).map((k) => (
					<button key={k} className={k === target ? 'active' : ''} onClick={() => editor.select({kind: 'textStyle', target: k})}>
						{LABELS[k].title}
					</button>
				))}
				<HelpLink to="styles" />
			</nav>
			<p className="muted small">{LABELS[target].hint}</p>
			<div className="row">
				<span className={`tag ${overridden ? 'warn' : 'ok'}`}>{overridden ? 'changed for this video' : 'default style'}</span>
				{overridden ? (
					<button className="small" onClick={() => apply(clear)}>
						Back to the default
					</button>
				) : null}
				<button className="small primary" disabled={!overridden || saving} onClick={saveAsDefault} title="Write this style in theme/theme.json">
					{saving ? 'Saving…' : 'Save as default for all videos'}
				</button>
			</div>
			{message ? <p className="small muted">{message}</p> : null}
			{(target === 'concept' || isFrame(target)) && ownLooks ? (
				<div className="row note warn">
					<span className="small">
						{ownLooks} {isFrame(target) ? 'picture(s) have their own frame' : 'concept(s) have their own look'} and ignore part of this style.
					</span>
					<button className="small" onClick={() => apply(dropOwn)}>
						Remove them
					</button>
				</div>
			) : null}
			{isFrame(target) ? (
				<FrameEditor frame={theme.frameStyles[target]} onChange={(patch) => apply((p) => ops.setVideoFrame(p, target, patch))} />
			) : (
				<StyleEditor style={theme.textStyles[target]} position={target !== 'highlight'} onChange={(patch) => apply((p) => ops.setVideoStyle(p, target, patch))} />
			)}
		</div>
	);
};

// Inspector section of one concept: its own look, or the concept style of the video.
export const ConceptStyleSection: React.FC<{concept: Concept}> = ({concept}) => {
	const {edl} = useDerived();
	const resolved = edl.concepts.find((c) => c.id === concept.id)?.style;
	const [open, setOpen] = useState(Boolean(concept.style));
	if (!resolved) return null;
	return (
		<fieldset>
			<legend>Look</legend>
			<div className="row">
				<span className={`tag ${concept.style ? 'warn' : 'ok'}`}>{concept.style ? 'own look' : 'concepts style'}</span>
				<button className="small" onClick={() => setOpen((o) => !o)}>
					{open ? 'Hide' : 'Edit this concept only'}
				</button>
				{concept.style ? (
					<>
						<button className="small primary" onClick={() => apply((p) => ops.applyConceptStyleToAll(p, concept.id))} title="Every concept of this video takes this look">
							Apply to all concepts
						</button>
						<button className="small" onClick={() => apply((p) => ops.clearConceptStyle(p, concept.id))}>
							Back to the concepts style
						</button>
					</>
				) : null}
				<button className="small" onClick={() => editor.select({kind: 'textStyle', target: 'concept'})}>
					Edit all concepts…
				</button>
			</div>
			{open ? <StyleEditor style={resolved} onChange={(patch) => apply((p) => ops.setConceptStyle(p, concept.id, patch))} /> : null}
			<p className="muted small">Drag the concept on the preview to move it, drag its corner to resize it.</p>
		</fieldset>
	);
};
