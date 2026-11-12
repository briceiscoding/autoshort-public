// Remotion root for export renders (bundled by @remotion/bundler, see scripts/render.ts).
import React from 'react';
import {Composition} from 'remotion';
import {defaultTheme} from '../model/loadTheme';
import {Main, type MainProps} from './Main';

const placeholder: MainProps = {
	edl: {
		slug: 'placeholder', source: '', fps: 30, width: 1080, height: 1920,
		crop: {x: 0, y: 0, width: 1080, height: 1920, sourceWidth: 1080},
		durationBefore: 1, durationAfter: 1, segments: [], captions: [], concepts: [], logos: [], assets: [], gauges: [],
		diagrams: [], sfx: [], overlaySubscribe: null, music: null, hideCaptionsDuringConcepts: true, unplacedAssets: [],
	},
	theme: defaultTheme,
	media: {videoBase: '', libraryBase: ''},
	audio: {mode: 'export'},
};

export const Root: React.FC = () => (
	<Composition
		id="Main"
		component={Main as unknown as React.FC<Record<string, unknown>>}
		defaultProps={placeholder as unknown as Record<string, unknown>}
		fps={30}
		width={1080}
		height={1920}
		durationInFrames={30}
		calculateMetadata={({props}) => {
			const edl = (props as unknown as MainProps).edl;
			return {fps: edl.fps, width: edl.width, height: edl.height, durationInFrames: Math.max(1, Math.round(edl.durationAfter * edl.fps))};
		}}
	/>
);
