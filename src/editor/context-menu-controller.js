import { clamp } from '../core/utils.js';
import { isDottedDuration, toggleDottedDuration } from '../music/duration.js';

function parseKeySignatureInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return clamp(Math.round(numeric), -7, 7);

  if (/^[#♯]+$/.test(raw)) return clamp(raw.length, 0, 7);
  if (/^[b♭]+$/i.test(raw)) return clamp(-raw.length, -7, 0);
  return null;
}

function positionMenu(editor, event) {
  if (!editor.contextMenu) return;
  const containerRect = editor.container.getBoundingClientRect();
  const left = event.clientX - containerRect.left;
  const top = event.clientY - containerRect.top;
  editor.contextMenu.style.left = `${left}px`;
  editor.contextMenu.style.top = `${top}px`;

  requestAnimationFrame(() => {
    if (!editor.contextMenu || editor.contextMenu.hidden) return;
    const menuRect = editor.contextMenu.getBoundingClientRect();
    const maxLeft = editor.container.clientWidth - menuRect.width - 8;
    const maxTop = editor.container.clientHeight - menuRect.height - 8;
    const clampedLeft = clamp(left, 8, Math.max(8, maxLeft));
    const clampedTop = clamp(top, 8, Math.max(8, maxTop));
    editor.contextMenu.style.left = `${clampedLeft}px`;
    editor.contextMenu.style.top = `${clampedTop}px`;
  });
}

function handleMeasureAction(editor, action) {
  if (!action.startsWith('measure-')) return false;
  if (editor.contextMenuMeasure === null) return true;
  if (action === 'measure-insert-before') editor.insertMeasureAt(editor.contextMenuMeasure);
  if (action === 'measure-insert-after') editor.insertMeasureAt(editor.contextMenuMeasure + 1);
  if (action === 'measure-delete') editor.removeMeasureAt(editor.contextMenuMeasure);
  if (action === 'measure-key-signature') {
    const current = editor.model.getKeyAtMeasure(editor.contextMenuMeasure);
    const input = window.prompt(editor.t('editor.keySignaturePrompt'), String(current));
    if (input !== null) {
      const fifths = parseKeySignatureInput(input);
      if (fifths === null) window.alert(editor.t('editor.keySignatureInvalid'));
      else editor.setKeySignatureAt(editor.contextMenuMeasure, fifths);
    }
  }
  return true;
}

function handleNoteDeleteAction(editor) {
  if (!editor.contextMenuNote) return;
  editor.pushHistory();
  const removed = editor.model.removeNote(editor.contextMenuNote);
  if (removed) {
    if (editor.pendingTieStart === editor.contextMenuNote) editor.pendingTieStart = null;
    if (editor.pendingSlurStart === editor.contextMenuNote) editor.pendingSlurStart = null;
    editor.selectedIds.delete(editor.contextMenuNote);
    editor.emitChange();
    editor.drawScore();
  } else {
    editor.undoStack.pop();
  }
}

function handleToggleDotAction(editor) {
  if (!editor.contextMenuNote) return;
  const note = editor.model.getNote(editor.contextMenuNote);
  if (!note) {
    hideContextMenu(editor);
    return;
  }
  editor.pushHistory();
  const updated = editor.model.updateNote(note.id, { duration: toggleDottedDuration(note.duration) });
  if (updated) {
    editor.emitChange();
    editor.updateToolbar();
    editor.updateMeasureToolbar();
    editor.drawScore();
  } else {
    editor.undoStack.pop();
  }
}

function handleMenuAction(editor, action) {
  if (!action) return;
  const isMeasureAction = handleMeasureAction(editor, action);
  if (!isMeasureAction) {
    const noteActions = {
      'note-delete': () => handleNoteDeleteAction(editor),
      'note-toggle-dot': () => handleToggleDotAction(editor),
      'note-convert-tuplet': () => editor.convertSelectedNoteToTuplet(),
      'note-tie-start': () => editor.startTie(editor.contextMenuNote),
      'note-tie-end': () => editor.endTie(editor.contextMenuNote),
      'note-slur-start': () => editor.startSlur(editor.contextMenuNote),
      'note-slur-end': () => editor.endSlur(editor.contextMenuNote),
      'note-clear-ligatures': () => editor.clearLigatures(editor.contextMenuNote)
    };
    noteActions[action]?.();
  }
  hideContextMenu(editor);
}

function configureLigatureButtons(editor, note) {
  const tieStartButton = editor.contextMenu.querySelector('[data-action="note-tie-start"]');
  const tieEndButton = editor.contextMenu.querySelector('[data-action="note-tie-end"]');
  const slurStartButton = editor.contextMenu.querySelector('[data-action="note-slur-start"]');
  const slurEndButton = editor.contextMenu.querySelector('[data-action="note-slur-end"]');
  const clearLigaturesButton = editor.contextMenu.querySelector('[data-action="note-clear-ligatures"]');

  const tiePending = editor.pendingTieStart ? editor.model.getNote(editor.pendingTieStart) : null;
  const slurPending = editor.pendingSlurStart ? editor.model.getNote(editor.pendingSlurStart) : null;

  if (tieStartButton) tieStartButton.disabled = !note.pitch;
  if (tieEndButton) {
    tieEndButton.disabled = !note.pitch || !tiePending;
    tieEndButton.textContent = tiePending
      ? editor.t('contextMenu.tieEndActive')
      : editor.t('contextMenu.tieEndInactive');
  }
  if (slurStartButton) slurStartButton.disabled = !note.pitch;
  if (slurEndButton) {
    slurEndButton.disabled = !note.pitch || !slurPending;
    slurEndButton.textContent = slurPending
      ? editor.t('contextMenu.slurEndActive')
      : editor.t('contextMenu.slurEndInactive');
  }
  if (clearLigaturesButton) {
    clearLigaturesButton.disabled = !note.tieStart && !note.tieStop && !note.slurStart && !note.slurStop;
  }
}

export function renderContextMenu(editor) {
  const menu = document.createElement('div');
  menu.className = 'partitura-context-menu';
  menu.hidden = true;
  menu.innerHTML = `
      <div class="partitura-context-menu-group" data-context-group="measure">
        <button type="button" data-action="measure-insert-before">${editor.t('contextMenu.measureInsertBefore')}</button>
        <button type="button" data-action="measure-insert-after">${editor.t('contextMenu.measureInsertAfter')}</button>
        <button type="button" data-action="measure-key-signature">${editor.t('contextMenu.measureKeySignature')}</button>
        <button type="button" data-action="measure-delete">${editor.t('contextMenu.measureDelete')}</button>
      </div>
      <div class="partitura-context-menu-divider"></div>
      <div class="partitura-context-menu-group" data-context-group="note">
        <button type="button" data-action="note-delete">${editor.t('contextMenu.noteDelete')}</button>
        <button type="button" data-action="note-toggle-dot">${editor.t('contextMenu.noteToggleDotAdd')}</button>
        <button type="button" data-action="note-convert-tuplet">${editor.t('contextMenu.noteConvertTuplet')}</button>
        <button type="button" data-action="note-tie-start">${editor.t('contextMenu.tieStart')}</button>
        <button type="button" data-action="note-tie-end">${editor.t('contextMenu.tieEndInactive')}</button>
        <button type="button" data-action="note-slur-start">${editor.t('contextMenu.slurStart')}</button>
        <button type="button" data-action="note-slur-end">${editor.t('contextMenu.slurEndInactive')}</button>
        <button type="button" data-action="note-clear-ligatures">${editor.t('contextMenu.clearLigatures')}</button>
      </div>
    `;

  menu.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action;
    handleMenuAction(editor, action);
  });

  editor.container.appendChild(menu);
  editor.contextMenu = menu;
}

