# Modularizacion de PartituraJS

Este documento describe la migracion desde `dist/partitura-editor.js` (monolitico) hacia una estructura modular en `src/`.

## Estado actual

Se extrajeron modulos puros:

- `src/core/constants.js`
- `src/core/utils.js`
- `src/music/clef.js`
- `src/music/pitch.js`
- `src/music/duration.js`
- `src/music/accidental.js`
- `src/model/normalizeScore.js`
- `src/model/ScoreModel.js`
- `src/services/musicxml.js`
- `src/index.js`

Con esto, reglas de negocio y exportacion dejan de depender del DOM.

Tambien se completo un paso puente:

- `src/editor/ScoreEditor.js` contiene la clase `ScoreEditor` extraida del runtime legacy.
- `scripts/build.mjs` ya regenera `dist/partitura-editor.js` desde `src/`.
- El bundle legacy mantiene compatibilidad publica:
	- API global: `window.PartituraJS`
	- CommonJS: `module.exports`

Se completo el desacople principal de responsabilidades:

- `src/services/layout-engine.js` con `buildMeasureLayout`, `buildBeamLayout`, `beatToX` y `noteToX`.
- `src/services/audio-player.js` con `play`, `playNote`, `stopPlayback`, `tickPlayback`, `getPlaybackPosition`, `updatePlaybackCursor`, `removePlaybackCursor`.
- `src/render/score-renderer.js`, `src/render/notes.js`, `src/render/beams.js` y `src/render/svg.js`.
- `src/editor/toolbar-controller.js`, `src/editor/keyboard-controller.js`, `src/editor/pointer-controller.js`, `src/editor/context-menu-controller.js`.
- `ScoreEditor` delega toolbar, keyboard, pointer/marquee, context menu, renderer, layout y audio.

Con este estado, `ScoreEditor` funciona como fachada/orquestador, no como god class monolitica.


Ademas, se agrego verificacion automatizada:

- `npm run verify` (`scripts/verify.mjs`) ejecuta build y valida:
	- exportaciones CommonJS esperadas
	- MusicXML con `<dot/>` y `<rest/>`
	- presencia de API global en bundle IIFE
	- logica de toggle nota/silencio (tecla `R`)

## Fase 2 recomendada

Extraer `ScoreEditor` por responsabilidades:

1. `src/editor/toolbar-controller.js`
- `renderToolbar`, `renderMeasureToolbar`, `updateToolbar`, `updateMeasureToolbar`.

Estado actual: extraido y `ScoreEditor` delega la logica de toolbar al controller.

2. `src/editor/keyboard-controller.js`
- `bindKeyboard`, `handleKeyboardNavigation`, `transposeSelectedNotes`, `convertSelectedNoteToRest`.

Estado actual: extraido y `ScoreEditor` delega estos metodos al controller.

3. `src/editor/pointer-controller.js`
- handlers de mouse/touch y marquee.

Estado actual: extraido (`onCanvasPointerDown`, `onCanvasDrop`, `onNotePointerDown`, `onPointerMove`, `onPointerUp`, context menu y marquee) y `ScoreEditor` delega al controller.

Adicional:

- `src/editor/context-menu-controller.js` encapsula render y acciones del menu contextual (compases y notas).
- `ScoreEditor` delega `renderContextMenu`, `showContextMenu`, `showNoteContextMenu` y `hideContextMenu`.

4. `src/render/score-renderer.js`
- `drawScore`, `drawNote`, `drawRest`, `drawBeams`.

Estado actual: renderer migrado a modulos separados (`src/render/score-renderer.js`, `src/render/notes.js`, `src/render/beams.js` y `src/render/svg.js`).

5. `src/services/layout-engine.js`
- `buildMeasureLayout`, `buildBeamLayout`, `beatToX`, `noteToX`.

6. `src/services/audio-player.js`
- `play`, `playNote`, `stopPlayback`, `tickPlayback`.

Estado actual: extraido en `src/services/audio-player.js`, incluyendo cursor de reproduccion (`getPlaybackPosition`, `updatePlaybackCursor`, `removePlaybackCursor`), y `ScoreEditor` ya delega estas responsabilidades.

Estado general de fase 2: completada.

## Fase 3 recomendada

Profundizar la separacion interna de `ScoreEditor` y consolidar la salida publica:

- mantener `dist/partitura-editor.js` como salida principal compatible
- decidir si `dist/partitura-modular.*` se mantiene como salida secundaria o se simplifica

Estado actual de pruebas automatizadas minimas:

	- completado mediante `npm run verify` para:
	- export MusicXML con puntillos y silencios
	- toggle nota/silencio (toolbar y tecla `R`)
	- compatibilidad de API (`require` y global)

Pendientes sugeridos de fase 3:

- decidir estrategia final de distribucion (`partitura-editor.js` solamente vs tambien `partitura-modular.*`)
- agregar pruebas de integracion UI (seleccion/marquee, drag de notas, context menu) para cubrir interaccion completa
- estabilizar convencion de exports publicos en `src/index.js` y documentar superficie oficial de API

Mientras tanto, el runtime legacy se sigue generando desde `src/` con compatibilidad publica preservada.
