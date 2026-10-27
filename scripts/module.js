import {MODULE_ID} from "./bag.js";
import {createTroikaCombat} from "./combat.js";
import {createTroikaActiveEffect, refreshCombatEffects} from "./effects.js";
import {THEMES} from "./themes.js";
import {renderTracker, renderCombatantConfig, onCombatUpdate, destroyTracker, destroyVisuals,
  destroyCombatVisuals, destroyAllVisuals, refreshTrackerControls} from "./ui.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "baseTokens", {
    name: "TIS.BaseTokens", hint: "TIS.BaseTokensHint",
    scope: "world", config: true, type: Number, default: 2,
    onChange: () => ui.combat?.render(false)
  });
  game.settings.register(MODULE_ID, "joinMode", {
    name: "TIS.JoinMode", hint: "TIS.JoinModeHint", scope: "world", config: true,
    type: String, default: "nextRound",
    choices: {nextRound: "TIS.JoinNextRound", immediate: "TIS.JoinImmediate"}
  });
  game.settings.register(MODULE_ID, "effectDurationMode", {
    name: "TIS.EffectDurationMode", hint: "TIS.EffectDurationModeHint",
    scope: "world", config: true, type: String, default: "round",
    choices: {round: "TIS.EffectDurationRound", turn: "TIS.EffectDurationTurn"},
    onChange: () => {
      for (const combat of game.combats?.contents ?? game.combats?.values?.() ?? []) refreshCombatEffects(combat);
    }
  });
  game.settings.register(MODULE_ID, "theme", {
    name: "TIS.Theme", hint: "TIS.ThemeHint", scope: "client", config: true,
    type: String, default: "fantasy",
    choices: Object.fromEntries(Object.keys(THEMES).map(id => [id, `TIS.Theme_${id}`])),
    onChange: () => { destroyVisuals(); ui.combat?.render(false); }
  });
  CONFIG.Combat.documentClass = createTroikaCombat(CONFIG.Combat.documentClass);
  CONFIG.ActiveEffect.documentClass = createTroikaActiveEffect(CONFIG.ActiveEffect.documentClass);
});

Hooks.on("renderCombatTracker", renderTracker);
Hooks.on("closeCombatTracker", destroyTracker);
Hooks.on("renderCombatantConfig", renderCombatantConfig);
Hooks.on("updateCombat", onCombatUpdate);
Hooks.on("deleteCombat", destroyCombatVisuals);
Hooks.on("canvasTearDown", destroyAllVisuals);
Hooks.on("canvasReady", () => ui.combat?.render(false));
Hooks.on("userConnected", refreshTrackerControls);
Hooks.on("updateUser", (_user, changed) => {
  if ("role" in changed || "active" in changed) refreshTrackerControls();
});
Hooks.on("createCombatant", combatant => {
  void combatant.parent.syncBagParticipants().catch(error => console.error(`${MODULE_ID} | Join`, error));
});
Hooks.on("deleteCombatant", combatant => {
  void combatant.parent.releaseActorEffects(combatant.actor).catch(error => console.error(`${MODULE_ID} | Effect duration`, error));
});
