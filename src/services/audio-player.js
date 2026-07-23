import { clamp } from '../core/utils.js';
import { pitchToMidi } from '../music/pitch.js';
import { createSvg } from '../render/svg.js';

const global = typeof window !== 'undefined' ? window : globalThis;

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

function normalizeFifths(value) {
  const numeric = Math.round(Number(value || 0));
  if (!Number.isFinite(numeric)) return 0;
  return clamp(numeric, -7, 7);
}

function keyAlterByStep(fifths) {
  const normalized = normalizeFifths(fifths);
  const map = new Map();
  if (normalized > 0) {
    for (let idx = 0; idx < normalized; idx++) map.set(SHARP_ORDER[idx], 1);
    return map;
  }
  if (normalized < 0) {
    for (let idx = 0; idx < Math.abs(normalized); idx++) map.set(FLAT_ORDER[idx], -1);
  }
  return map;
}

function activeFifthsAtMeasure(score, measure) {
  const fallback = normalizeFifths(score?.key?.fifths || 0);
  const events = Array.isArray(score?.keyChanges)
    ? [...score.keyChanges].sort((a, b) => Number(a.measure || 0) - Number(b.measure || 0))
    : [{ measure: 0, fifths: fallback }];
  let active = fallback;
  for (const event of events) {
    if (Number(event.measure || 0) > measure) break;
    active = normalizeFifths(event.fifths);
  }
  return active;
}

function normalizeTempo(value) {
  const numeric = Math.round(Number(value || 90));
  if (!Number.isFinite(numeric) || numeric <= 0) return 90;
  return clamp(numeric, 20, 300);
}

function activeTempoAtMeasure(score, measure) {
  const fallback = normalizeTempo(score?.tempo || 90);
  const events = Array.isArray(score?.tempoChanges)
    ? [...score.tempoChanges].sort((a, b) => Number(a.measure || 0) - Number(b.measure || 0))
    : [{ measure: 0, tempo: fallback }];
  let active = fallback;
  for (const event of events) {
    if (Number(event.measure || 0) > measure) break;
    active = normalizeTempo(event.tempo);
  }
  return active;
}

function buildTempoTimeline(score) {
  const beatsPerMeasure = Number(score.timeSignature?.beats || 4);
  const totalBeats = Number(score.measures || 1) * beatsPerMeasure;
  const fallback = normalizeTempo(score?.tempo || 90);
  const raw = Array.isArray(score?.tempoChanges)
    ? score.tempoChanges
    : [{ measure: 0, tempo: fallback }];

  const deduped = raw
    .filter((event) => event && typeof event === 'object')
    .map((event) => ({
      measure: clamp(Math.round(Number(event.measure || 0)), 0, Math.max(0, Number(score.measures || 1) - 1)),
      tempo: normalizeTempo(event.tempo)
    }))
    .sort((a, b) => a.measure - b.measure)
    .reduce((list, event) => {
      if (list.length && list.at(-1).measure === event.measure) {
        list[list.length - 1] = event;
      } else {
        list.push(event);
      }
      return list;
    }, []);

  const initialTempo = deduped.find((event) => event.measure === 0)?.tempo ?? fallback;
  if (!deduped.length || deduped[0].measure !== 0) deduped.unshift({ measure: 0, tempo: initialTempo });

  const segments = [];
  let offsetSeconds = 0;
  for (let idx = 0; idx < deduped.length; idx++) {
    const current = deduped[idx];
    const next = deduped[idx + 1];
    const startBeat = current.measure * beatsPerMeasure;
    const endBeat = next ? next.measure * beatsPerMeasure : totalBeats;
    const beatLength = Math.max(0, endBeat - startBeat);
    const secondsPerBeat = 60 / normalizeTempo(current.tempo);
    const durationSeconds = beatLength * secondsPerBeat;
    segments.push({
      startBeat,
      endBeat,
      tempo: normalizeTempo(current.tempo),
      secondsPerBeat,
      startOffsetSeconds: offsetSeconds,
      endOffsetSeconds: offsetSeconds + durationSeconds
    });
    offsetSeconds += durationSeconds;
  }

  return {
    beatsPerMeasure,
    totalBeats,
    totalDurationSeconds: offsetSeconds,
    segments
  };
}

function beatToOffsetSeconds(timeline, beat) {
  const clampedBeat = clamp(Number(beat || 0), 0, timeline.totalBeats);
  const segment = timeline.segments.find((candidate) => clampedBeat >= candidate.startBeat && clampedBeat <= candidate.endBeat)
    || timeline.segments.at(-1);
  if (!segment) return 0;
  return segment.startOffsetSeconds + (clampedBeat - segment.startBeat) * segment.secondsPerBeat;
}

