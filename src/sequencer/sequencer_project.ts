'use strict';

import type { UniformDefinition } from '../typenames';

export const SEQUENCER_SCHEMA_VERSION = '0.2.0' as const;

export type SequencerSchemaVersion = typeof SEQUENCER_SCHEMA_VERSION;

export type SequencerInterpolation = 'step' | 'linear';
export type SequencerStepMode = 'holdLeft';
export type SequencerOutOfRange = 'hold' | 'default';

export type SequencerProject = {
	schemaVersion: SequencerSchemaVersion;
	projectId?: string;
	displayFps: number;
	/**
	 * Playback scope for looping/stop behavior. Keys can still exist outside this range.
	 */
	timeScope?: {
		startSec: number;
		endSec: number;
	};
	/**
	 * Legacy end-time field (kept for backward compatibility / older exports).
	 */
	durationSec?: number;
	/**
	 * When true (default), playback wraps to timeScope.startSec when reaching timeScope.endSec.
	 * When false, playback pauses at the end.
	 */
	loop?: boolean;
	snapSettings?: {
		enabled?: boolean;
		stepSec?: number;
	};
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
	meta?: Record<string, unknown>;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
};

const asNumber = (v: unknown): number | undefined => {
	return (typeof v === 'number' && isFinite(v)) ? v : undefined;
};

const asString = (v: unknown): string | undefined => {
	return (typeof v === 'string' && v.length > 0) ? v : undefined;
};

const normalizeKey = (raw: unknown, fallbackId: string): SequencerKey | undefined => {
	if (!isPlainObject(raw)) {
		return undefined;
	}
	const id = asString(raw.id) ?? fallbackId;
	const t = asNumber(raw.t) ?? 0;
	const v = asNumber(raw.v) ?? 0;
	const meta = isPlainObject(raw.meta) ? raw.meta : undefined;
	return { id, t, v, meta };
};

const normalizeTrack = (raw: unknown): SequencerTrack | undefined => {
	if (!isPlainObject(raw)) {
		return undefined;
	}
	const id = asString(raw.id);
	const name = asString(raw.name) ?? id;
	if (!id || !name) {
		return undefined;
	}

	const targetObj = isPlainObject(raw.target) ? raw.target : undefined;
	const kind = targetObj ? asString(targetObj.kind) : undefined;
	const uniformName = targetObj ? asString(targetObj.uniformName) : undefined;
	if (kind !== 'uniform' || !uniformName) {
		return undefined;
	}

	const valueType = (raw.valueType === 'int' ? 'int' : 'float') as 'float' | 'int';
	const defaultValue = asNumber(raw.defaultValue) ?? 0;
	const minValue = asNumber(raw.minValue);
	const maxValue = asNumber(raw.maxValue);
	const stepValue = asNumber(raw.stepValue);

	const interpolation = (raw.interpolation === 'step' || raw.interpolation === 'linear') ? raw.interpolation : undefined;
	const stepMode = (raw.stepMode === 'holdLeft') ? raw.stepMode : undefined;
	const outOfRange = (raw.outOfRange === 'hold' || raw.outOfRange === 'default') ? raw.outOfRange : undefined;

	const keysRaw = Array.isArray(raw.keys) ? raw.keys : [];
	const keys: SequencerKey[] = [];
	for (let i = 0; i < keysRaw.length; i++) {
		const k = normalizeKey(keysRaw[i], `k${i}`);
		if (k) {
			keys.push(k);
		}
	}
	if (keys.length === 0) {
		keys.push({ id: 'k0', t: 0, v: defaultValue });
	}
	sortKeysInPlace(keys);

	return {
		id,
		name,
		target: { kind: 'uniform', uniformName },
		valueType,
		defaultValue,
		minValue,
		maxValue,
		stepValue,
		interpolation,
		stepMode,
		outOfRange,
		keys,
	};
};

