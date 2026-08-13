/**
 * Aetherion — Forge Worlds. Shape Destiny.
 * Main entry point for the game application foundation layer.
 */

export * from './foundation/index.js';
export { AetherionRuntime } from './core/orchestrator.js';
export type { RuntimeState, RuntimeStatus } from './core/orchestrator.js';

export const AETHERION_META = {
  name: 'Aetherion',
  tagline: 'FORGE WORLDS. SHAPE DESTINY.',
  version: '0.1.0',
  repository: 'dominiccalandro1991-byte/Aetherion',
  primaryLogoRole: 'UI / App Icon / Headers (IMG_4588)',
  keyArtRole: 'Marketing Hero / Cinematic (IMG_4587)',
  designTokens: 'src/css/aetherion-theme.css',
} as const;
