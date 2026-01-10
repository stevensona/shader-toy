'use strict';

import type { UniformDefinition } from '../typenames';

export const SEQUENCER_SCHEMA_VERSION = '0.1.0' as const;

export type SequencerSchemaVersion = typeof SEQUENCER_SCHEMA_VERSION;

export type SequencerInterpolation = 'step' | 'linear';
export type SequencerStepMode = 'holdLeft';
export type SequencerOutOfRange = 'hold' | 'default';

export type SequencerProject = {
	schemaVersion: SequencerSchemaVersion;
	displayFps: number;
	durationSec?: number;
	defaults?: {
		interpolation: SequencerInterpolation;
		stepMode: SequencerStepMode;
		outOfRange: SequencerOutOfRange;
	};
	tracks: SequencerTrack[];
};

export type SequencerTrack = {
	id: string;
	name: string;
	target: {
		kind: 'uniform';
		uniformName: string;
	};
	valueType: 'float' | 'int';

	defaultValue: number;
	minValue?: number;
	maxValue?: number;
	stepValue?: number;

	interpolation?: SequencerInterpolation;
	stepMode?: SequencerStepMode;
	outOfRange?: SequencerOutOfRange;

	keys: SequencerKey[];
};

export type SequencerKey = {
	id: string;
	t: number; // seconds
	v: number; // float/int (int quantized at evaluation)
};

export type SequencerTrackValuesByTrackId = Record<string, number>;
export type SequencerUniformValuesByName = Record<string, number>;

export type SequencerEvaluationResult = {
	byTrackId: SequencerTrackValuesByTrackId;
	byUniformName: SequencerUniformValuesByName;
};

const clamp = (value: number, min: number | undefined, max: number | undefined): number => {
	if (typeof min === 'number' && isFinite(min)) {
		value = Math.max(min, value);
	}
	if (typeof max === 'number' && isFinite(max)) {
		value = Math.min(max, value);
	}
	return value;
};

const sortKeysInPlace = (keys: SequencerKey[]): void => {
	keys.sort((a, b) => {
		if (a.t !== b.t) {
			return a.t - b.t;
		}
		return a.id.localeCompare(b.id);
	});
};

export const normalizeDisplayFps = (fps: number | undefined): number => {
	if (typeof fps !== 'number' || !isFinite(fps) || fps <= 1) {
		return 60;
	}
	return Math.round(fps);
};

export const createSequencerProjectFromUniforms = (uniforms: UniformDefinition[], opts?: { displayFps?: number }): SequencerProject => {
	const displayFps = normalizeDisplayFps(opts?.displayFps);

	// Rule: one track per uniform name (dedupe by Name).
	const byName = new Map<string, UniformDefinition>();
	for (const u of uniforms) {
		if (!u || !u.Name) {
			continue;
		}
		if (u.Typename !== 'float' && u.Typename !== 'int') {
			continue;
		}
		// Only scalar.
		if (!u.Default || u.Default.length !== 1) {
			continue;
		}
		if (!byName.has(u.Name)) {
			byName.set(u.Name, u);
		}
	}

	const tracks: SequencerTrack[] = [];
	for (const [name, u] of byName) {
		const defaultValue = u.Default[0] ?? 0;
		const minValue = u.Min && u.Min.length === 1 ? u.Min[0] : undefined;
		const maxValue = u.Max && u.Max.length === 1 ? u.Max[0] : undefined;
		const stepValue = u.Step && u.Step.length === 1 ? u.Step[0] : undefined;

		const track: SequencerTrack = {
			id: `uniform:${name}`,
			name,
			target: { kind: 'uniform', uniformName: name },
			valueType: u.Typename === 'int' ? 'int' : 'float',
			defaultValue: defaultValue,
			minValue,
			maxValue,
			stepValue,
			// Defaults (can be overridden per-track later).
			interpolation: u.Typename === 'int' ? 'step' : 'linear',
			stepMode: 'holdLeft',
			outOfRange: 'hold',
			keys: [
				{
					id: 'k0',
					t: 0,
					v: defaultValue,
				}
			]
		};
		sortKeysInPlace(track.keys);
		tracks.push(track);
	}

	tracks.sort((a, b) => a.name.localeCompare(b.name));

	return {
		schemaVersion: SEQUENCER_SCHEMA_VERSION,
		displayFps,
		defaults: {
			interpolation: 'linear',
			stepMode: 'holdLeft',
			outOfRange: 'hold',
		},
		tracks,
	};
};

const getTrackDefaults = (project: SequencerProject, track: SequencerTrack) => {
	return {
		interpolation: track.interpolation ?? project.defaults?.interpolation ?? 'linear',
		stepMode: track.stepMode ?? project.defaults?.stepMode ?? 'holdLeft',
		outOfRange: track.outOfRange ?? project.defaults?.outOfRange ?? 'hold',
	};
};

