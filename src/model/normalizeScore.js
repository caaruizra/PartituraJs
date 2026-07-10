import { uid } from '../core/utils.js';
import { normalizeClef } from '../music/clef.js';

export function normalizeScore(score = {}) {
  const measures = Math.max(1, Number(score.measures || 4));
  const timeSignature = score.timeSignature || { beats: 4, beatType: 4 };
  return {
    title: score.title || 'Sin título',
    composer: score.composer || '',
    clef: normalizeClef(score.clef),
    key: score.key || { fifths: 0 },
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
