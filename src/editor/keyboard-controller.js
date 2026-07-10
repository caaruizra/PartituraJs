import { clamp } from '../core/utils.js';
import { midiToPitch, noteSortValue, pitchToMidi } from '../music/pitch.js';

function defaultNotePitch() {
  return { step: 'C', octave: 4, alter: 0 };
}

export function bindKeyboard(editor) {
  editor.container.onkeydown = (event) => {
    if (editor.options.readonly) return;
    const handled = handleKeyboardNavigation(editor, event);
    if (handled) return;
    if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      convertSelectedNoteToRest(editor);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      editor.removeSelected();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo(); else editor.undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      editor.redo();
    }
    if (event.key === 'Escape') editor.hideContextMenu();
    if (event.key === 'Escape') editor.clearSelection();
  };
}

export function handleKeyboardNavigation(editor, event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (!keys.includes(event.key)) return false;
  if (editor.options.mode !== 'select') return false;

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (editor.selectedIds.size !== 1) return false;
    const selectedNote = editor.model.getNote([...editor.selectedIds][0]);
    if (!selectedNote) return false;
    event.preventDefault();
    selectAdjacentNote(editor, selectedNote, event.key === 'ArrowRight' ? 1 : -1);
    return true;
  }

  if (!editor.selectedIds.size) return false;
  event.preventDefault();
  const semitoneStep = event.ctrlKey || event.metaKey ? 12 : 1;
  const direction = event.key === 'ArrowUp' ? 1 : -1;
  transposeSelectedNotes(editor, direction * semitoneStep);
  return true;
}

export function getOrderedNotes(editor) {
  return [...editor.model.score.notes]
    .sort((a, b) => (a.measure - b.measure) || (a.beat - b.beat) || (noteSortValue(a) - noteSortValue(b)));
}

export function selectAdjacentNote(editor, currentNote, direction) {
  const notes = getOrderedNotes(editor);
  const currentIndex = notes.findIndex((note) => note.id === currentNote.id);
  if (currentIndex === -1) return;
  const nextIndex = clamp(currentIndex + direction, 0, notes.length - 1);
  if (nextIndex === currentIndex) return;
  editor.select(notes[nextIndex].id, false);
}

export function transposeSelectedNotes(editor, semitones) {
  const selectedNotes = [...editor.selectedIds].map((id) => editor.model.getNote(id)).filter(Boolean);
  if (!selectedNotes.length) return;
  const notesWithPitch = selectedNotes.filter((note) => note.pitch);
  if (!notesWithPitch.length) return;
  editor.pushHistory();
  for (const note of notesWithPitch) {
    const nextPitch = midiToPitch(pitchToMidi(note.pitch) + semitones);
    editor.model.updateNote(note.id, { pitch: nextPitch });
  }
  editor.emitChange();
  editor.drawScore();
}

export function convertSelectedNoteToRest(editor) {
  if (editor.selectedIds.size !== 1) return;
  const noteId = [...editor.selectedIds][0];
  const note = editor.model.getNote(noteId);
  if (!note) return;
  const wasNote = !!note.pitch;
  editor.pushHistory();
  const updated = editor.model.updateNote(noteId, {
    pitch: wasNote ? null : defaultNotePitch()
  });
  if (!updated) {
    editor.undoStack.pop();
    return;
  }
  editor.options.noteKind = wasNote ? 'rest' : 'note';
  editor.emitChange();
  editor.updateToolbar();
  editor.drawScore();
}
