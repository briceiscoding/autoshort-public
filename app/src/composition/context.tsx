import React, {createContext, useContext} from 'react';
import {defaultTheme} from '../model/loadTheme';
import type {Theme} from '../model/theme';

// Where media are served from: the backend in the app and during export renders.
export type MediaConfig = {
	// Base URL of the video folder (files are relative to it: "assets/x.png", "rush/x.mp4").
	videoBase: string;
	// Base URL of the library folder (fonts/, sfx/, brand/).
	libraryBase: string;
};

type Ctx = {theme: Theme; media: MediaConfig};

const CompositionContext = createContext<Ctx>({theme: defaultTheme, media: {videoBase: '', libraryBase: ''}});

export const CompositionProvider: React.FC<Ctx & {children: React.ReactNode}> = ({children, ...value}) => (
	<CompositionContext.Provider value={value}>{children}</CompositionContext.Provider>
);

export const useTheme = (): Theme => useContext(CompositionContext).theme;

const join = (base: string, file: string): string => {
	if (/^(https?:|data:|blob:)/.test(file)) return file;
	return `${base.replace(/\/$/, '')}/${file.split('/').map(encodeURIComponent).join('/')}`;
};

export const useVideoUrl = (): ((file: string) => string) => {
	const {media} = useContext(CompositionContext);
	return (file) => join(media.videoBase, file);
};

export const useLibraryUrl = (): ((file: string) => string) => {
	const {media} = useContext(CompositionContext);
	return (file) => join(media.libraryBase, file);
};

export const mediaUrl = join;
