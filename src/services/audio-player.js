import { clamp } from '../core/utils.js';
import { pitchToMidi } from '../music/pitch.js';
import { createSvg } from '../render/svg.js';

const global = typeof window !== 'undefined' ? window : globalThis;

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
  const secondsPerBeat = 60 / score.tempo;
  const startAt = ctx.currentTime + 0.05;
  editor.playback = {
    startAt,
    secondsPerBeat,
    totalBeats: score.measures * score.timeSignature.beats,
    score
  };
  editor.playbackNodes = [];
  for (const note of score.notes) {
    if (!note.pitch) continue;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = startAt + ((note.measure * score.timeSignature.beats) + note.beat) * secondsPerBeat;
    const dur = Math.max(0.08, note.duration * secondsPerBeat * 0.9);
    osc.frequency.value = 440 * Math.pow(2, (pitchToMidi(note.pitch) - 69) / 12);
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
  const secondsPerBeat = 60 / editor.model.score.tempo;
  const start = ctx.currentTime + 0.02;
  const dur = Math.max(0.12, note.duration * secondsPerBeat * 0.45);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 440 * Math.pow(2, (pitchToMidi(note.pitch) - 69) / 12);
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
  const elapsedBeats = Math.max(0, (editor.audioContext.currentTime - editor.playback.startAt) / editor.playback.secondsPerBeat);
  const totalBeats = editor.playback.totalBeats;
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
