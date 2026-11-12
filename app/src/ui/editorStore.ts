// Editor state: the plan with undo/redo, selection and playhead. A tiny external store (no dependency).
import {useSyncExternalStore} from 'react';
import type {Plan} from '../model/plan';
import type {FrameStyleKind, TextStyleKind} from '../model/theme';

export type Selection =
	| {kind: 'word'; id: string; lastId?: string}
	| {kind: 'span'; id: string}
	| {kind: 'cut'; at: number}
	| {kind: 'concept' | 'logo' | 'cutIn' | 'gauge' | 'diagram' | 'sfx'; id: string}
	| {kind: 'autoSfx'; index: number}
	| {kind: 'music'}
	| {kind: 'subscribe'}
	// A type of text in the Styles tab: its look, and its position dragged on the preview.
	| {kind: 'textStyle'; target: TextStyleKind | FrameStyleKind}
	| null;

export type EditorState = {
	plan: Plan | null;
	past: Plan[];
	future: Plan[];
	selection: Selection;
	// Output time of the playhead (seconds).
	time: number;
	overlays: {safeZone: boolean; face: boolean};
	saveStatus: 'saved' | 'dirty' | 'saving' | 'error';
	saveError?: string;
	// While a job rebuilds the plan (import, reset): no autosave, the new plan replaces this one when it is done.
	locked?: boolean;
	version: number;
};

const HISTORY_LIMIT = 300;

let state: EditorState = {
	plan: null,
	past: [],
	future: [],
	selection: null,
	time: 0,
	overlays: {safeZone: false, face: false},
	saveStatus: 'saved',
	version: 0,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const editor = {
	get: () => state,
	set(patch: Partial<EditorState>) {
		state = {...state, ...patch};
		emit();
	},
	load(plan: Plan | null) {
		state = {...state, plan, past: [], future: [], selection: null, time: 0, saveStatus: 'saved', locked: false, version: state.version + 1};
		emit();
	},
	// Apply an edit; pushes the previous plan on the undo stack.
	apply(fn: (plan: Plan) => Plan) {
		if (!state.plan) return;
		const next = fn(state.plan);
		if (next === state.plan) return;
		state = {
			...state,
			plan: next,
			past: [...state.past.slice(-HISTORY_LIMIT), state.plan],
			future: [],
			saveStatus: 'dirty',
			version: state.version + 1,
		};
		emit();
	},
	// Continuous gestures (drag): one undo step per gesture, live updates in between.
	beginGesture() {
		if (!state.plan) return;
		state = {...state, past: [...state.past.slice(-HISTORY_LIMIT), state.plan], future: []};
	},
	applyLive(fn: (plan: Plan) => Plan) {
		if (!state.plan) return;
		state = {...state, plan: fn(state.plan), saveStatus: 'dirty', version: state.version + 1};
		emit();
	},
	undo() {
		const prev = state.past[state.past.length - 1];
		if (!prev || !state.plan) return;
		state = {...state, plan: prev, past: state.past.slice(0, -1), future: [state.plan, ...state.future], saveStatus: 'dirty', version: state.version + 1};
		emit();
	},
	redo() {
		const next = state.future[0];
		if (!next || !state.plan) return;
		state = {...state, plan: next, past: [...state.past, state.plan], future: state.future.slice(1), saveStatus: 'dirty', version: state.version + 1};
		emit();
	},
	select(selection: Selection) {
		state = {...state, selection};
		emit();
	},
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};

export const useEditor = <T>(selector: (s: EditorState) => T): T =>
	useSyncExternalStore(editor.subscribe, () => selector(state), () => selector(state));
