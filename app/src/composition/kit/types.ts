// @kit/types: props of hand-written diagrams.
export type SchemaElement = {label: string; kind: string; trigger: string; start: number; draw: number};
export type SchemaSceneProps = {elements: SchemaElement[]};
