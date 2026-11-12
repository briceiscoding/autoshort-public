// Escape hatch registry: hand-written diagram components, keyed "<slug>/<component>".
// Filled by the entry point (Vite glob in the app, a generated file for export renders).
import type React from 'react';

type Scene = React.FC<{elements: {label: string; kind: string; trigger: string; start: number; draw: number}[]}>;

const registry = new Map<string, Scene>();

export const registerCustomDiagrams = (entries: Record<string, Scene>): void => {
	for (const [key, value] of Object.entries(entries)) registry.set(key, value);
};

export const findCustomDiagram = (slug: string, component: string): Scene | undefined =>
	registry.get(`${slug}/${component}`) ?? registry.get(component);
