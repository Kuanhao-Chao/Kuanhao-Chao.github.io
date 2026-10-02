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

export function resolveBackground(raw: string | null, legacy: string | null): BackgroundPreference {
  try {
    const value = JSON.parse(raw || 'null');
    if (value && MOTIONS.includes(value.motion)) {
      return { scene: SCENES.includes(value.scene) ? value.scene : 'cells', motion: value.motion };
    }
  } catch {
    /* Invalid or old storage falls back to the legacy preference. */
  }
  return {
    scene: legacy === 'off' ? 'off' : 'cells',
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
