import { accidentalText } from '../music/accidental.js';
import {
  durationFlagCount,
  durationType,
  isDottedDuration,
  restGlyph
} from '../music/duration.js';
import { createSvg } from './svg.js';

export function drawRest(editor, note, x, staffTop = editor.options.staffTop) {
  const visualDuration = note.displayDuration || note.duration;
  const y = editor.restY(staffTop);
  const group = createSvg('g', {
    class: `partitura-note partitura-rest ${editor.selectedIds.has(note.id) ? 'is-selected' : ''}`,
    'data-note-id': note.id,
    tabindex: 0
  });

  if (editor.selectedIds.has(note.id)) {
    group.appendChild(createSvg('rect', {
      x: x - 16,
      y: y - 18,
      width: 32,
      height: 36,
      rx: 7,
      ry: 7,
      class: 'partitura-note-selection-box'
    }));
  }

  group.appendChild(createSvg('text', {
    x,
    y: y + 8,
    'text-anchor': 'middle',
    class: 'partitura-rest-glyph'
  }, restGlyph(visualDuration)));

  if (isDottedDuration(visualDuration)) {
    group.appendChild(createSvg('circle', {
      cx: x + 16,
      cy: y - 2,
      r: 2.6,
      class: 'partitura-note-dot'
    }));
  }

  group.addEventListener('pointerdown', (event) => editor.onNotePointerDown(event, note.id));
  group.addEventListener('contextmenu', (event) => editor.onNoteContextMenu(event, note.id));
  group.addEventListener('dblclick', () => editor.editNote(note.id));
  return group;
}

export function drawNote(editor, note, bottomLine, noteBeamInfo = null, staffTop = editor.options.staffTop) {
  const x = editor.noteToX(note);
  if (!note.pitch) return drawRest(editor, note, x, staffTop);
  const visualDuration = note.displayDuration || note.duration;
  const y = editor.pitchToY(note.pitch, staffTop);
  const group = createSvg('g', {
    class: `partitura-note ${editor.selectedIds.has(note.id) ? 'is-selected' : ''}`,
    'data-note-id': note.id,
    tabindex: 0
  });

  for (const ledgerY of editor.ledgerLinesForY(y, staffTop)) {
    group.appendChild(createSvg('line', {
      x1: x - 13,
      y1: ledgerY,
      x2: x + 13,
      y2: ledgerY,
      class: 'partitura-ledger-line'
    }));
  }

  const type = durationType(visualDuration);
  const filled = type !== 'whole' && type !== 'half';
  if (editor.selectedIds.has(note.id)) {
    group.appendChild(createSvg('rect', {
      x: x - 16,
      y: y - 22,
      width: 32,
      height: 44,
      rx: 7,
      ry: 7,
      class: 'partitura-note-selection-box'
    }));
  }
  if (isDottedDuration(visualDuration)) {
    group.appendChild(createSvg('circle', {
      cx: x + 14,
      cy: y - 1,
      r: 2.6,
      class: 'partitura-note-dot'
    }));
  }
  group.appendChild(createSvg('ellipse', {
    cx: x,
    cy: y,
    rx: 8,
    ry: 5,
    transform: `rotate(-25 ${x} ${y})`,
    class: filled ? 'partitura-notehead is-filled' : 'partitura-notehead'
  }));

  if (type !== 'whole') {
    const beamed = noteBeamInfo?.get(note.id) || null;
    const stemUp = beamed ? beamed.stemUp : y >= staffTop + 2 * editor.options.staffSpacing;
    const stemX = beamed ? beamed.stemX : (stemUp ? x + 8 : x - 8);
    const stemEnd = beamed ? beamed.stemEnd : (stemUp ? y - 40 : y + 40);
    group.appendChild(createSvg('line', {
      x1: stemX,
      y1: y,
      x2: stemX,
      y2: stemEnd,
      class: 'partitura-stem'
    }));
    if (!beamed) {
      const flags = durationFlagCount(visualDuration);
      for (let idx = 0; idx < flags; idx++) {
        const offset = idx * 8;
        const startY = stemUp ? stemEnd + offset : stemEnd - offset;
        group.appendChild(createSvg('path', {
          d: stemUp
            ? `M ${stemX} ${startY} q 18 7 5 20`
            : `M ${stemX} ${startY} q -18 -7 -5 -20`,
          class: 'partitura-flag'
        }));
      }
    }
  }

  const acc = accidentalText(note.pitch.alter || 0);
  if (acc) group.appendChild(createSvg('text', {
    x: x - 25,
    y: y + 5,
    class: 'partitura-accidental'
  }, acc));

  if (note.lyric) {
    group.appendChild(createSvg('text', {
      x,
      y: editor.options.staffTop + 4 * editor.options.staffSpacing + 36,
      'text-anchor': 'middle',
      class: 'partitura-lyric'
    }, note.lyric));
  }

  group.addEventListener('pointerdown', (event) => editor.onNotePointerDown(event, note.id));
  group.addEventListener('contextmenu', (event) => editor.onNoteContextMenu(event, note.id));
  group.addEventListener('dblclick', () => editor.editNote(note.id));
  return group;
}
