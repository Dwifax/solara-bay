// Player settings (volumes, mouse sensitivity, shadows, density, difficulty), kept in
// localStorage when it is available.

const KEY = 'solarabay.settings.v1';

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  sensitivity: 1,
  invertY: false,
  shadows: true,
  trafficDensity: 1,
  pedDensity: 1,
  difficulty: 1,
};

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Storage blocked: defaults for this visit.
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not persisted.
  }
}