function spanSeconds(timeline, startBeat, durationBeats) {
  const from = beatToOffsetSeconds(timeline, startBeat);
  const to = beatToOffsetSeconds(timeline, startBeat + Math.max(0, Number(durationBeats || 0)));
  return Math.max(0.08, to - from);
}

function offsetSecondsToBeat(timeline, elapsedSeconds) {
  const clampedSeconds = clamp(Number(elapsedSeconds || 0), 0, timeline.totalDurationSeconds);
  const segment = timeline.segments.find((candidate) => clampedSeconds >= candidate.startOffsetSeconds && clampedSeconds <= candidate.endOffsetSeconds)
    || timeline.segments.at(-1);
  if (!segment) return 0;
  return segment.startBeat + (clampedSeconds - segment.startOffsetSeconds) / segment.secondsPerBeat;
}

function effectivePitch(score, note) {
  if (!note?.pitch) return null;
  const pitch = note.pitch;
  const explicitAlter = Number(pitch.alter || 0);
  if (explicitAlter !== 0) return { ...pitch, alter: explicitAlter };

  const fifths = activeFifthsAtMeasure(score, Number(note.measure || 0));
  const byStep = keyAlterByStep(fifths);
  return {
    ...pitch,
    alter: byStep.get(pitch.step) || 0
  };
}

function noteOrder(score, a, b) {
  const beatsPerMeasure = score.timeSignature.beats;
  const absA = (a.measure * beatsPerMeasure) + a.beat;
  const absB = (b.measure * beatsPerMeasure) + b.beat;
  return absA - absB;
}

function pitchKey(score, note) {
  const pitch = effectivePitch(score, note);
  return pitch ? String(pitchToMidi(pitch)) : '';
}

function buildPlaybackEvents(score) {
  const notes = [...score.notes]
    .filter((note) => !!note.pitch)
    .sort((a, b) => noteOrder(score, a, b));
  const events = [];
  const openByPitch = new Map();
  const beatsPerMeasure = score.timeSignature.beats;

  const addRegularEvent = (note) => {
    events.push({
      note,
      startBeat: (note.measure * beatsPerMeasure) + note.beat,
      duration: note.duration
    });
  };

  for (const note of notes) {
    const key = pitchKey(score, note);
    const queue = openByPitch.get(key) || [];
    let chain = null;

    if (note.tieStop && queue.length) {
      chain = queue.shift();
      chain.duration += note.duration;
    }

    if (note.tieStart) {
      if (!chain) {
        chain = {
          note,
          startBeat: (note.measure * beatsPerMeasure) + note.beat,
          duration: note.duration
        };
      }
      queue.push(chain);
      openByPitch.set(key, queue);
      continue;
    }

    if (chain) {
      events.push(chain);
      continue;
    }

    addRegularEvent(note);
  }

  for (const queue of openByPitch.values()) {
    for (const chain of queue) events.push(chain);
  }

  return events.sort((a, b) => a.startBeat - b.startBeat);
}

export async function play(editor) {
  if (editor.playback) stopPlayback(editor);
  const score = editor.toJSON();
  if (!score.notes.length) return;
  const AudioContext = global.AudioContext || global.webkitAudioContext;
  if (!AudioContext) return;
  editor.audioContext = editor.audioContext || new AudioContext();
  const ctx = editor.audioContext;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  const timeline = buildTempoTimeline(score);
  const startAt = ctx.currentTime + 0.05;
  const playbackEvents = buildPlaybackEvents(score);
  editor.playback = {
    startAt,
    timeline,
    totalBeats: timeline.totalBeats,
    score,
    events: playbackEvents
  };
  editor.playbackNodes = [];
  for (const event of playbackEvents) {
    const note = event.note;
    const pitch = effectivePitch(score, note);
    if (!pitch) continue;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = startAt + beatToOffsetSeconds(timeline, event.startBeat);
    const dur = spanSeconds(timeline, event.startBeat, event.duration) * 0.9;
    osc.frequency.value = 440 * Math.pow(2, (pitchToMidi(pitch) - 69) / 12);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    editor.playbackNodes.push({ osc, gain });
    if (typeof editor.options.onPlayNote === 'function') editor.options.onPlayNote(note);
  }
  editor.updateMeasureToolbar();
  updatePlaybackCursor(editor);
  editor.playbackFrame = requestAnimationFrame(() => tickPlayback(editor));
}

