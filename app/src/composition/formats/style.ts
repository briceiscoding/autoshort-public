// The YouTube 16:9 style made from the author's references (theme/landscape/components/*.tsx, written by Claude).
// Each file replaces one element of the 16:9 format, named after its slot; an element without a file keeps the
// default 16:9 component. The shorts never use these files.
//   Captions.tsx  Concept.tsx  Logo.tsx  CutIn.tsx  Gauge.tsx  Subscribe.tsx  Diagram_<template>.tsx (flow, tree...)
// A file exports its component as `export default`.
// Filled from theme/landscape/components by the app (Vite glob) and by scripts/render.ts (generated imports).
import type React from 'react';
import type {FormatLayers} from './index';

export const STYLE_SLOTS = ['Captions', 'Concept', 'Logo', 'CutIn', 'Gauge', 'Subscribe'] as const;
export type StyleSlot = (typeof STYLE_SLOTS)[number];
export const DIAGRAM_PREFIX = 'Diagram_';

const registry = new Map<string, React.FC<any>>();

// Slot name of a component file: "theme/landscape/components/Captions.tsx" -> "Captions".
export const slotOfFile = (file: string): string => file.replace(/\\/g, '/').split('/').pop()!.replace(/\.tsx$/, '');

const componentOf = (module: unknown): React.FC<any> | undefined => {
	if (typeof module === 'function') return module as React.FC<any>;
	if (!module || typeof module !== 'object') return undefined;
	const m = module as Record<string, unknown>;
	if (typeof m.default === 'function') return m.default as React.FC<any>;
	return Object.values(m).find((v) => typeof v === 'function') as React.FC<any> | undefined;
};

// modules: file path (or slot name) -> module or component. Replaces the whole style (a removed file is forgotten).
export const registerStyleComponents = (modules: Record<string, unknown>): void => {
	registry.clear();
	for (const [file, module] of Object.entries(modules)) {
		const component = componentOf(module);
		if (component) registry.set(slotOfFile(file), component);
	}
};

export const styleSlots = (): string[] => [...registry.keys()].sort();

// The 16:9 layers with the style's components in place of the defaults.
export const withStyle = (base: FormatLayers): FormatLayers => {
	if (!registry.size) return base;
	const pick = <K extends StyleSlot>(slot: K) => (registry.get(slot) as FormatLayers[K] | undefined) ?? base[slot];
	const diagrams = {...base.diagrams};
	for (const [slot, component] of registry) {
		if (slot.startsWith(DIAGRAM_PREFIX)) diagrams[slot.slice(DIAGRAM_PREFIX.length)] = component;
	}
	return {
		CutIn: pick('CutIn'),
		Logo: pick('Logo'),
		Concept: pick('Concept'),
		Captions: pick('Captions'),
		Gauge: pick('Gauge'),
		Subscribe: pick('Subscribe'),
		diagrams,
	};
};
