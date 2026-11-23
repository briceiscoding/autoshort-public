import raw from '../../../theme/theme.json';
import landscapeRaw from '../../../theme/theme.landscape.json';
import {ThemeSchema, deepMerge, type Theme} from './theme';

export const defaultTheme: Theme = ThemeSchema.parse(raw);

// Default theme of a format: theme.json for the shorts, theme.json + theme.landscape.json for YouTube 16:9
// (same rule as server/autoshort_server/formats.py, which is what the app and the export actually use).
export const defaultThemeOf = (format?: 'short' | 'landscape'): Theme =>
	format === 'landscape' ? ThemeSchema.parse(deepMerge(raw, landscapeRaw)) : defaultTheme;