export function showContextMenu(editor, measure, event) {
  if (!editor.contextMenu) return;
  editor.contextMenuNote = null;
  editor.contextMenuMeasure = clamp(Number(measure), 0, editor.model.score.measures - 1);
  editor.setSelectedMeasure(editor.contextMenuMeasure);

  const measureGroup = editor.contextMenu.querySelector('[data-context-group="measure"]');
  const noteGroup = editor.contextMenu.querySelector('[data-context-group="note"]');
  if (measureGroup) measureGroup.hidden = false;
  if (noteGroup) noteGroup.hidden = true;

  const deleteButton = editor.contextMenu.querySelector('[data-action="measure-delete"]');
  if (deleteButton) deleteButton.disabled = editor.model.score.measures <= 1;

  editor.contextMenu.hidden = false;
  positionMenu(editor, event);
}

export function showNoteContextMenu(editor, noteId, event) {
  if (!editor.contextMenu) return;
  const note = editor.model.getNote(noteId);
  if (!note) return;

  editor.contextMenuMeasure = note.measure;
  editor.contextMenuNote = noteId;
  editor.selectedIds.clear();
  editor.selectedIds.add(noteId);
  editor.setSelectedMeasure(note.measure);
  editor.emitSelect();
  editor.updateToolbar();
  editor.updateMeasureToolbar();
  editor.drawScore();

  const measureGroup = editor.contextMenu.querySelector('[data-context-group="measure"]');
  const noteGroup = editor.contextMenu.querySelector('[data-context-group="note"]');
  if (measureGroup) measureGroup.hidden = false;
  if (noteGroup) noteGroup.hidden = false;

  const noteDotButton = editor.contextMenu.querySelector('[data-action="note-toggle-dot"]');
  if (noteDotButton) {
    noteDotButton.hidden = false;
    noteDotButton.textContent = isDottedDuration(note.duration)
      ? editor.t('contextMenu.noteToggleDotRemove')
      : editor.t('contextMenu.noteToggleDotAdd');
  }
  configureLigatureButtons(editor, note);

  editor.contextMenu.hidden = false;
  positionMenu(editor, event);
}

export function hideContextMenu(editor) {
  if (!editor.contextMenu) return;
  editor.contextMenu.hidden = true;
  editor.contextMenuMeasure = null;
  editor.contextMenuNote = null;
}