const evalStepHoldLeft = (keys: SequencerKey[], timeSec: number): SequencerKey | undefined => {
	// Assumes keys are sorted by t.
	let lo = 0;
	let hi = keys.length - 1;
	let best: SequencerKey | undefined = undefined;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const k = keys[mid];
		if (k.t <= timeSec) {
			best = k;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return best;
};

const evalLinear = (keys: SequencerKey[], timeSec: number): number | undefined => {
	if (keys.length === 0) {
		return undefined;
	}

	// Before first / after last handled by caller.
	let lo = 0;
	let hi = keys.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const t = keys[mid].t;
		if (t < timeSec) {
			lo = mid + 1;
		} else if (t > timeSec) {
			hi = mid - 1;
		} else {
			return keys[mid].v;
		}
	}

	const rightIndex = lo;
	const leftIndex = lo - 1;
	if (leftIndex < 0 || rightIndex >= keys.length) {
		return undefined;
	}

	const a = keys[leftIndex];
	const b = keys[rightIndex];
	const dt = b.t - a.t;
	if (dt <= 0) {
		return b.v;
	}
	const alpha = (timeSec - a.t) / dt;
	return a.v + (b.v - a.v) * alpha;
};

export const evaluateProjectAtTime = (project: SequencerProject | undefined, timeSec: number): SequencerEvaluationResult => {
	const byTrackId: SequencerTrackValuesByTrackId = {};
	const byUniformName: SequencerUniformValuesByName = {};

	if (!project || !Array.isArray(project.tracks)) {
		return { byTrackId, byUniformName };
	}

	const t = (typeof timeSec === 'number' && isFinite(timeSec)) ? timeSec : 0;

	for (const track of project.tracks) {
		const defaults = getTrackDefaults(project, track);
		const keys = Array.isArray(track.keys) ? track.keys.slice() : [];
		sortKeysInPlace(keys);

		let value: number | undefined;
		if (keys.length === 0) {
			value = track.defaultValue;
		} else if (t < keys[0].t) {
			value = defaults.outOfRange === 'default' ? track.defaultValue : keys[0].v;
		} else if (t > keys[keys.length - 1].t) {
			value = defaults.outOfRange === 'default' ? track.defaultValue : keys[keys.length - 1].v;
		} else {
			if (defaults.interpolation === 'step') {
				const k = evalStepHoldLeft(keys, t);
				value = k ? k.v : track.defaultValue;
			} else {
				value = evalLinear(keys, t);
				if (typeof value !== 'number' || !isFinite(value)) {
					const k = evalStepHoldLeft(keys, t);
					value = k ? k.v : track.defaultValue;
				}
			}
		}

		if (typeof value !== 'number' || !isFinite(value)) {
			value = track.defaultValue;
		}

		// Apply constraints.
		value = clamp(value, track.minValue, track.maxValue);

		// Quantize int tracks at the end.
		if (track.valueType === 'int') {
			value = Math.round(value);
			value = clamp(value, track.minValue, track.maxValue);
		}

		byTrackId[track.id] = value;
		if (track.target && track.target.kind === 'uniform') {
			byUniformName[track.target.uniformName] = value;
		}
	}

	return { byTrackId, byUniformName };
};

export const addOrReplaceKey = (project: SequencerProject, trackId: string, key: { t: number; v: number; }, mode?: { replaceIfSameTime?: boolean }): SequencerProject => {
	const replaceIfSameTime = mode?.replaceIfSameTime !== false;

	const next: SequencerProject = {
		...project,
		tracks: project.tracks.map((t) => {
			if (t.id !== trackId) {
				return t;
			}
			const keys = Array.isArray(t.keys) ? t.keys.slice() : [];
			const tSec = (typeof key.t === 'number' && isFinite(key.t)) ? key.t : 0;
			const v = (typeof key.v === 'number' && isFinite(key.v)) ? key.v : t.defaultValue;

			if (replaceIfSameTime) {
				const existing = keys.find((k) => Math.abs(k.t - tSec) < 1e-9);
				if (existing) {
					existing.v = v;
					sortKeysInPlace(keys);
					return { ...t, keys };
				}
			}

			const id = `k${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
			keys.push({ id, t: tSec, v });
			sortKeysInPlace(keys);
			return { ...t, keys };
		})
	};

	return next;
};

export const moveKeyTime = (project: SequencerProject, trackId: string, keyId: string, newTimeSec: number): SequencerProject => {
	const tSec = (typeof newTimeSec === 'number' && isFinite(newTimeSec)) ? newTimeSec : 0;

	return {
		...project,
		tracks: project.tracks.map((t) => {
			if (t.id !== trackId) {
				return t;
			}
			const keys = Array.isArray(t.keys) ? t.keys.slice() : [];
			const k = keys.find((x) => x.id === keyId);
			if (!k) {
				return t;
			}
			k.t = tSec;
			sortKeysInPlace(keys);
			return { ...t, keys };
		})
	};
};

export const setKeyValue = (project: SequencerProject, trackId: string, keyId: string, newValue: number): SequencerProject => {
	const v = (typeof newValue === 'number' && isFinite(newValue)) ? newValue : 0;
	return {
		...project,
		tracks: project.tracks.map((t) => {
			if (t.id !== trackId) {
				return t;
			}
			const keys = Array.isArray(t.keys) ? t.keys.slice() : [];
			const k = keys.find((x) => x.id === keyId);
			if (!k) {
				return t;
			}
			k.v = v;
			sortKeysInPlace(keys);
			return { ...t, keys };
		})
	};
};

export const deleteKey = (project: SequencerProject, trackId: string, keyId: string): SequencerProject => {
	return {
		...project,
		tracks: project.tracks.map((t) => {
			if (t.id !== trackId) {
				return t;
			}
			const keys = Array.isArray(t.keys) ? t.keys.filter((k) => k.id !== keyId) : [];
			return { ...t, keys };
		})
	};
};