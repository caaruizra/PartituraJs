import { STEPS, STEP_TO_INDEX } from '../core/constants.js';

export function pitchToDiatonicIndex(pitch) {
  const step = pitch.step || 'C';
  const octave = Number.isFinite(pitch.octave) ? pitch.octave : 4;
  return octave * 7 + (STEP_TO_INDEX[step] ?? 0);
}

export function diatonicIndexToPitch(index) {
  const normalized = ((index % 7) + 7) % 7;
  const octave = Math.floor(index / 7);
  return { step: STEPS[normalized], octave, alter: 0 };
}

export function pitchToMidi(pitch) {
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (pitch.octave + 1) * 12 + semis[pitch.step] + (pitch.alter || 0);
}

export function noteSortValue(note) {
  return note?.pitch ? pitchToMidi(note.pitch) : Number.NEGATIVE_INFINITY;
}

export function midiToPitch(midi) {
  const names = [
    ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
    ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]
  ];
  const octave = Math.floor(midi / 12) - 1;
  const [step, alter] = names[((midi % 12) + 12) % 12];
  return { step, octave, alter };
}
