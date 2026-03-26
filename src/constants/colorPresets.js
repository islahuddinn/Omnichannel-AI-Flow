// src/constants/colorPresets.js
// Professional accent color presets for light and dark modes (OKLCH color space)

// Helper to generate consistent preset structure
function makePreset(id, name, preview, hue, opts = {}) {
  const {
    lightL = 0.52, lightC = 0.20,
    darkL = 0.72, darkC = 0.20,
    fgLight = 'oklch(0.99 0 0)',
    fgDark = null,
  } = opts;
  const dfg = fgDark || `oklch(0.12 0.02 ${hue})`;
  return {
    id, name, preview, type: 'solid',
    light: {
      '--primary': `oklch(${lightL} ${lightC} ${hue})`,
      '--primary-foreground': fgLight,
      '--secondary': `oklch(${lightL + 0.12} ${lightC - 0.04} ${hue + 15})`,
      '--secondary-foreground': fgLight,
      '--accent': `oklch(${lightL + 0.18} ${lightC - 0.04} ${hue})`,
      '--accent-foreground': fgLight,
      '--ring': `oklch(${lightL} ${lightC} ${hue})`,
      '--sidebar-primary': `oklch(${lightL} ${lightC} ${hue})`,
      '--sidebar-primary-foreground': fgLight,
      '--sidebar-ring': `oklch(${lightL} ${lightC} ${hue})`,
      '--chart-1': `oklch(${lightL} ${lightC} ${hue})`,
      '--chart-2': `oklch(${lightL + 0.10} ${lightC - 0.02} ${hue + 20})`,
      '--chart-3': `oklch(${lightL + 0.18} ${lightC - 0.04} ${hue - 15})`,
      '--chart-4': `oklch(${lightL + 0.05} ${lightC + 0.02} ${hue + 40})`,
      '--chart-5': `oklch(${lightL + 0.14} ${lightC - 0.02} ${hue - 30})`,
    },
    dark: {
      '--primary': `oklch(${darkL} ${darkC} ${hue})`,
      '--primary-foreground': dfg,
      '--secondary': `oklch(${darkL - 0.08} ${darkC - 0.04} ${hue + 15})`,
      '--secondary-foreground': `oklch(0.96 0.01 ${hue})`,
      '--accent': `oklch(${darkL} ${darkC} ${hue})`,
      '--accent-foreground': dfg,
      '--ring': `oklch(${darkL} ${darkC} ${hue})`,
      '--sidebar-primary': `oklch(${darkL} ${darkC} ${hue})`,
      '--sidebar-primary-foreground': dfg,
      '--sidebar-ring': `oklch(${darkL} ${darkC} ${hue})`,
      '--chart-1': `oklch(${darkL} ${darkC} ${hue})`,
      '--chart-2': `oklch(${darkL - 0.08} ${darkC - 0.02} ${hue + 20})`,
      '--chart-3': `oklch(${darkL - 0.16} ${darkC - 0.06} ${hue - 15})`,
      '--chart-4': `oklch(${darkL - 0.04} ${darkC - 0.02} ${hue + 40})`,
      '--chart-5': `oklch(${darkL - 0.12} ${darkC - 0.04} ${hue - 30})`,
    },
  };
}

// ────────────────────────────────────────────────────────
// SOLID COLOR PRESETS (15 professional options)
// ────────────────────────────────────────────────────────

