export function renderMeasureToolbar(editor) {
  const toolbar = document.createElement('div');
  toolbar.className = 'partitura-measure-toolbar';
  toolbar.innerHTML = `
      <div class="partitura-measure-toolbar-group">
        <button type="button" data-action="mode-write" title="${editor.t('toolbar.measureInsert')}">✎ ${editor.t('toolbar.measureInsert')}</button>
        <button type="button" data-action="mode-select" title="${editor.t('toolbar.measureSelect')}">↖ ${editor.t('toolbar.measureSelect')}</button>
        <button type="button" data-action="delete" title="${editor.t('toolbar.deleteSelection')}">${editor.t('toolbar.deleteSelection')}</button>
        <button type="button" data-action="undo" title="${editor.t('toolbar.undo')}">↶ ${editor.t('toolbar.undo')}</button>
        <button type="button" data-action="redo" title="${editor.t('toolbar.redo')}">↷ ${editor.t('toolbar.redo')}</button>
        <button type="button" data-action="play" title="${editor.t('toolbar.play')}">▶ ${editor.t('toolbar.play')}</button>
        <button type="button" data-action="stop" title="${editor.t('toolbar.stop')}" hidden>■ ${editor.t('toolbar.stop')}</button>
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
      <div class="partitura-toolbar-group partitura-toolbar-durations" aria-label="${editor.t('toolbar.noteDuration')}">
        <button type="button" data-action="toggle-note-kind" title="${editor.t('toolbar.toggleToRest')}" aria-label="${editor.t('toolbar.toggleToRest')}"><span class="partitura-music-glyph">𝄽</span><span>${editor.t('toolbar.note')}</span></button>
        <button type="button" data-action="duration-4" title="${editor.t('durations.whole')}" aria-label="${editor.t('durations.whole')}"><span class="partitura-music-glyph">𝅝</span></button>
        <button type="button" data-action="duration-2" title="${editor.t('durations.half')}" aria-label="${editor.t('durations.half')}"><span class="partitura-music-glyph">𝅗𝅥</span></button>
        <button type="button" data-action="duration-1" title="${editor.t('durations.quarter')}" aria-label="${editor.t('durations.quarter')}"><span class="partitura-music-glyph">𝅘𝅥</span></button>
        <button type="button" data-action="duration-0.5" title="${editor.t('durations.eighth')}" aria-label="${editor.t('durations.eighth')}"><span class="partitura-music-glyph">𝅘𝅥𝅮</span></button>
        <button type="button" data-action="duration-0.25" title="${editor.t('durations.sixteenth')}" aria-label="${editor.t('durations.sixteenth')}"><span class="partitura-music-glyph">𝅘𝅥𝅯</span></button>
        <button type="button" data-action="duration-0.125" title="${editor.t('durations.thirtySecond')}" aria-label="${editor.t('durations.thirtySecond')}"><span class="partitura-music-glyph">𝅘𝅥𝅰</span></button>
        <button type="button" data-action="duration-0.0625" title="${editor.t('durations.sixtyFourth')}" aria-label="${editor.t('durations.sixtyFourth')}"><span class="partitura-music-glyph">𝅘𝅥𝅱</span></button>
      </div>
      <div class="partitura-toolbar-footer" aria-label="${editor.t('toolbar.otherOptions')}">
        <div class="partitura-toolbar-group partitura-toolbar-clefs" aria-label="${editor.t('toolbar.clef')}">
          <button type="button" data-action="clef-sol" data-clef="sol" draggable="true" title="${editor.t('toolbar.clefSol')}" aria-label="${editor.t('toolbar.clefSol')}"><span class="partitura-music-glyph">𝄞</span><span>Sol</span></button>
          <button type="button" data-action="clef-fa" data-clef="fa" draggable="true" title="${editor.t('toolbar.clefFa')}" aria-label="${editor.t('toolbar.clefFa')}"><span class="partitura-music-glyph">𝄢</span><span>Fa</span></button>
          <button type="button" data-action="clef-do" data-clef="do" draggable="true" title="${editor.t('toolbar.clefDo')}" aria-label="${editor.t('toolbar.clefDo')}"><span class="partitura-music-glyph">𝄡</span><span>Do</span></button>
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
    noteKindButton.title = isRest ? editor.t('toolbar.toggleToNote') : editor.t('toolbar.toggleToRest');
    noteKindButton.setAttribute('aria-label', noteKindButton.title);
    noteKindButton.innerHTML = isRest
      ? `<span class="partitura-music-glyph">𝄽</span><span>${editor.t('toolbar.rest')}</span>`
      : `<span class="partitura-music-glyph">𝄽</span><span>${editor.t('toolbar.note')}</span>`;
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
