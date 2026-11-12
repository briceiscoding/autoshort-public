// Kit for hand-written diagrams (`import ... from '@kit/schema'` in projects/<slug>/diagrams/*.tsx).
// Escape hatch only: new diagrams should be data with a template.

export {Arrow, Float, Frame, Icon, Label, Line, PathSketch, SchemaCanvas, StickerBox, Wobble} from '../diagrams/primitives';
export {ICONS} from '../diagrams/icons';
export type {IconNode} from '../diagrams/icons';
export {Sketch, useSeed, STROKE_WIDTH} from '../diagrams/Sketch';
export {SchemaImage} from '../diagrams/primitives';