export const COLOR_PRESETS = {
  // Blues
  'ocean-blue': makePreset('ocean-blue', 'Ocean Blue', '#2563EB', 250,
    { lightL: 0.54, lightC: 0.22, darkL: 0.72, darkC: 0.19 }),

  'sapphire': makePreset('sapphire', 'Sapphire', '#1D4ED8', 260,
    { lightL: 0.48, lightC: 0.22, darkL: 0.70, darkC: 0.20 }),

  'sky': makePreset('sky', 'Sky', '#0284C7', 230,
    { lightL: 0.56, lightC: 0.18, darkL: 0.74, darkC: 0.16 }),

  // Purples
  'indigo': makePreset('indigo', 'Indigo', '#4F46E5', 275,
    { lightL: 0.48, lightC: 0.24, darkL: 0.72, darkC: 0.22 }),

  'violet': makePreset('violet', 'Violet', '#7C3AED', 295,
    { lightL: 0.50, lightC: 0.22, darkL: 0.74, darkC: 0.20 }),

  'purple': makePreset('purple', 'Purple', '#9333EA', 305,
    { lightL: 0.48, lightC: 0.22, darkL: 0.72, darkC: 0.20 }),

  // Pinks / Reds
  'fuchsia': makePreset('fuchsia', 'Fuchsia', '#C026D3', 325,
    { lightL: 0.52, lightC: 0.22, darkL: 0.74, darkC: 0.20 }),

  'rose': makePreset('rose', 'Rose', '#E11D48', 350,
    { lightL: 0.55, lightC: 0.22, darkL: 0.74, darkC: 0.20 }),

  'crimson': makePreset('crimson', 'Crimson', '#DC2626', 25,
    { lightL: 0.55, lightC: 0.22, darkL: 0.72, darkC: 0.20 }),

  // Warm
  'orange': makePreset('orange', 'Orange', '#EA580C', 50,
    { lightL: 0.62, lightC: 0.20, darkL: 0.76, darkC: 0.18 }),

  'amber': makePreset('amber', 'Amber', '#D97706', 75,
    { lightL: 0.68, lightC: 0.18, darkL: 0.78, darkC: 0.16,
      fgLight: 'oklch(0.16 0.04 75)', fgDark: 'oklch(0.14 0.03 75)' }),

  // Greens
  'emerald': makePreset('emerald', 'Emerald', '#059669', 160,
    { lightL: 0.55, lightC: 0.18, darkL: 0.72, darkC: 0.17 }),

  'teal': makePreset('teal', 'Teal', '#0D9488', 180,
    { lightL: 0.56, lightC: 0.16, darkL: 0.74, darkC: 0.15 }),

  'cyan': makePreset('cyan', 'Cyan', '#0891B2', 200,
    { lightL: 0.56, lightC: 0.16, darkL: 0.76, darkC: 0.14 }),

  // Neutrals
  'slate': makePreset('slate', 'Slate', '#475569', 240,
    { lightL: 0.44, lightC: 0.04, darkL: 0.70, darkC: 0.04 }),
};

// ────────────────────────────────────────────────────────
// GRADIENT COLOR PRESETS (8 professional options)
// ────────────────────────────────────────────────────────

function makeGradient(id, name, previewFrom, previewTo, hue1, hue2, opts = {}) {
  const {
    lightL1 = 0.52, lightC1 = 0.20,
    lightL2 = 0.55, lightC2 = 0.20,
    darkL1 = 0.70, darkC1 = 0.18,
    darkL2 = 0.72, darkC2 = 0.18,
    angle = 135,
  } = opts;
  return {
    id, name,
    preview: `linear-gradient(${angle}deg, ${previewFrom}, ${previewTo})`,
    type: 'gradient',
    light: {
      '--primary': `oklch(${lightL1} ${lightC1} ${hue1})`,
      '--primary-foreground': 'oklch(0.99 0 0)',
      '--secondary': `oklch(${lightL2} ${lightC2} ${hue2})`,
      '--secondary-foreground': 'oklch(0.99 0 0)',
      '--accent': `oklch(${(lightL1 + lightL2) / 2} ${(lightC1 + lightC2) / 2} ${(hue1 + hue2) / 2})`,
      '--accent-foreground': 'oklch(0.99 0 0)',
      '--ring': `oklch(${lightL1} ${lightC1} ${hue1})`,
      '--sidebar-primary': `oklch(${lightL1} ${lightC1} ${hue1})`,
      '--sidebar-primary-foreground': 'oklch(0.99 0 0)',
      '--sidebar-ring': `oklch(${lightL1} ${lightC1} ${hue1})`,
      '--accent-gradient': `linear-gradient(${angle}deg, oklch(${lightL1} ${lightC1} ${hue1}), oklch(${lightL2} ${lightC2} ${hue2}))`,
      '--chart-1': `oklch(${lightL1} ${lightC1} ${hue1})`,
      '--chart-2': `oklch(${lightL2} ${lightC2} ${hue2})`,
      '--chart-3': `oklch(${(lightL1 + lightL2) / 2} ${(lightC1 + lightC2) / 2} ${(hue1 + hue2) / 2})`,
      '--chart-4': `oklch(${lightL1 + 0.08} ${lightC1 - 0.02} ${hue1 + 20})`,
      '--chart-5': `oklch(${lightL2 + 0.08} ${lightC2 - 0.02} ${hue2 - 20})`,
    },
    dark: {
      '--primary': `oklch(${darkL1} ${darkC1} ${hue1})`,
      '--primary-foreground': `oklch(0.12 0.02 ${hue1})`,
      '--secondary': `oklch(${darkL2} ${darkC2} ${hue2})`,
      '--secondary-foreground': `oklch(0.96 0.01 ${hue1})`,
      '--accent': `oklch(${(darkL1 + darkL2) / 2} ${(darkC1 + darkC2) / 2} ${(hue1 + hue2) / 2})`,
      '--accent-foreground': `oklch(0.12 0.02 ${hue1})`,
      '--ring': `oklch(${darkL1} ${darkC1} ${hue1})`,
      '--sidebar-primary': `oklch(${darkL1} ${darkC1} ${hue1})`,
      '--sidebar-primary-foreground': `oklch(0.12 0.02 ${hue1})`,
      '--sidebar-ring': `oklch(${darkL1} ${darkC1} ${hue1})`,
      '--accent-gradient': `linear-gradient(${angle}deg, oklch(${darkL1} ${darkC1} ${hue1}), oklch(${darkL2} ${darkC2} ${hue2}))`,
      '--chart-1': `oklch(${darkL1} ${darkC1} ${hue1})`,
      '--chart-2': `oklch(${darkL2} ${darkC2} ${hue2})`,
      '--chart-3': `oklch(${(darkL1 + darkL2) / 2} ${(darkC1 + darkC2) / 2} ${(hue1 + hue2) / 2})`,
      '--chart-4': `oklch(${darkL1 - 0.06} ${darkC1 - 0.02} ${hue1 + 20})`,
      '--chart-5': `oklch(${darkL2 - 0.06} ${darkC2 - 0.02} ${hue2 - 20})`,
    },
  };
}

