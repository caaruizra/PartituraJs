export function renderMeasureToolbar(editor) {
  const toolbar = document.createElement('div');
  toolbar.className = 'partitura-measure-toolbar';
  toolbar.innerHTML = `
      <div class="partitura-measure-toolbar-group">
        <button type="button" data-action="mode-write" title="Agregar notas">✎ Insertar</button>
        <button type="button" data-action="mode-select" title="Seleccionar y mover">↖ Seleccionar</button>
        <button type="button" data-action="delete" title="Borrar selección">Borrar</button>
        <button type="button" data-action="undo" title="Deshacer">↶ Deshacer</button>
        <button type="button" data-action="redo" title="Rehacer">↷ Rehacer</button>
        <button type="button" data-action="play" title="Reproducir">▶ Reproducir</button>
        <button type="button" data-action="stop" title="Detener" hidden>■ Detener</button>
      </div>
    `;
  toolbar.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (!action) return;
    if (action === 'mode-write') editor.setMode('write');
    if (action === 'mode-select') editor.setMode('select');
    if (action === 'delete') editor.removeSelected();
    if (action === 'undo') editor.undo();
    if (action === 'redo') editor.redo();
    if (action === 'play') editor.play();
    if (action === 'stop') editor.stopPlayback();
    editor.container.focus();
  });
  editor.container.appendChild(toolbar);
  editor.measureToolbar = toolbar;
  updateMeasureToolbar(editor);
}

export function renderToolbar(editor, layout) {
  const toolbar = document.createElement('div');
  toolbar.className = 'partitura-toolbar';
  toolbar.innerHTML = `
      <div class="partitura-toolbar-group partitura-toolbar-durations" aria-label="Duración de nota">
        <button type="button" data-action="toggle-note-kind" title="Cambiar a silencio" aria-label="Cambiar a silencio"><span class="partitura-music-glyph">𝄽</span><span>Nota</span></button>
        <button type="button" data-action="duration-4" title="Redonda" aria-label="Redonda"><span class="partitura-music-glyph">𝅝</span></button>
        <button type="button" data-action="duration-2" title="Blanca" aria-label="Blanca"><span class="partitura-music-glyph">𝅗𝅥</span></button>
        <button type="button" data-action="duration-1" title="Negra" aria-label="Negra"><span class="partitura-music-glyph">𝅘𝅥</span></button>
        <button type="button" data-action="duration-0.5" title="Corchea" aria-label="Corchea"><span class="partitura-music-glyph">𝅘𝅥𝅮</span></button>
        <button type="button" data-action="duration-0.25" title="Semicorchea" aria-label="Semicorchea"><span class="partitura-music-glyph">𝅘𝅥𝅯</span></button>
        <button type="button" data-action="duration-0.125" title="Fusa" aria-label="Fusa"><span class="partitura-music-glyph">𝅘𝅥𝅰</span></button>
        <button type="button" data-action="duration-0.0625" title="Semifusa" aria-label="Semifusa"><span class="partitura-music-glyph">𝅘𝅥𝅱</span></button>
      </div>
      <div class="partitura-toolbar-footer" aria-label="Otras opciones">
        <div class="partitura-toolbar-group partitura-toolbar-clefs" aria-label="Clave">
          <button type="button" data-action="clef-sol" data-clef="sol" draggable="true" title="Clave de Sol" aria-label="Clave de Sol"><span class="partitura-music-glyph">𝄞</span><span>Sol</span></button>
          <button type="button" data-action="clef-fa" data-clef="fa" draggable="true" title="Clave de Fa" aria-label="Clave de Fa"><span class="partitura-music-glyph">𝄢</span><span>Fa</span></button>
          <button type="button" data-action="clef-do" data-clef="do" draggable="true" title="Clave de Do" aria-label="Clave de Do"><span class="partitura-music-glyph">𝄡</span><span>Do</span></button>
        </div>
      </div>
    `;
  toolbar.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (!action) return;
    if (action.startsWith('duration-')) editor.options.noteDuration = Number(action.replace('duration-', ''));
    if (action === 'toggle-note-kind') editor.toggleNoteKind();
    if (action.startsWith('clef-')) editor.setClef(event.target.closest('button')?.dataset.clef);
    if (action === 'play') editor.play();
    editor.container.focus();
  });
  toolbar.addEventListener('dragstart', (event) => {
    const button = event.target.closest('button[data-clef]');
    if (!button || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', button.dataset.clef || '');
    event.dataTransfer.effectAllowed = 'copy';
  });
  layout.appendChild(toolbar);
  editor.toolbar = toolbar;
  updateToolbar(editor);
}

export function updateToolbar(editor) {
  if (!editor.toolbar) return;
  for (const button of editor.toolbar.querySelectorAll('button')) button.classList.remove('is-active');
  const mode = editor.toolbar.querySelector(`[data-action="mode-${editor.options.mode}"]`);
  if (mode) mode.classList.add('is-active');
  const noteKindButton = editor.toolbar.querySelector('[data-action="toggle-note-kind"]');
  if (noteKindButton) {
    const isRest = editor.options.noteKind === 'rest';
    noteKindButton.classList.toggle('is-active', isRest);
    noteKindButton.title = isRest ? 'Cambiar a nota' : 'Cambiar a silencio';
    noteKindButton.setAttribute('aria-label', noteKindButton.title);
    noteKindButton.innerHTML = isRest
      ? '<span class="partitura-music-glyph">𝄽</span><span>Silencio</span>'
      : '<span class="partitura-music-glyph">𝄽</span><span>Nota</span>';
  }
  const selectedNote = editor.selectedIds.size === 1
    ? editor.model.getNote([...editor.selectedIds][0])
    : null;
  const activeDuration = selectedNote?.duration ?? editor.options.noteDuration;
  const dur = editor.toolbar.querySelector(`[data-action="duration-${activeDuration}"]`);
  if (dur) dur.classList.add('is-active');
  const clef = editor.toolbar.querySelector(`[data-action="clef-${editor.model.score.clef}"]`);
  if (clef) clef.classList.add('is-active');
}

export function updateMeasureToolbar(editor) {
  if (!editor.measureToolbar) return;
  const needsSelection = editor.selectedMeasure === null;
  const hasNoteSelection = editor.selectedIds.size === 0;
  const undoButton = editor.measureToolbar.querySelector('[data-action="undo"]');
  const redoButton = editor.measureToolbar.querySelector('[data-action="redo"]');
  const deleteButton = editor.measureToolbar.querySelector('[data-action="delete"]');
  const playButton = editor.measureToolbar.querySelector('[data-action="play"]');
  const stopButton = editor.measureToolbar.querySelector('[data-action="stop"]');
  if (undoButton) undoButton.disabled = editor.undoStack.length <= 1;
  if (redoButton) redoButton.disabled = editor.redoStack.length === 0;
  if (deleteButton) deleteButton.disabled = hasNoteSelection;
  if (playButton) playButton.hidden = !!editor.playback;
  if (stopButton) stopButton.hidden = !editor.playback;
  const before = editor.measureToolbar.querySelector('[data-action="measure-before-selected"]');
  const after = editor.measureToolbar.querySelector('[data-action="measure-after-selected"]');
  if (before) before.disabled = needsSelection;
  if (after) after.disabled = needsSelection;
}
