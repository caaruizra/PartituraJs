import { clefConfig } from '../music/clef.js';
import { noteSortValue } from '../music/pitch.js';
import { createSvg } from './svg.js';

function noteOrder(a, b) {
  return (a.measure - b.measure) || (a.beat - b.beat) || (noteSortValue(a) - noteSortValue(b));
}

function pitchKey(note) {
  if (!note.pitch) return '';
  return `${note.pitch.step}:${note.pitch.alter || 0}:${note.pitch.octave}`;
}

function buildLigaturePairs(score) {
  const ordered = [...score.notes].sort(noteOrder);
  const ties = [];
  const slurs = [];
  const openTieByPitch = new Map();
  const openSlurs = [];

  const handleTieStop = (note) => {
    const queue = openTieByPitch.get(pitchKey(note)) || [];
    const from = queue.shift();
    if (from) ties.push({ from: from.id, to: note.id });
  };
  const handleTieStart = (note) => {
    const queue = openTieByPitch.get(pitchKey(note)) || [];
    queue.push(note);
    openTieByPitch.set(pitchKey(note), queue);
  };
  const handleSlurStop = (note) => {
    const from = openSlurs.pop();
    if (from) slurs.push({ from: from.id, to: note.id });
  };

  for (const note of ordered) {
    if (note.tieStop && note.pitch) handleTieStop(note);
    if (note.tieStart && note.pitch) handleTieStart(note);
    if (note.slurStop) handleSlurStop(note);

    if (note.slurStart) openSlurs.push(note);
  }

  return { ties, slurs };
}

function buildSystemMap(systems) {
  const map = new Map();
  for (let idx = 0; idx < systems.length; idx++) {
    for (const measure of systems[idx].measureIndices) map.set(measure, idx);
  }
  return map;
}

function buildArcPath(x1, y1, x2, y2, arcHeight, direction) {
  const midX = (x1 + x2) / 2;
  const midpointY = (y1 + y2) / 2;
  const controlY = midpointY + (direction === 'up' ? -arcHeight : arcHeight);
  return `M ${x1} ${y1} Q ${midX} ${controlY} ${x2} ${y2}`;
}

function drawLigatureSegment(group, segment) {
  if (!Number.isFinite(segment.fromX) || !Number.isFinite(segment.toX) || segment.toX - segment.fromX < 10) return;
  group.appendChild(createSvg('path', {
    d: buildArcPath(segment.fromX, segment.fromY, segment.toX, segment.toY, segment.arcHeight, segment.direction),
    class: segment.cssClass
  }));
}

function drawLigatures(editor, system, systemIndex, systemMap, pairs, notesById, ligatureType) {
  const group = createSvg('g', { class: `partitura-ligatures partitura-${ligatureType}-group` });
  const top = system.staffTop;
  const left = editor.options.staffLeft;
  const startMeasure = system.measureIndices[0];
  const endMeasure = system.measureIndices[system.measureIndices.length - 1];
  const systemLeft = editor.measureLayout.starts[startMeasure];
  const systemRight = editor.measureLayout.starts[endMeasure] + editor.measureLayout.widths[endMeasure];
  const noteOffset = ligatureType === 'tie' ? 7 : 18;
  const arcHeight = ligatureType === 'tie' ? 12 : 20;
  const direction = ligatureType === 'tie' ? 'down' : 'up';
  const cssClass = ligatureType === 'tie' ? 'partitura-tie' : 'partitura-slur';

  const drawSegment = (fromX, toX, fromY, toY) => {
    drawLigatureSegment(group, {
      fromX,
      toX,
      fromY,
      toY,
      cssClass,
      direction,
      arcHeight
    });
  };

  const resolveSegment = (from, to, fromSystem, toSystem, fromY, toY) => {
    const centerY = top + 2 * editor.options.staffSpacing;
    const startX = Math.max(left + 8, systemLeft + 6);
    if (fromSystem === toSystem && systemIndex === fromSystem) {
      return { fromX: editor.noteToX(from) + 8, toX: editor.noteToX(to) - 8, fromY, toY };
    }
    if (systemIndex === fromSystem) {
      return { fromX: editor.noteToX(from) + 8, toX: systemRight - 6, fromY, toY: fromY };
    }
    if (systemIndex === toSystem) {
      return { fromX: startX, toX: editor.noteToX(to) - 8, fromY: toY, toY };
    }
    return { fromX: startX, toX: systemRight - 6, fromY: centerY, toY: centerY };
  };

  for (const pair of pairs) {
    const from = notesById.get(pair.from);
    const to = notesById.get(pair.to);
    if (!from?.pitch || !to?.pitch) continue;

    const fromSystem = systemMap.get(from.measure);
    const toSystem = systemMap.get(to.measure);
    if (fromSystem === undefined || toSystem === undefined) continue;
    if (systemIndex < fromSystem || systemIndex > toSystem) continue;

    const fromY = editor.pitchToY(from.pitch, top) + (direction === 'up' ? -noteOffset : noteOffset);
    const toY = editor.pitchToY(to.pitch, top) + (direction === 'up' ? -noteOffset : noteOffset);
    const segment = resolveSegment(from, to, fromSystem, toSystem, fromY, toY);
    drawSegment(segment.fromX, segment.toX, segment.fromY, segment.toY);
  }

  return group;
}