export async function playNote(editor, note) {
  if (!note?.pitch) return;
  const AudioContext = global.AudioContext || global.webkitAudioContext;
  if (!AudioContext) return;
  editor.audioContext = editor.audioContext || new AudioContext();
  const ctx = editor.audioContext;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  const tempo = activeTempoAtMeasure(editor.model.score, Number(note.measure || 0));
  const secondsPerBeat = 60 / tempo;
  const start = ctx.currentTime + 0.02;
  const dur = Math.max(0.12, note.duration * secondsPerBeat * 0.45);
  const pitch = effectivePitch(editor.model.score, note);
  if (!pitch) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 440 * Math.pow(2, (pitchToMidi(pitch) - 69) / 12);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
  if (typeof editor.options.onPlayNote === 'function') editor.options.onPlayNote(note);
}

export function stopPlayback(editor) {
  if (editor.playbackFrame) {
    cancelAnimationFrame(editor.playbackFrame);
    editor.playbackFrame = null;
  }
  for (const node of editor.playbackNodes) {
    try {
      node.osc.stop();
    } catch {
      // ignore nodes already stopped
    }
    try { node.osc.disconnect(); } catch {}
    try { node.gain.disconnect(); } catch {}
  }
  editor.playbackNodes = [];
  editor.playback = null;
  removePlaybackCursor(editor);
  editor.updateMeasureToolbar();
}

export function tickPlayback(editor) {
  if (!editor.playback) return;
  const position = getPlaybackPosition(editor);
  if (!position) {
    stopPlayback(editor);
    return;
  }
  if (position.done) {
    stopPlayback(editor);
    return;
  }
  updatePlaybackCursor(editor, position);
  editor.playbackFrame = requestAnimationFrame(() => tickPlayback(editor));
}

export function getPlaybackPosition(editor) {
  if (!editor.playback || !editor.audioContext) return null;
  const timeline = editor.playback.timeline;
  const elapsedSeconds = Math.max(0, editor.audioContext.currentTime - editor.playback.startAt);
  if (elapsedSeconds >= timeline.totalDurationSeconds) return { done: true };
  const elapsedBeats = offsetSecondsToBeat(timeline, elapsedSeconds);
  const totalBeats = timeline.totalBeats;
  if (elapsedBeats >= totalBeats) return { done: true };
  const beatsPerMeasure = editor.playback.score.timeSignature.beats;
  const measure = clamp(Math.floor(elapsedBeats / beatsPerMeasure), 0, editor.playback.score.measures - 1);
  const beat = elapsedBeats - (measure * beatsPerMeasure);
  return { measure, beat, elapsedBeats };
}

export function updatePlaybackCursor(editor, position = null) {
  if (!editor.playback || !editor.measureLayout) return;
  const current = position || getPlaybackPosition(editor);
  if (!current || current.done) {
    removePlaybackCursor(editor);
    return;
  }
  const layout = editor.measureLayout;
  const systemIndex = layout.measureToSystem?.[current.measure] ?? 0;
  const system = layout.systems?.[systemIndex] || layout.systems?.[0] || null;
  if (!system) return;
  const x = editor.beatToX(current.measure, current.beat);
  const y1 = system.staffTop - 6;
  const y2 = system.staffTop + 4 * editor.options.staffSpacing + 6;
  if (!editor.playbackLine || editor.playbackLine.parentNode !== editor.svg) {
    editor.playbackLineBase = createSvg('line', { class: 'partitura-playback-cursor-base' });
    editor.playbackLine = createSvg('line', { class: 'partitura-playback-cursor' });
    editor.svg.appendChild(editor.playbackLineBase);
    editor.svg.appendChild(editor.playbackLine);
  }
  editor.playbackLineBase.setAttribute('x1', x);
  editor.playbackLineBase.setAttribute('x2', x);
  editor.playbackLineBase.setAttribute('y1', y1);
  editor.playbackLineBase.setAttribute('y2', y2);
  editor.playbackLine.setAttribute('x1', x);
  editor.playbackLine.setAttribute('x2', x);
  editor.playbackLine.setAttribute('y1', y1);
  editor.playbackLine.setAttribute('y2', y2);
}

export function removePlaybackCursor(editor) {
  if (editor.playbackLineBase?.parentNode) editor.playbackLineBase.remove();
  editor.playbackLineBase = null;
  if (editor.playbackLine?.parentNode) editor.playbackLine.remove();
  editor.playbackLine = null;
}
