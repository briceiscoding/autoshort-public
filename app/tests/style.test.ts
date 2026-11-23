// YouTube 16:9 style components (theme/landscape/components/*.tsx): they replace elements of the 16:9 format only.
import type React from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_LAYERS, layersOf} from '../src/composition/formats';
import {registerStyleComponents, slotOfFile, styleSlots} from '../src/composition/formats/style';

const Fake = (name: string): React.FC<any> => {
	const component: React.FC<any> = () => null;
	component.displayName = name;
	return component;
};

afterEach(() => registerStyleComponents({}));

describe('style components', () => {
	it('names a slot after its file', () => {
		expect(slotOfFile('../../theme/landscape/components/Captions.tsx')).toBe('Captions');
		expect(slotOfFile(String.raw`C:\repo\theme\landscape\components\Diagram_flow.tsx`)).toBe('Diagram_flow');
	});

	it('replaces the 16:9 elements it defines and keeps the defaults of the others', () => {
		const captions = Fake('Captions');
		const flow = Fake('Flow');
		registerStyleComponents({
			'../../theme/landscape/components/Captions.tsx': {default: captions},
			'../../theme/landscape/components/Diagram_flow.tsx': {default: flow},
			'../../theme/landscape/components/Notes.tsx': {nothing: 42},
		});
		expect(styleSlots()).toEqual(['Captions', 'Diagram_flow']);
		const layers = layersOf('landscape');
		expect(layers.Captions).toBe(captions);
		expect(layers.diagrams.flow).toBe(flow);
		expect(layers.CutIn).toBe(FORMAT_LAYERS.landscape.CutIn);
		expect(layers.diagrams.tree).toBe(FORMAT_LAYERS.landscape.diagrams.tree);
		// The base 16:9 layers are not modified.
		expect(FORMAT_LAYERS.landscape.diagrams.flow).not.toBe(flow);
	});

	it('never touches the shorts', () => {
		registerStyleComponents({'Captions.tsx': {default: Fake('Captions')}, 'CutIn.tsx': {default: Fake('CutIn')}});
		expect(layersOf('short')).toBe(FORMAT_LAYERS.short);
		expect(layersOf(undefined)).toBe(FORMAT_LAYERS.short);
	});

	it('forgets a removed file when the style is registered again', () => {
		registerStyleComponents({'Captions.tsx': {default: Fake('Captions')}});
		registerStyleComponents({});
		expect(layersOf('landscape')).toBe(FORMAT_LAYERS.landscape);
	});
});
