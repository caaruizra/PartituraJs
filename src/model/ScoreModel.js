import { MEASURE_EPSILON } from '../core/constants.js';
import { clamp, clone, uid } from '../core/utils.js';
import { normalizeClef } from '../music/clef.js';
import { noteSortValue } from '../music/pitch.js';
import { normalizeScore } from './normalizeScore.js';

export class ScoreModel {
  constructor(score, options = {}) {
    this.score = normalizeScore(score, options);
    this.normalizeAllMeasureBeats();
  }

  normalizeKeyChanges() {
    const maxMeasure = Math.max(0, this.score.measures - 1);
    const events = Array.isArray(this.score.keyChanges)
      ? this.score.keyChanges
        .filter((event) => event && typeof event === 'object')
        .map((event) => ({
          measure: clamp(Math.round(Number(event.measure || 0)), 0, maxMeasure),
          fifths: clamp(Math.round(Number(event.fifths || 0)), -7, 7)
        }))
      : [];

    events.sort((a, b) => a.measure - b.measure);
    const deduped = [];
    for (const event of events) {
      if (deduped.length && deduped.at(-1).measure === event.measure) {
        deduped[deduped.length - 1] = event;
      } else {
        deduped.push(event);
      }
    }

    const firstEvent = deduped.find((event) => event.measure === 0) || null;
    const initial = clamp(
      Math.round(Number(firstEvent?.fifths ?? this.score.key?.fifths ?? 0)),
      -7,
      7
    );
    if (!deduped.length || deduped[0].measure !== 0) deduped.unshift({ measure: 0, fifths: initial });
    deduped[0].fifths = initial;
    this.score.keyChanges = deduped;
    this.score.key = { fifths: deduped[0].fifths };
  }

  hasKeyChangeAtMeasure(measure) {
    const target = clamp(Math.round(Number(measure || 0)), 0, this.score.measures - 1);
    return (this.score.keyChanges || []).some((event) => event.measure === target);
  }

  getKeyAtMeasure(measure) {
    const target = clamp(Math.round(Number(measure || 0)), 0, this.score.measures - 1);
    let active = clamp(Math.round(Number(this.score.key?.fifths || 0)), -7, 7);
    for (const event of this.score.keyChanges || []) {
      if (event.measure > target) break;
      active = clamp(Math.round(Number(event.fifths || 0)), -7, 7);
    }
    return active;
  }

  setKeyAtMeasure(measure, fifths) {
    const target = clamp(Math.round(Number(measure || 0)), 0, this.score.measures - 1);
    const normalizedFifths = clamp(Math.round(Number(fifths || 0)), -7, 7);
    const keyChanges = Array.isArray(this.score.keyChanges) ? [...this.score.keyChanges] : [];
    const idx = keyChanges.findIndex((event) => event.measure === target);
    if (idx >= 0) keyChanges[idx] = { measure: target, fifths: normalizedFifths };
    else keyChanges.push({ measure: target, fifths: normalizedFifths });
    this.score.keyChanges = keyChanges;
    this.normalizeKeyChanges();
    return normalizedFifths;
  }

  normalizeTuplet(tuplet, fallback = {}) {
    if (!tuplet || typeof tuplet !== 'object') return null;
    const count = Math.round(Number(tuplet.count));
    if (!Number.isFinite(count) || count < 2) return null;
    const index = clamp(Math.round(Number(tuplet.index || 1)), 1, count);
    return {
      groupId: String(tuplet.groupId || fallback.groupId || uid()),
      count,
      index
    };
  }

  measureNotes(measure) {
    return this.score.notes
      .filter((note) => note.measure === measure)
      .sort((a, b) => (a.beat - b.beat) || (noteSortValue(a) - noteSortValue(b)));
  }

  normalizeMeasureBeats(measure) {
    const notes = this.measureNotes(measure);
    const maxBeat = this.score.timeSignature.beats - 0.25;
    let cursor = 0;
    for (const note of notes) {
      note.beat = clamp(cursor, 0, maxBeat);
      cursor += note.duration;
    }
  }

  normalizeAllMeasureBeats() {
    for (let measure = 0; measure < this.score.measures; measure++) {
      this.normalizeMeasureBeats(measure);
    }
    this.sort();
  }

  measureTotal(measure, excludeId = null) {
    return this.score.notes
      .filter((note) => note.measure === measure && note.id !== excludeId)
      .reduce((sum, note) => sum + note.duration, 0);
  }

  canFitInMeasure(measure, duration, excludeId = null) {
    const beats = this.score.timeSignature.beats;
    const total = this.measureTotal(measure, excludeId);
    return total + duration <= beats + MEASURE_EPSILON;
  }

