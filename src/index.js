export const version = '0.1.0';

// Public editor API
export { ScoreEditor } from './editor/ScoreEditor.js';
export { exportMusicXML, importMusicXML } from './services/musicxml.js';
export { createTranslator, normalizeLanguage, translations } from './i18n/index.js';

// Data/model helpers
export { ScoreModel } from './model/ScoreModel.js';
export { normalizeScore } from './model/normalizeScore.js';

// Rendering helper
export { createSvg } from './render/svg.js';

// Low-level utilities and music theory helpers
export * from './core/constants.js';
export * from './core/utils.js';
export * from './music/clef.js';
export * from './music/pitch.js';
export * from './music/duration.js';
export * from './music/accidental.js';
export * from './music/key-signature.js';