function collectTupletGroupsForSystem(editor, systemMeasures, staffTop) {
  const measureSet = new Set(systemMeasures);
  const groups = new Map();
  for (const note of editor.model.score.notes) {
    if (!measureSet.has(note.measure) || !note.tuplet?.groupId) continue;
    const key = note.tuplet.groupId;
    const list = groups.get(key) || [];
    list.push(note);
    groups.set(key, list);
  }

  const result = [];
  for (const notes of groups.values()) {
    notes.sort(noteOrder);
    if (notes.length < 2) continue;
    const fromX = editor.noteToX(notes[0]);
    const toX = editor.noteToX(notes[notes.length - 1]);
    if (!Number.isFinite(fromX) || !Number.isFinite(toX) || toX - fromX < 8) continue;
    const count = Math.round(Number(notes[0].tuplet?.count || notes.length));
    if (!Number.isFinite(count) || count < 2) continue;
    const anchorY = Math.min(...notes.map((note) => (
      note.pitch ? editor.pitchToY(note.pitch, staffTop) : editor.restY(staffTop)
    )));
    result.push({
      fromX,
      toX,
      y: anchorY - 44,
      count
    });
  }
  return result;
}

function drawTuplets(editor, systemMeasures, staffTop) {
  const group = createSvg('g', { class: 'partitura-tuplets' });
  const tuplets = collectTupletGroupsForSystem(editor, systemMeasures, staffTop);
  for (const tuplet of tuplets) {
    const left = tuplet.fromX - 9;
    const right = tuplet.toX + 9;
    const y = tuplet.y;
    const center = (left + right) / 2;
    group.appendChild(createSvg('line', {
      x1: left,
      y1: y,
      x2: center - 10,
      y2: y,
      class: 'partitura-tuplet-bracket'
    }));
    group.appendChild(createSvg('line', {
      x1: center + 10,
      y1: y,
      x2: right,
      y2: y,
      class: 'partitura-tuplet-bracket'
    }));
    group.appendChild(createSvg('line', {
      x1: left,
      y1: y,
      x2: left,
      y2: y + 6,
      class: 'partitura-tuplet-bracket'
    }));
    group.appendChild(createSvg('line', {
      x1: right,
      y1: y,
      x2: right,
      y2: y + 6,
      class: 'partitura-tuplet-bracket'
    }));
    group.appendChild(createSvg('text', {
      x: center,
      y: y - 3,
      'text-anchor': 'middle',
      class: 'partitura-tuplet-number'
    }, String(tuplet.count)));
  }
  return group;
}