  measureValidation() {
    const beats = this.score.timeSignature.beats;
    return Array.from({ length: this.score.measures }, (_, measure) => {
      const total = this.measureTotal(measure);
      const exceeds = total > beats + MEASURE_EPSILON;
      const complete = Math.abs(total - beats) <= MEASURE_EPSILON;
      return {
        measure,
        total,
        exceeds,
        complete,
        invalid: !complete
      };
    });
  }

  shiftNotesOnInsert(measure, fromBeat, delta) {
    if (delta <= 0) return;
    const maxBeat = this.score.timeSignature.beats - 0.25;
    const notesInMeasure = this.score.notes
      .filter((note) => note.measure === measure && note.beat >= fromBeat)
      .sort((a, b) => b.beat - a.beat);
    for (const note of notesInMeasure) {
      note.beat = clamp(note.beat + delta, 0, maxBeat);
    }
  }

  addNote(note) {
    const next = {
      id: note.id || uid(),
      measure: clamp(Number(note.measure || 0), 0, this.score.measures - 1),
      beat: Math.max(0, Number(note.beat || 0)),
      duration: Math.max(0.0625, Number(note.duration || 1)),
      displayDuration: Math.max(0.0625, Number(note.displayDuration || note.duration || 1)),
      tuplet: this.normalizeTuplet(note.tuplet),
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
    };
    next.beat = clamp(next.beat, 0, this.score.timeSignature.beats - 0.25);
    if (!this.canFitInMeasure(next.measure, next.duration)) return null;
    this.shiftNotesOnInsert(next.measure, next.beat, next.duration);
    this.score.notes.push(next);
    this.normalizeMeasureBeats(next.measure);
    this.normalizeLigatures();
    this.sort();
    return next;
  }

  updateNote(id, patch) {
    const note = this.getNote(id);
    if (!note) return null;
    const previousMeasure = note.measure;
    const nextMeasure = clamp(
      Number(Object.hasOwn(patch, 'measure') ? patch.measure : note.measure),
      0,
      this.score.measures - 1
    );
    const nextBeat = clamp(
      Number(Object.hasOwn(patch, 'beat') ? patch.beat : note.beat),
      0,
      this.score.timeSignature.beats - 0.25
    );
    const nextDuration = Math.max(
      0.0625,
      Number(Object.hasOwn(patch, 'duration') ? patch.duration : note.duration || 1)
    );
    const nextDisplayDuration = Math.max(
      0.0625,
      Number(Object.hasOwn(patch, 'displayDuration') ? patch.displayDuration : (note.displayDuration || note.duration || 1))
    );
    if (!this.canFitInMeasure(nextMeasure, nextDuration, id)) return null;

    Object.assign(note, patch);
    if (Object.hasOwn(patch, 'pitch')) {
      if (!patch.pitch) note.pitch = null;
      else if (note.pitch) note.pitch = { ...note.pitch, ...patch.pitch };
      else note.pitch = { ...patch.pitch };
    }
    if (Object.hasOwn(patch, 'tuplet')) note.tuplet = this.normalizeTuplet(patch.tuplet, note.tuplet || {});
    note.measure = nextMeasure;
    note.beat = nextBeat;
    note.duration = nextDuration;
    note.displayDuration = nextDisplayDuration;
    if (Object.hasOwn(patch, 'tieStart')) note.tieStart = !!patch.tieStart;
    if (Object.hasOwn(patch, 'tieStop')) note.tieStop = !!patch.tieStop;
    if (Object.hasOwn(patch, 'slurStart')) note.slurStart = !!patch.slurStart;
    if (Object.hasOwn(patch, 'slurStop')) note.slurStop = !!patch.slurStop;
    this.normalizeMeasureBeats(nextMeasure);
    if (previousMeasure !== nextMeasure) this.normalizeMeasureBeats(previousMeasure);
    this.normalizeLigatures();
    this.sort();
    return note;
  }

  replaceNoteWithTuplet(id, count) {
    const source = this.getNote(id);
    const tupletCount = Math.round(Number(count));
    if (!source || !Number.isFinite(tupletCount) || tupletCount < 2) return null;

    const unitDuration = source.duration / tupletCount;
    if (unitDuration < 0.0625 - MEASURE_EPSILON) return null;
    const sourceDisplayDuration = Math.max(0.0625, Number(source.displayDuration || source.duration || 1));
    const displayDuration = tupletCount <= 2
      ? sourceDisplayDuration
      : Math.max(0.0625, sourceDisplayDuration / (tupletCount - 1));

    const groupId = uid();
    const created = Array.from({ length: tupletCount }, (_, index) => ({
      id: uid(),
      measure: source.measure,
      beat: source.beat + (index * unitDuration),
      duration: unitDuration,
      displayDuration,
      tuplet: {
        groupId,
        count: tupletCount,
        index: index + 1
      },
      pitch: source.pitch ? {
        step: source.pitch.step,
        octave: source.pitch.octave,
        alter: source.pitch.alter || 0
      } : null,
      lyric: index === 0 ? (source.lyric || '') : '',
      velocity: Number(source.velocity || 80),
      tieStart: false,
      tieStop: false,
      slurStart: false,
      slurStop: false
    }));

    this.score.notes = this.score.notes.filter((note) => note.id !== id);
    this.score.notes.push(...created);
    this.normalizeMeasureBeats(source.measure);
    this.normalizeLigatures();
    this.sort();
    return created;
  }

