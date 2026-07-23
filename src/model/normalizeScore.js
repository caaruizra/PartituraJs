import { uid } from '../core/utils.js';
import { normalizeClef } from '../music/clef.js';

function normalizeFifths(value) {
  const numeric = Math.round(Number(value || 0));
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-7, Math.min(7, numeric));
}

function normalizeKeyChanges(score = {}, measures = 1) {
  const maxMeasure = Math.max(0, Number(measures || 1) - 1);
  const sourceEvents = Array.isArray(score.keyChanges)
    ? score.keyChanges
    : [];

  const normalized = sourceEvents
    .filter((event) => event && typeof event === 'object')
    .map((event) => ({
      measure: Math.max(0, Math.min(maxMeasure, Math.round(Number(event.measure || 0)))),
      fifths: normalizeFifths(event.fifths)
    }))
    .sort((a, b) => a.measure - b.measure);

  const deduped = [];
  for (const event of normalized) {
    if (deduped.length && deduped.at(-1).measure === event.measure) {
      deduped[deduped.length - 1] = event;
      continue;
    }
    deduped.push(event);
  }

  const firstEvent = deduped.find((event) => event.measure === 0) || null;
  const initialFifths = normalizeFifths(firstEvent?.fifths ?? score?.key?.fifths ?? 0);
  if (!deduped.length || deduped[0].measure !== 0) {
    deduped.unshift({ measure: 0, fifths: initialFifths });
  }

  deduped[0].fifths = initialFifths;
  return deduped;
}

function normalizeTuplet(tuplet) {
  if (!tuplet || typeof tuplet !== 'object') return null;
  const count = Math.round(Number(tuplet.count));
  if (!Number.isFinite(count) || count < 2) return null;
  const index = Math.min(count, Math.max(1, Math.round(Number(tuplet.index || 1))));
  return {
    groupId: String(tuplet.groupId || uid()),
    count,
    index
  };
}

export function normalizeScore(score = {}, options = {}) {
  const defaultTitle = options.defaultTitle || 'Untitled';
  const measures = Math.max(1, Number(score.measures || 4));
  const timeSignature = score.timeSignature || { beats: 4, beatType: 4 };
  const keyChanges = normalizeKeyChanges(score, measures);
  return {
    title: score.title || defaultTitle,
    composer: score.composer || '',
    clef: normalizeClef(score.clef),
    key: { fifths: keyChanges[0].fifths },
    keyChanges,
    tempo: Number(score.tempo || 90),
    measures,
    timeSignature: {
      beats: Number(timeSignature.beats || 4),
      beatType: Number(timeSignature.beatType || 4)
    },
    notes: Array.isArray(score.notes) ? score.notes.map((note) => ({
      id: note.id || uid(),
      measure: Number(note.measure || 0),
      beat: Number(note.beat || 0),
      duration: Number(note.duration || 1),
      displayDuration: Math.max(0.0625, Number(note.displayDuration || note.duration || 1)),
      tuplet: normalizeTuplet(note.tuplet),
      pitch: note.pitch ? {
        step: note.pitch.step || 'C',
        octave: Number.isFinite(note.pitch.octave) ? note.pitch.octave : 4,
        alter: Number(note.pitch.alter || 0)
      } : null,
      lyric: note.lyric || '',
      velocity: Number(note.velocity || 80),
      tieStart: !!note.tieStart,
      tieStop: !!note.tieStop,
      slurStart: !!note.slurStart,
      slurStop: !!note.slurStop
    })) : []
  };
}
