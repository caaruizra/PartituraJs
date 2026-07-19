import { noteSortValue } from '../music/pitch.js';
import { durationFlagCount } from '../music/duration.js';

function clampSlope(value, maxAbs = 0.35) {
  const limit = Math.max(0, Number(maxAbs) || 0.35);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-limit, Math.min(limit, value));
}

export function buildMeasureLayout(editor) {
  const score = editor.model.score;
  const minSlotWidth = 30;
  const starts = [];
  const widths = [];
  const notesByMeasure = Array.from({ length: score.measures }, () => []);
  const noteXById = new Map();
  const measureBaseWidths = [];
  const measureFirstWidths = [];
  const systems = [];
  const measureToSystem = [];
  const availableWidth = Math.max(
    editor.options.staffLeft + 240,
    (editor.canvas?.clientWidth || editor.options.width || 960) - 24
  );
  const lineWidth = Math.max(240, availableWidth - editor.options.staffLeft);
  let cursor = editor.options.staffLeft;
  let currentSystem = null;

  for (const note of score.notes) {
    if (note.measure >= 0 && note.measure < score.measures) notesByMeasure[note.measure].push(note);
  }

  for (let measure = 0; measure < score.measures; measure++) {
    const notes = notesByMeasure[measure];
    const baseWidth = Math.max(editor.options.measureWidth, 42 + (notes.length + 1) * minSlotWidth);
    measureBaseWidths[measure] = baseWidth;
    measureFirstWidths[measure] = Math.max(baseWidth, 90 + 42 + (notes.length + 1) * minSlotWidth);
  }

  const startNewSystem = () => {
    currentSystem = {
      index: systems.length,
      measureIndices: [],
      staffTop: editor.options.staffTop + systems.length * (editor.options.staffHeight + 40),
      staffRight: editor.options.staffLeft
    };
    systems.push(currentSystem);
    cursor = editor.options.staffLeft;
  };

  startNewSystem();

  for (let measure = 0; measure < score.measures; measure++) {
    const notes = notesByMeasure[measure];
    notes.sort((a, b) => (a.beat - b.beat) || (noteSortValue(a) - noteSortValue(b)));
    const isSystemStart = currentSystem.measureIndices.length === 0;
    const dynamicWidth = isSystemStart ? measureFirstWidths[measure] : measureBaseWidths[measure];
    if (!isSystemStart && currentSystem.measureIndices.length > 0 && cursor + dynamicWidth > availableWidth) {
      startNewSystem();
    }

    const systemMeasureStart = currentSystem.measureIndices.length === 0;
    const measureWidth = systemMeasureStart ? measureFirstWidths[measure] : measureBaseWidths[measure];
    starts[measure] = cursor;
    widths[measure] = measureWidth;
    measureToSystem[measure] = currentSystem.index;
    currentSystem.measureIndices.push(measure);

    cursor += measureWidth;
    currentSystem.staffRight = cursor;
  }

  for (const system of systems) {
    const systemWidth = system.measureIndices.reduce((sum, measure) => sum + widths[measure], 0);
    const extraWidth = Math.max(0, lineWidth - systemWidth);
    if (extraWidth > 0 && system.measureIndices.length > 0) {
      const widthIncrement = extraWidth / system.measureIndices.length;
      let offset = 0;
      for (const measure of system.measureIndices) {
        starts[measure] += offset;
        widths[measure] += widthIncrement;
        offset += widthIncrement;
      }
    }
    system.staffRight = editor.options.staffLeft + Math.max(lineWidth, systemWidth);
  }

  for (const system of systems) {
    const systemStartMeasure = system.measureIndices[0];
    for (const measure of system.measureIndices) {
      const notes = notesByMeasure[measure];
      const isSystemStart = measure === systemStartMeasure;
      const leadingInset = isSystemStart ? 90 : 26;
      const trailingInset = isSystemStart ? 20 : 16;
      const usableStart = starts[measure] + leadingInset;
      const usableWidth = Math.max(24, widths[measure] - leadingInset - trailingInset);
      const gap = usableWidth / (notes.length + 1);
      for (let i = 0; i < notes.length; i++) {
        noteXById.set(notes[i].id, usableStart + gap * (i + 1));
      }
    }
  }

  return {
    starts,
    widths,
    notesByMeasure,
    noteXById,
    systems,
    measureToSystem,
    staffRight: systems.length ? Math.max(...systems.map((system) => system.staffRight)) : cursor
  };
}