  normalizeLigatures() {
    const ordered = [...this.score.notes]
      .sort((a, b) => (a.measure - b.measure) || (a.beat - b.beat) || (noteSortValue(a) - noteSortValue(b)));

    const openTieByPitch = new Map();
    const openSlurs = [];

    const pitchKey = (note) => `${note.pitch.step}:${note.pitch.alter || 0}:${note.pitch.octave}`;
    const handleTieStop = (note) => {
      const queue = openTieByPitch.get(pitchKey(note)) || [];
      if (!queue.length) note.tieStop = false;
      else queue.shift();
    };
    const handleTieStart = (note) => {
      const queue = openTieByPitch.get(pitchKey(note)) || [];
      queue.push(note.id);
      openTieByPitch.set(pitchKey(note), queue);
    };
    const handleSlurStop = (note) => {
      if (!openSlurs.length) note.slurStop = false;
      else openSlurs.pop();
    };

    for (const note of ordered) {
      if (!note.pitch) {
        note.tieStart = false;
        note.tieStop = false;
      }

      if (note.tieStop && note.pitch) handleTieStop(note);
      if (note.tieStart && note.pitch) handleTieStart(note);
      if (note.slurStop) handleSlurStop(note);

      if (note.slurStart) openSlurs.push(note.id);
    }
  }

  removeNote(id) {
    const note = this.getNote(id);
    if (!note) return false;
    const measure = note.measure;
    const before = this.score.notes.length;
    this.score.notes = this.score.notes.filter((n) => n.id !== id);
    if (this.score.notes.length !== before) {
      this.normalizeMeasureBeats(measure);
      this.normalizeLigatures();
      return true;
    }
    return false;
  }

  removeNotes(ids) {
    const measures = new Set(
      this.score.notes
        .filter((note) => ids.includes(note.id))
        .map((note) => note.measure)
    );
    const set = new Set(ids);
    this.score.notes = this.score.notes.filter((note) => !set.has(note.id));
    for (const measure of measures) this.normalizeMeasureBeats(measure);
    this.normalizeLigatures();
  }

  getNote(id) {
    return this.score.notes.find((note) => note.id === id) || null;
  }

  setScore(score, options = {}) {
    this.score = normalizeScore(score, options);
    this.normalizeAllMeasureBeats();
    this.normalizeKeyChanges();
  }

  setClef(clef) {
    this.score.clef = normalizeClef(clef);
    return this.score.clef;
  }

  insertMeasure(index) {
    const insertAt = clamp(Number(index || 0), 0, this.score.measures);
    const inheritedFifths = this.getKeyAtMeasure(Math.min(insertAt, this.score.measures - 1));
    for (const note of this.score.notes) {
      if (note.measure >= insertAt) note.measure += 1;
    }
    this.score.keyChanges = (this.score.keyChanges || []).map((event) => (
      event.measure >= insertAt
        ? { ...event, measure: event.measure + 1 }
        : event
    ));
    this.score.measures += 1;
    this.setKeyAtMeasure(insertAt, inheritedFifths);
    this.normalizeKeyChanges();
    this.sort();
    return insertAt;
  }

  removeMeasure(index) {
    if (this.score.measures <= 1) return false;
    const removeAt = clamp(Number(index || 0), 0, this.score.measures - 1);
    this.score.notes = this.score.notes.filter((note) => note.measure !== removeAt);
    for (const note of this.score.notes) {
      if (note.measure > removeAt) note.measure -= 1;
    }
    this.score.keyChanges = (this.score.keyChanges || [])
      .filter((event) => event.measure !== removeAt)
      .map((event) => (
        event.measure > removeAt
          ? { ...event, measure: event.measure - 1 }
          : event
      ));
    this.score.measures -= 1;
    this.normalizeAllMeasureBeats();
    this.normalizeKeyChanges();
    this.normalizeLigatures();
    return true;
  }

  toJSON() {
    return clone(this.score);
  }

  sort() {
    this.score.notes.sort((a, b) => (a.measure - b.measure) || (a.beat - b.beat) || (noteSortValue(a) - noteSortValue(b)));
  }
}
