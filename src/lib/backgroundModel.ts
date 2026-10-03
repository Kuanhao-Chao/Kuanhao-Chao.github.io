/** Pure preferences and shared coordinates used by the ambient scenes and their demos. */
export type BackgroundScene = 'cells' | 'morph' | 'off';
export type BackgroundMotion = 'ambient' | 'calm' | 'paused';
export interface BackgroundPreference {
  scene: BackgroundScene;
  motion: BackgroundMotion;
}
export const BACKGROUND_KEY = 'khc-background-v1';
export const SCENES = ['cells', 'morph', 'off'] as const;
export const MOTIONS = ['ambient', 'calm', 'paused'] as const;
/** What a visitor with no saved choice sees. Its visible name, Sequence → Function, lives with the controls. */
export const DEFAULT_SCENE: BackgroundScene = 'morph';
/**
 * Written once this release's default has been applied. The build before it saved its own default,
 * Cells, to storage for every visitor on their first load, so a saved Cells looked exactly like a
 * chosen one: changing DEFAULT_SCENE alone would have changed nothing for anyone who had already
 * visited. Until the flag exists a saved Cells is moved to the default once; after it, a saved
 * Cells is a choice and stays. The value is a version, so a later change of default can reuse the
 * mechanism by changing the string. SiteBackground.astro mirrors this rule in its inline script.
 */
export const BACKGROUND_DEFAULT_KEY = 'khc-background-default';
export const DEFAULT_SCENE_VERSION = 'sequence-function-1';

export function resolveBackground(
  raw: string | null,
  legacy: string | null,
  seenDefault: string | null
): BackgroundPreference {
  try {
    const value = JSON.parse(raw || 'null');
    if (value && MOTIONS.includes(value.motion)) {
      let scene: BackgroundScene = SCENES.includes(value.scene) ? value.scene : DEFAULT_SCENE;
      if (scene === 'cells' && seenDefault !== DEFAULT_SCENE_VERSION) scene = DEFAULT_SCENE;
      return { scene, motion: value.motion };
    }
  } catch {
    /* Invalid or old storage falls back to the legacy preference. */
  }
  return {
    scene: legacy === 'off' ? 'off' : DEFAULT_SCENE,
    motion: legacy === 'calm' ? 'calm' : 'ambient',
  };
}

export function backgroundRouteAllowed(path: string): boolean {
  return !/^\/(?:lab|games|nn-lab|shorkie-lab|algorithms|terminal|chromatin|sonic-genome)(?:\/|$)/.test(
    path
  );
}

export interface Point {
  x: number;
  y: number;
}
