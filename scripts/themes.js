export const THEMES = {
  fantasy: {cloth: "#34313b", metal: "#c7a164", recess: "#55412b", accent: "#c4a570", background: "#211e28", ink: "#f0e5d0", pattern: "rune", metalness: .72, roughness: .3},
  nature: {cloth: "#304638", metal: "#b29261", recess: "#473724", accent: "#b3c590", background: "#17291f", ink: "#edf0da", pattern: "leaf", metalness: .05, roughness: .82},
  dragon: {cloth: "#4a2429", metal: "#c48749", recess: "#512821", accent: "#edaa65", background: "#2c1318", ink: "#f5e0c8", pattern: "claw", metalness: .7, roughness: .4},
  frost: {cloth: "#354650", metal: "#afcbd7", recess: "#3c5667", accent: "#aadce5", background: "#152832", ink: "#e9f5f7", pattern: "snow", metalness: .25, roughness: .16},
  arcane: {cloth: "#2c3553", metal: "#b3a0ce", recess: "#3b3157", accent: "#bea7de", background: "#1b1d38", ink: "#eae3f5", pattern: "star", metalness: .5, roughness: .25},
  gothic: {cloth: "#28292c", metal: "#a6a7ab", recess: "#37383c", accent: "#c2b8ae", background: "#18191c", ink: "#e7e2dc", pattern: "arch", metalness: .85, roughness: .48}
};

export function getTheme(id) { return THEMES[id] ?? THEMES.fantasy; }

export function applyTheme(element, id) {
  const theme = getTheme(id);
  element.dataset.tisTheme = THEMES[id] ? id : "fantasy";
  for (const [key, value] of Object.entries({bg: theme.background, ink: theme.ink, accent: theme.accent, edge: theme.recess})) {
    element.style.setProperty(`--tis-${key}`, value);
  }
}