export const GRADIENT_PRESETS = {
  // Blue → Cyan (cool ocean feel)
  'gradient-ocean-breeze': makeGradient(
    'gradient-ocean-breeze', 'Ocean Breeze', '#2563EB', '#06B6D4', 250, 200,
    { lightL1: 0.52, lightC1: 0.22, lightL2: 0.56, lightC2: 0.16,
      darkL1: 0.70, darkC1: 0.20, darkL2: 0.74, darkC2: 0.14 }),

  // Teal → Indigo (aurora borealis)
  'gradient-northern-lights': makeGradient(
    'gradient-northern-lights', 'Northern Lights', '#0D9488', '#4F46E5', 180, 275,
    { lightL1: 0.54, lightC1: 0.16, lightL2: 0.48, lightC2: 0.24,
      darkL1: 0.72, darkC1: 0.15, darkL2: 0.72, darkC2: 0.22 }),

  // Orange → Rose (warm sunset)
  'gradient-sunset-glow': makeGradient(
    'gradient-sunset-glow', 'Sunset Glow', '#EA580C', '#E11D48', 50, 350,
    { lightL1: 0.60, lightC1: 0.20, lightL2: 0.55, lightC2: 0.22,
      darkL1: 0.74, darkC1: 0.18, darkL2: 0.72, darkC2: 0.20 }),

  // Purple → Pink (berry mix)
  'gradient-berry-fusion': makeGradient(
    'gradient-berry-fusion', 'Berry Fusion', '#7C3AED', '#EC4899', 295, 340,
    { lightL1: 0.50, lightC1: 0.22, lightL2: 0.58, lightC2: 0.22,
      darkL1: 0.72, darkC1: 0.20, darkL2: 0.76, darkC2: 0.20 }),

  // Emerald → Teal (forest)
  'gradient-forest-mist': makeGradient(
    'gradient-forest-mist', 'Forest Mist', '#059669', '#0D9488', 160, 185,
    { lightL1: 0.54, lightC1: 0.18, lightL2: 0.56, lightC2: 0.16,
      darkL1: 0.72, darkC1: 0.17, darkL2: 0.74, darkC2: 0.15 }),

  // Amber → Orange (warm gold)
  'gradient-golden-dawn': makeGradient(
    'gradient-golden-dawn', 'Golden Dawn', '#D97706', '#EA580C', 75, 50,
    { lightL1: 0.66, lightC1: 0.18, lightL2: 0.60, lightC2: 0.20,
      darkL1: 0.76, darkC1: 0.16, darkL2: 0.74, darkC2: 0.18 }),

  // Indigo → Violet (deep space)
  'gradient-cosmic-night': makeGradient(
    'gradient-cosmic-night', 'Cosmic Night', '#4338CA', '#7C3AED', 270, 295,
    { lightL1: 0.46, lightC1: 0.24, lightL2: 0.50, lightC2: 0.22,
      darkL1: 0.70, darkC1: 0.22, darkL2: 0.74, darkC2: 0.20 }),

  // Rose → Fuchsia (floral)
  'gradient-rose-garden': makeGradient(
    'gradient-rose-garden', 'Rose Garden', '#E11D48', '#C026D3', 350, 325,
    { lightL1: 0.55, lightC1: 0.22, lightL2: 0.52, lightC2: 0.22,
      darkL1: 0.74, darkC1: 0.20, darkL2: 0.72, darkC2: 0.20 }),

  // ── Additional Premium Gradients ──

  // Blue → Purple (deep twilight)
  'gradient-twilight': makeGradient(
    'gradient-twilight', 'Twilight', '#3B82F6', '#8B5CF6', 245, 290,
    { lightL1: 0.52, lightC1: 0.22, lightL2: 0.50, lightC2: 0.22,
      darkL1: 0.70, darkC1: 0.20, darkL2: 0.72, darkC2: 0.20, angle: 120 }),

  // Emerald → Blue (deep sea)
  'gradient-deep-sea': makeGradient(
    'gradient-deep-sea', 'Deep Sea', '#059669', '#2563EB', 165, 250,
    { lightL1: 0.54, lightC1: 0.18, lightL2: 0.52, lightC2: 0.22,
      darkL1: 0.72, darkC1: 0.16, darkL2: 0.70, darkC2: 0.20, angle: 135 }),

  // Pink → Orange (flamingo)
  'gradient-flamingo': makeGradient(
    'gradient-flamingo', 'Flamingo', '#EC4899', '#F97316', 340, 45,
    { lightL1: 0.58, lightC1: 0.22, lightL2: 0.62, lightC2: 0.20,
      darkL1: 0.76, darkC1: 0.20, darkL2: 0.76, darkC2: 0.18, angle: 135 }),

  // Slate → Blue (steel)
  'gradient-steel': makeGradient(
    'gradient-steel', 'Steel', '#475569', '#3B82F6', 240, 250,
    { lightL1: 0.44, lightC1: 0.04, lightL2: 0.52, lightC2: 0.22,
      darkL1: 0.68, darkC1: 0.04, darkL2: 0.70, darkC2: 0.20, angle: 150 }),

  // Violet → Cyan (electric)
  'gradient-electric': makeGradient(
    'gradient-electric', 'Electric', '#7C3AED', '#06B6D4', 290, 200,
    { lightL1: 0.50, lightC1: 0.22, lightL2: 0.56, lightC2: 0.16,
      darkL1: 0.74, darkC1: 0.20, darkL2: 0.76, darkC2: 0.14, angle: 135 }),

  // Teal → Emerald (mint)
  'gradient-mint-fresh': makeGradient(
    'gradient-mint-fresh', 'Mint Fresh', '#14B8A6', '#10B981', 175, 160,
    { lightL1: 0.56, lightC1: 0.16, lightL2: 0.55, lightC2: 0.18,
      darkL1: 0.74, darkC1: 0.15, darkL2: 0.72, darkC2: 0.17, angle: 120 }),

  // Red → Purple (royal)
  'gradient-royal': makeGradient(
    'gradient-royal', 'Royal', '#DC2626', '#7C3AED', 25, 290,
    { lightL1: 0.55, lightC1: 0.22, lightL2: 0.50, lightC2: 0.22,
      darkL1: 0.72, darkC1: 0.20, darkL2: 0.74, darkC2: 0.20, angle: 135 }),

  // Amber → Emerald (tropical)
  'gradient-tropical': makeGradient(
    'gradient-tropical', 'Tropical', '#F59E0B', '#059669', 80, 160,
    { lightL1: 0.68, lightC1: 0.18, lightL2: 0.55, lightC2: 0.18,
      darkL1: 0.78, darkC1: 0.16, darkL2: 0.72, darkC2: 0.17, angle: 135 }),
};

