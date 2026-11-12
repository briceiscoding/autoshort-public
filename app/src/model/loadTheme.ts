import raw from '../../../theme/theme.json';
import {ThemeSchema, type Theme} from './theme';

export const defaultTheme: Theme = ThemeSchema.parse(raw);
