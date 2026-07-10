import { clone } from '../core/utils.js';
import { normalizeClef } from '../music/clef.js';

export function onCanvasContextMenu(editor, event) {
  if (editor.options.readonly) return;
  event.preventDefault();
  const point = editor.svgPoint(event);
  const position = editor.pointToMusicalPosition(point.x, point.y);
  editor.showContextMenu(position.measure, event);
  editor.drawScore();
}

export function onNoteContextMenu(editor, event, id) {
  if (editor.options.readonly) return;
  event.preventDefault();
  event.stopPropagation();
  const note = editor.model.getNote(id);
  if (!note) return;
  editor.showNoteContextMenu(id, event);
  editor.drawScore();
}

export function onCanvasPointerDown(editor, event) {
  if (editor.options.readonly) return;
  editor.hideContextMenu();
  if (event.target.closest('.partitura-note')) return;
  const point = editor.svgPoint(event);
  const position = editor.pointToMusicalPosition(point.x, point.y);
  editor.setSelectedMeasure(position.measure);
  if (editor.options.mode === 'select') {
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const baseSelectedIds = additive ? [...editor.selectedIds] : [];
    if (!additive) editor.clearSelection();
    editor.drag = {
      type: 'marquee',
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      moved: false,
      baseSelectedIds
    };
    editor.selectionBox = {
      x: point.x,
      y: point.y,
      width: 0,
      height: 0
    };
    editor.boundMove = (e) => editor.onPointerMove(e);
    editor.boundUp = () => editor.onPointerUp();
    window.addEventListener('pointermove', editor.boundMove);
    window.addEventListener('pointerup', editor.boundUp, { once: true });
    editor.drawScore();
    return;
  }
  editor.pushHistory();
  const note = editor.model.addNote({
    measure: position.measure,
    beat: position.beat,
    duration: editor.options.noteDuration,
    pitch: editor.options.noteKind === 'rest' ? null : position.pitch
  });
  if (!note) {
    editor.undoStack.pop();
    editor.drawScore();
    return;
  }
  editor.select(note.id, false);
  editor.emitChange();
  editor.playNote(note);
  editor.drawScore();
}

export function onCanvasDrop(editor, event) {
  if (editor.options.readonly) return;
  event.preventDefault();
  const raw = String(event.dataTransfer?.getData('text/plain') || '').trim().toLowerCase();
  if (!raw) return;
  if (!['sol', 'fa', 'do', 'g', 'f', 'c', 'treble', 'bass', 'alto', 'tenor'].includes(raw)) return;
  const clef = normalizeClef(raw);
  editor.pushHistory();
  editor.model.setClef(clef);
  editor.hideContextMenu();
  editor.emitChange();
  editor.updateToolbar();
  editor.updateMeasureToolbar();
  editor.drawScore();
}

export function onNotePointerDown(editor, event, id) {
  if (editor.options.readonly) return;
  editor.hideContextMenu();
  event.stopPropagation();
  const additive = event.shiftKey || event.metaKey || event.ctrlKey;
  editor.select(id, additive);
  const point = editor.svgPoint(event);
  const note = editor.model.getNote(id);
  if (note) editor.setSelectedMeasure(note.measure);
  editor.drag = {
    id,
    startX: point.x,
    startY: point.y,
    original: clone(note),
    moved: false
  };
  editor.pushHistory();
  editor.boundMove = (e) => editor.onPointerMove(e);
  editor.boundUp = () => editor.onPointerUp();
  window.addEventListener('pointermove', editor.boundMove);
  window.addEventListener('pointerup', editor.boundUp, { once: true });
  editor.drawScore();
}

export function onPointerMove(editor, event) {
  if (!editor.drag) return;
  const point = editor.svgPoint(event);
  const deltaX = Math.abs(point.x - editor.drag.startX);
  const deltaY = Math.abs(point.y - editor.drag.startY);
  if (deltaX + deltaY < 2) return;
  editor.drag.moved = true;

  if (editor.drag.type === 'marquee') {
    editor.drag.currentX = point.x;
    editor.drag.currentY = point.y;
    editor.selectionBox = {
      x: Math.min(editor.drag.startX, point.x),
      y: Math.min(editor.drag.startY, point.y),
      width: Math.abs(point.x - editor.drag.startX),
      height: Math.abs(point.y - editor.drag.startY)
    };
    updateMarqueeSelection(editor);
    editor.drawScore();
    return;
  }

  const position = editor.pointToMusicalPosition(point.x, point.y);
  const currentNote = editor.model.getNote(editor.drag.id);
  const updated = editor.model.updateNote(editor.drag.id, {
    measure: position.measure,
    beat: position.beat,
    pitch: currentNote?.pitch ? position.pitch : null
  });
  if (!updated) return;
  editor.emitChange(false);
  editor.drawScore();
}

export function onPointerUp(editor) {
  if (editor.boundMove) window.removeEventListener('pointermove', editor.boundMove);
  if (editor.drag?.type === 'marquee') {
    editor.selectionBox = null;
    editor.drag = null;
    editor.emitSelect();
    editor.updateToolbar();
    editor.updateMeasureToolbar();
    editor.drawScore();
    return;
  }
  const draggedNote = editor.drag ? editor.model.getNote(editor.drag.id) : null;
  const shouldPlay = !!(editor.drag?.moved && draggedNote);
  editor.drag = null;
  if (shouldPlay) editor.playNote(draggedNote);
  editor.emitChange();
}

export function updateMarqueeSelection(editor) {
  if (!editor.drag || editor.drag?.type !== 'marquee' || !editor.selectionBox) return;
  const box = editor.selectionBox;
  const hitIds = [];
  const xMin = box.x;
  const xMax = box.x + box.width;
  const yMin = box.y;
  const yMax = box.y + box.height;

  for (const note of editor.model.score.notes) {
    const x = editor.noteToX(note);
    const systemIndex = editor.measureLayout?.measureToSystem?.[note.measure] ?? 0;
    const staffTop = editor.measureLayout?.systems?.[systemIndex]?.staffTop ?? editor.options.staffTop;
    const y = note.pitch ? editor.pitchToY(note.pitch, staffTop) : editor.restY(staffTop);
    if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) hitIds.push(note.id);
  }

  editor.selectedIds = new Set([...(editor.drag.baseSelectedIds || []), ...hitIds]);
  editor.emitSelect();
  editor.updateToolbar();
  editor.updateMeasureToolbar();
}