export function beatToX(editor, measure, beat) {
  const layout = editor.measureLayout || buildMeasureLayout(editor);
  const measureX = layout.starts[measure] ?? editor.options.staffLeft;
  const measureWidth = layout.widths[measure] ?? editor.options.measureWidth;
  const isSystemStart = (layout.systems || []).some((system) => system.measureIndices?.[0] === measure);
  const leadingInset = isSystemStart ? 90 : 26;
  const trailingInset = isSystemStart ? 20 : 16;
  const usableStart = measureX + leadingInset;
  const usableWidth = Math.max(24, measureWidth - leadingInset - trailingInset);
  return usableStart + (beat / editor.model.score.timeSignature.beats) * usableWidth;
}

export function noteToX(editor, note) {
  const x = editor.measureLayout?.noteXById?.get(note.id);
  if (Number.isFinite(x)) return x;
  return beatToX(editor, note.measure, note.beat);
}

export function buildBeamLayout(editor, staffTop, measureFilter = null) {
  const score = editor.model.score;
  const beatUnit = 4 / score.timeSignature.beatType;
  const epsilon = 1e-6;
  const notesByMeasure = Array.from({ length: score.measures }, () => []);
  const noteBeamInfo = new Map();
  const groups = [];

  for (const note of score.notes) {
    const visualDuration = note.displayDuration || note.duration;
    if (durationFlagCount(visualDuration) < 1 || !note.pitch) continue;
    if (Array.isArray(measureFilter) && !measureFilter.includes(note.measure)) continue;
    if (note.measure >= 0 && note.measure < score.measures) notesByMeasure[note.measure].push(note);
  }

  for (let measure = 0; measure < score.measures; measure++) {
    const notes = notesByMeasure[measure]
      .sort((a, b) => (a.beat - b.beat) || (noteSortValue(a) - noteSortValue(b)));
    if (!notes.length) continue;

    const chunks = [];
    let chunk = [];
    let chunkBeatSlot = -1;
    let previousEnd = -1;

    const flushChunk = () => {
      if (chunk.length >= 2) chunks.push(chunk);
      chunk = [];
      chunkBeatSlot = -1;
      previousEnd = -1;
    };

    for (const current of notes) {
      const start = current.beat;
      const end = current.beat + current.duration;
      const beatSlot = Math.floor((start + epsilon) / beatUnit);
      const slotEnd = (beatSlot + 1) * beatUnit;
      const crossesBeat = end > slotEnd + epsilon;

      if (crossesBeat) {
        flushChunk();
        continue;
      }

      if (!chunk.length) {
        chunk = [current];
        chunkBeatSlot = beatSlot;
        previousEnd = end;
        continue;
      }

      const contiguous = Math.abs(start - previousEnd) <= 0.125 + epsilon;
      if (beatSlot !== chunkBeatSlot || !contiguous) {
        flushChunk();
        chunk = [current];
        chunkBeatSlot = beatSlot;
        previousEnd = end;
        continue;
      }

      chunk.push(current);
      previousEnd = end;
    }
    flushChunk();

    for (const group of chunks) {
      const points = group.map((note) => ({
        id: note.id,
        x: noteToX(editor, note),
        y: editor.pitchToY(note.pitch, staffTop),
        beams: durationFlagCount(note.displayDuration || note.duration)
      }));
      const avgY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const stemUp = avgY >= staffTop + 2 * editor.options.staffSpacing;
      const naturalStart = stemUp ? points[0].y - 36 : points[0].y + 36;
      const naturalEnd = stemUp ? points[points.length - 1].y - 36 : points[points.length - 1].y + 36;
      const deltaX = Math.max(1, points[points.length - 1].x - points[0].x);
      const slope = clampSlope((naturalEnd - naturalStart) / deltaX, 0.35);
      const stemPoints = points.map((point) => {
        const beamY = naturalStart + slope * (point.x - points[0].x);
        return {
          ...point,
          stemUp,
          stemX: stemUp ? point.x + 7 : point.x - 7,
          stemEnd: beamY
        };
      });
      stemPoints.beamSlope = slope;
      stemPoints.stemUp = stemUp;

      for (const point of stemPoints) {
        noteBeamInfo.set(point.id, {
          beamed: true,
          stemUp: point.stemUp,
          stemX: point.stemX,
          stemEnd: point.stemEnd,
          beams: point.beams,
          beamSlope: slope
        });
      }
      groups.push(stemPoints);
    }
  }

  return { noteBeamInfo, groups };
}
