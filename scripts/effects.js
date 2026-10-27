import {MODULE_ID} from "./bag.js";

export const EFFECT_CLOCK = "effectClock";
const actorKey = actor => actor?.uuid ?? actor?.id;
const effectKey = effect => effect.uuid ? encodeURIComponent(effect.uuid).replaceAll(".", "%2E") : null;
const mode = () => game.settings?.get(MODULE_ID, "effectDurationMode") === "turn" ? "turn" : "round";
const roundTime = () => CONFIG.time.roundTime;
const signature = effect => {
  const d = effect._source.duration;
  return JSON.stringify([d.seconds, d.rounds, d.turns, d.startTime, d.startRound, d.startTurn,
    d.units, d.value, effect._source.start ?? effect.start]);
};

function actorsIn(combat) {
  return [...new Map(Array.from(combat.combatants ?? [], c => c.actor).filter(Boolean)
    .map(actor => [actorKey(actor), actor])).values()];
}

function effectsOf(actor) {
  return actor.allApplicableEffects ? [...actor.allApplicableEffects()] : Array.from(actor.effects ?? []);
}

function durationEntry(effect, actor, combat) {
  const d = effect._source.duration;
  const modern = d.units !== undefined;
  const combatBased = modern ? ["rounds", "turns"].includes(d.units) : d.seconds == null;
  const value = modern ? d.value : combatBased ? (d.rounds ?? 0) + (d.turns ?? 0) : d.seconds;
  if (value == null || !Number.isFinite(value) || (!modern && combatBased && value === 0)) return null;
  const units = combatBased ? (modern ? d.units : "rounds") : (modern ? d.units : "seconds");
  const unitSeconds = combatBased ? roundTime() : modern && value > 0 ? effect.duration.seconds / value : 1;
  if (!(unitSeconds > 0) || !Number.isFinite(unitSeconds)) return null;
  const now = game.time?.worldTime ?? 0;
  const start = effect._source.start ?? effect.start;
  const elapsed = combatBased ? Math.max(0, combat.round - (modern ? start?.round ?? combat.round : d.startRound ?? combat.round))
    : Math.max(0, now - (modern ? start?.time ?? now : d.startTime ?? now)) / unitSeconds;
  return {uuid: effect.uuid, owner: actorKey(actor), signature: signature(effect),
    kind: combatBased ? "combat" : "time", units, unitSeconds, remaining: Math.max(0, value - elapsed)};
}

export function advanceEffectClock(combat, {round = combat.round, completedActor = null} = {}) {
  const previous = combat.getFlag(MODULE_ID, EFFECT_CLOCK)?.effects ?? {};
  const clock = {mode: mode(), effects: {}};
  const rounds = combat.started ? Math.max(0, round - combat.round) : 0;
  for (const actor of actorsIn(combat)) {
    const steps = clock.mode === "turn" ? Number(Boolean(completedActor) && actorKey(actor) === actorKey(completedActor)) : rounds;
    for (const effect of effectsOf(actor)) {
      const key = effectKey(effect);
      if (!key) continue;
      const old = previous[key];
      const entry = old?.signature === signature(effect) ? {...old} : durationEntry(effect, actor, combat);
      if (!entry) continue;
      const spent = steps * (entry.kind === "time" ? roundTime() / entry.unitSeconds : 1);
      entry.remaining = Math.max(0, entry.remaining - spent);
      if (entry.remaining < 1e-9) entry.remaining = 0;
      clock.effects[key] = entry;
    }
  }
  for (const key of Object.keys(previous)) {
    if (!(key in clock.effects)) clock.effects[`-=${key}`] = null;
  }
  return clock;
}

function combatFor(effect, actor) {
  const start = effect._source.start ?? effect.start;
  const candidates = [start?.combat ? game.combats?.get(start.combat) : null, game.combat,
    ...(game.combats?.values?.() ?? [])];
  return candidates.find(combat => combat?.started && combat.getFlag(MODULE_ID, "bag")
    && combat.getCombatantsByActor(actor).length);
}

export function refreshCombatEffects(combat) {
  for (const actor of actorsIn(combat)) {
    for (const effect of effectsOf(actor)) effect.updateDuration?.();
  }
}

export async function releaseCombatEffects(combat, actor = null) {
  const entries = combat.getFlag(MODULE_ID, EFFECT_CLOCK)?.effects ?? {};
  const groups = new Map();
  for (const owner of actor ? [actor] : actorsIn(combat)) {
    for (const effect of effectsOf(owner)) {
      const entry = entries[effectKey(effect)];
      if (!entry || entry.signature !== signature(effect)) continue;
      const data = effect._source.duration;
      const now = game.time.worldTime;
      const seconds = entry.remaining * entry.unitSeconds;
      const update = data.units !== undefined ? {
        _id: effect.id, "duration.value": entry.kind === "combat" ? seconds : entry.remaining,
        "duration.units": entry.kind === "combat" ? "seconds" : entry.units,
        "start.time": now, "start.combat": null, "start.combatant": null, "start.round": null, "start.turn": null
      } : {_id: effect.id, "duration.seconds": seconds, "duration.rounds": 0, "duration.turns": 0,
        "duration.startTime": now, "duration.startRound": null, "duration.startTurn": null,
        ...(seconds === 0 ? {disabled: true} : {})};
      if (!groups.has(effect.parent)) groups.set(effect.parent, []);
      groups.get(effect.parent).push(update);
    }
  }
  await Promise.all([...groups].map(([parent, updates]) => parent.updateEmbeddedDocuments("ActiveEffect", updates)));
}

export function createTroikaActiveEffect(BaseEffect) {
  return class TroikaActiveEffect extends BaseEffect {
    _prepareDuration(...args) {
      const result = super._prepareDuration(...args);
      const data = args[0] ?? this._source.duration;
      const modern = data.units !== undefined;
      const actor = this.target ?? this.actor;
      const combat = actor ? combatFor(this, actor) : null;
      const entry = combat?.getFlag(MODULE_ID, EFFECT_CLOCK)?.effects?.[effectKey(this)];
      if (entry?.signature === signature(this)) {
        const remaining = entry.remaining;
        const displayed = Number(remaining.toFixed(3));
        const unit = entry.kind === "combat" ? `COMBAT.${mode() === "turn" ? "Turn" : "Round"}${remaining === 1 ? "" : "s"}`
          : entry.units === "seconds" ? "Seconds" : `TIS.EffectUnit_${entry.units}`;
        return {...result, remaining, label: `${displayed} ${game.i18n.localize(unit)}`,
          ...(modern ? {secondsRemaining: remaining * entry.unitSeconds,
            expired: remaining > 0 ? Boolean(data.expired) : (!data.expiry || result.expired)} : {})};
      }
      const rounds = modern ? (data.units === "rounds" ? data.value : null)
        : (data.seconds == null && !data.turns && data.rounds ? data.rounds : null);
      if (rounds == null) return result;
      const start = modern ? this.start?.round : data.startRound;
      if (start == null || !combat) return result;
      const remaining = Math.max(0, Number(rounds) - Math.max(0, combat.round - start));
      const label = `${remaining} ${game.i18n.localize(remaining === 1 ? "COMBAT.Round" : "COMBAT.Rounds")}`;
      // Preserve native expiry events and cached time values; only remove turn-index fractions.
      return {...result, remaining, label,
        ...(modern ? {secondsRemaining: remaining * CONFIG.time.roundTime} : {})};
    }
  };
}