const normalizeDefaults = (raw: unknown): SequencerProject['defaults'] | undefined => {
	if (!isPlainObject(raw)) {
		return undefined;
	}
	const interpolation = (raw.interpolation === 'step' || raw.interpolation === 'linear') ? raw.interpolation : 'linear';
	const stepMode = (raw.stepMode === 'holdLeft') ? raw.stepMode : 'holdLeft';
	const outOfRange = (raw.outOfRange === 'hold' || raw.outOfRange === 'default') ? raw.outOfRange : 'hold';
	return { interpolation, stepMode, outOfRange };
};

export const migrateSequencerProject = (raw: unknown): SequencerProject | undefined => {
	// Accept persisted/imported objects for v0.1.0/v0.2.0 and normalize them.
	if (!isPlainObject(raw)) {
		return undefined;
	}
	const schemaVersion = asString(raw.schemaVersion);
	if (schemaVersion !== '0.1.0' && schemaVersion !== '0.2.0') {
		return undefined;
	}

	const displayFps = normalizeDisplayFps(asNumber(raw.displayFps));
	const durationSec = asNumber(raw.durationSec);
	const loop = typeof raw.loop === 'boolean' ? raw.loop : true;

	let snapSettings: SequencerProject['snapSettings'] | undefined;
	if (isPlainObject(raw.snapSettings)) {
		snapSettings = {
			enabled: typeof raw.snapSettings.enabled === 'boolean' ? raw.snapSettings.enabled : undefined,
			stepSec: asNumber(raw.snapSettings.stepSec),
		};
	}

	const defaults = normalizeDefaults(raw.defaults) ?? {
		interpolation: 'linear',
		stepMode: 'holdLeft',
		outOfRange: 'hold',
	};

	const tracksRaw = Array.isArray(raw.tracks) ? raw.tracks : [];
	const tracks: SequencerTrack[] = [];
	for (const tr of tracksRaw) {
		const t = normalizeTrack(tr);
		if (t) {
			tracks.push(t);
		}
	}

	tracks.sort((a, b) => a.name.localeCompare(b.name));

	// Normalize timeScope.
	let startSec = 0;
	let endSec: number | undefined = undefined;
	if (isPlainObject(raw.timeScope)) {
		startSec = asNumber(raw.timeScope.startSec) ?? startSec;
		endSec = asNumber(raw.timeScope.endSec) ?? endSec;
	}
	// Legacy aliases.
	if (endSec === undefined) {
		endSec = durationSec;
	}
	if (typeof startSec !== 'number' || !isFinite(startSec)) {
		startSec = 0;
	}
	if (typeof endSec !== 'number' || !isFinite(endSec)) {
		// Default end: max key time, with a reasonable minimum span.
		let maxKeyT = startSec;
		for (const tr of tracks) {
			for (const k of tr.keys) {
				if (typeof k.t === 'number' && isFinite(k.t)) {
					maxKeyT = Math.max(maxKeyT, k.t);
				}
			}
		}
		endSec = (maxKeyT > startSec) ? maxKeyT : (startSec + 10);
	}
	if (endSec <= startSec) {
		endSec = startSec + 10;
	}

	return {
		schemaVersion: SEQUENCER_SCHEMA_VERSION,
		projectId: asString(raw.projectId),
		displayFps,
		timeScope: { startSec, endSec },
		durationSec,
		loop,
		snapSettings,
		defaults,
		tracks,
	};
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

	// Backward compatibility:
	// - If *any* uniform declares the `sequncer`/`sequencer` tag, only tagged uniforms become sequencer tracks.
	// - If none are tagged, keep the legacy behavior (all scalar float/int become tracks).
	const hasAnySequencerTaggedUniform = uniforms.some((u) => !!u?.Sequencer);

	// Rule: one track per uniform name (dedupe by Name).
	const byName = new Map<string, UniformDefinition>();
	for (const u of uniforms) {
		if (!u || !u.Name) {
			continue;
		}
		if (hasAnySequencerTaggedUniform && !u.Sequencer) {
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
		timeScope: { startSec: 0, endSec: 10 },
		loop: true,
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