export function drawScore(editor) {
  editor.svg.innerHTML = '';
  const s = editor.options;
  const score = editor.model.score;
  const left = s.staffLeft;
  editor.measureLayout = editor.buildMeasureLayout();
  const measureValidation = editor.model.measureValidation();
  const ligatures = buildLigaturePairs(score);
  const notesById = new Map(score.notes.map((note) => [note.id, note]));
  const systems = editor.measureLayout.systems || [];
  const systemMap = buildSystemMap(systems);
  const staffRight = editor.measureLayout.staffRight;
  const canvasWidth = Math.max(editor.canvas?.clientWidth || editor.options.width, staffRight + 40);
  const lastSystem = systems.at(-1) || { staffTop: s.staffTop };
  const height = lastSystem.staffTop + s.staffHeight + 50;
  const width = canvasWidth;
  editor.svg.setAttribute('width', width);
  editor.svg.setAttribute('height', height);
  editor.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const titleNode = createSvg('text', {
    x: left,
    y: 26,
    class: 'partitura-title'
  }, score.title || '');
  titleNode.addEventListener('dblclick', () => editor.editTitle());
  editor.svg.appendChild(titleNode);

  if (score.composer) {
    editor.svg.appendChild(createSvg('text', {
      x: staffRight,
      y: 26,
      class: 'partitura-composer',
      'text-anchor': 'end'
    }, score.composer));
  }

  for (let systemIndex = 0; systemIndex < systems.length; systemIndex++) {
    const system = systems[systemIndex];
    const top = system.staffTop;
    const bottomLine = editor.bottomLineY(top);
    const systemMeasures = system.measureIndices;
    const beamLayout = editor.buildBeamLayout(top, systemMeasures);
    const systemStart = systemMeasures[0];
    const systemEnd = systemMeasures[systemMeasures.length - 1];
    const systemRight = editor.measureLayout.starts[systemEnd] + editor.measureLayout.widths[systemEnd];

    if (editor.selectedMeasure !== null && systemMeasures.includes(editor.selectedMeasure)) {
      editor.svg.appendChild(createSvg('rect', {
        x: editor.measureLayout.starts[editor.selectedMeasure] + 1,
        y: top - 4,
        width: editor.measureLayout.widths[editor.selectedMeasure] - 2,
        height: 4 * s.staffSpacing + 8,
        class: 'partitura-measure-selected'
      }));
    }

    for (const measure of systemMeasures) {
      if (!measureValidation[measure]?.invalid) continue;
      editor.svg.appendChild(createSvg('rect', {
        x: editor.measureLayout.starts[measure] + 1,
        y: top - 4,
        width: editor.measureLayout.widths[measure] - 2,
        height: 4 * s.staffSpacing + 8,
        class: 'partitura-measure-invalid'
      }));
    }

    for (let line = 0; line < 5; line++) {
      editor.svg.appendChild(createSvg('line', {
        x1: left,
        y1: top + line * s.staffSpacing,
        x2: systemRight,
        y2: top + line * s.staffSpacing,
        class: 'partitura-staff-line'
      }));
    }

    for (const measure of systemMeasures) {
      editor.svg.appendChild(createSvg('line', {
        x1: editor.measureLayout.starts[measure],
        y1: top,
        x2: editor.measureLayout.starts[measure],
        y2: top + 4 * s.staffSpacing,
        class: 'partitura-bar-line'
      }));
    }
    editor.svg.appendChild(createSvg('line', {
      x1: systemRight,
      y1: top,
      x2: systemRight,
      y2: top + 4 * s.staffSpacing,
      class: 'partitura-bar-line'
    }));

    editor.svg.appendChild(createSvg('text', {
      x: editor.measureLayout.starts[systemStart] + 55,
      y: top + 48,
      'text-anchor': 'middle',
      class: 'partitura-clef'
    }, clefConfig(score.clef).glyph));

    editor.svg.appendChild(createSvg('text', {
      x: editor.measureLayout.starts[systemStart] + 48,
      y: top + 25,
      class: 'partitura-time'
    }, String(score.timeSignature.beats)));
    editor.svg.appendChild(createSvg('text', {
      x: editor.measureLayout.starts[systemStart] + 48,
      y: top + 44,
      class: 'partitura-time'
    }, String(score.timeSignature.beatType)));

    const beatGuideGroup = createSvg('g', { class: 'partitura-beat-guides' });
    for (const measure of systemMeasures) {
      for (let b = 1; b < score.timeSignature.beats; b++) {
        const x = editor.beatToX(measure, b);
        beatGuideGroup.appendChild(createSvg('line', {
          x1: x,
          y1: top - 6,
          x2: x,
          y2: top + 4 * s.staffSpacing + 6,
          class: 'partitura-beat-guide'
        }));
      }
    }
    editor.svg.appendChild(beatGuideGroup);

    const hit = createSvg('rect', {
      x: left,
      y: top - 28,
      width: systemRight - left,
      height: s.staffHeight,
      fill: 'transparent',
      class: 'partitura-hit-area'
    });
    hit.addEventListener('pointerdown', (event) => editor.onCanvasPointerDown(event));
    hit.addEventListener('contextmenu', (event) => editor.onCanvasContextMenu(event));
    hit.addEventListener('dragover', (event) => {
      event.preventDefault();
    });
    hit.addEventListener('drop', (event) => editor.onCanvasDrop(event));
    editor.svg.appendChild(hit);

    const notesGroup = createSvg('g', { class: 'partitura-notes' });
    for (const measure of systemMeasures) {
      for (const note of score.notes) {
        if (note.measure !== measure) continue;
        notesGroup.appendChild(editor.drawNote(note, bottomLine, beamLayout.noteBeamInfo, top));
      }
    }
    notesGroup.appendChild(editor.drawBeams(beamLayout.groups));
    notesGroup.appendChild(drawTuplets(editor, systemMeasures, top));
    editor.svg.appendChild(notesGroup);

    const tieGroup = drawLigatures(editor, system, systemIndex, systemMap, ligatures.ties, notesById, 'tie');
    const slurGroup = drawLigatures(editor, system, systemIndex, systemMap, ligatures.slurs, notesById, 'slur');
    editor.svg.appendChild(tieGroup);
    editor.svg.appendChild(slurGroup);
  }

  if (editor.selectionBox) {
    editor.svg.appendChild(createSvg('rect', {
      x: editor.selectionBox.x,
      y: editor.selectionBox.y,
      width: editor.selectionBox.width,
      height: editor.selectionBox.height,
      class: 'partitura-marquee-selection'
    }));
  }

  if (editor.playback) editor.updatePlaybackCursor();
}