// Combined presets
export const ALL_PRESETS = { ...COLOR_PRESETS, ...GRADIENT_PRESETS };

// Default preset
export const DEFAULT_PRESET = 'ocean-blue';

// Apply a preset's CSS variables to the document
export function applyAccentPreset(presetId, isDark) {
  if (typeof document === 'undefined') return;
  const preset = ALL_PRESETS[presetId];
  if (!preset) return;

  const vars = isDark ? preset.dark : preset.light;
  const root = document.documentElement;

  // Set/remove gradient data attribute for CSS targeting
  if (preset.type === 'gradient' && vars['--accent-gradient']) {
    root.setAttribute('data-accent-gradient', 'true');
  } else {
    root.removeAttribute('data-accent-gradient');
    root.style.removeProperty('--accent-gradient');
  }

  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

// Clear all accent CSS variable overrides (restore CSS defaults)
export function clearAccentPreset() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.removeAttribute('data-accent-gradient');
  const allKeys = new Set();
  Object.values(ALL_PRESETS).forEach((preset) => {
    Object.keys(preset.light).forEach((k) => allKeys.add(k));
    Object.keys(preset.dark).forEach((k) => allKeys.add(k));
  });
  allKeys.forEach((key) => root.style.removeProperty(key));
}

// Cache preset vars to localStorage for FOUC prevention
export function cacheAccentPreset(presetId) {
  if (typeof localStorage === 'undefined') return;
  const preset = ALL_PRESETS[presetId];
  if (!preset) return;
  try {
    localStorage.setItem('accent-color-cache', JSON.stringify({
      id: presetId,
      type: preset.type,
      light: preset.light,
      dark: preset.dark,
    }));
  } catch (e) {
    // Storage full or unavailable
  }
}
