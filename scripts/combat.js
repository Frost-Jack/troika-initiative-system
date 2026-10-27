import {MODULE_ID, fillBag, drawToken, tokenCount, addParticipants} from "./bag.js";
import {getLfgInit} from "./integrations/lfg.js";
import {EFFECT_CLOCK, advanceEffectClock, refreshCombatEffects, releaseCombatEffects} from "./effects.js";

export function getInit(combatant) {
  if (game.system.id === "lfg") return getLfgInit(combatant.actor);
  const value = Number(combatant.getFlag(MODULE_ID, "init") ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function isEnemy(combatant) {
  return !combatant.actor?.hasPlayerOwner &&
    combatant.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
}

export function participants(combat) {
  const base = game.settings.get(MODULE_ID, "baseTokens");
  return combat.combatants.filter(c => !c.isDefeated).map(c => ({
    id: c.id, total: tokenCount(base, getInit(c)), enemy: isEnemy(c)
  }));
}

export function freshBag(combat, round, sequence = 0) {
  return fillBag(participants(combat), round, sequence);
}

export function createTroikaCombat(BaseCombat) {
  return class TroikaCombat extends BaseCombat {
    #busy = false;
    #repeatEvents = Promise.resolve();
    #joinPending = false;

    get nextCombatant() { return null; }

    async #run(action) {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) {
        ui.notifications.warn(game.i18n.localize("TIS.ActiveGM"));
        return this;
      }
      if (this.#busy) return this;
      this.#busy = true;
      try {
        await this.#repeatEvents;
        return await action();
      } finally {
        this.#busy = false;
        if (this.#joinPending) {
          this.#joinPending = false;
          void this.syncBagParticipants().catch(error => console.error(`${MODULE_ID} | Join`, error));
        }
      }
    }

    async #refill(round, kind) {
      const sequence = (this.getFlag(MODULE_ID, "bag")?.sequence ?? 0) + 1;
      const bag = freshBag(this, round, sequence);
      if (kind) bag.last = {kind, id: null, time: Date.now()};
      const data = {round, turn: null, [`flags.${MODULE_ID}.bag`]: bag,
        [`flags.${MODULE_ID}.${EFFECT_CLOCK}`]: advanceEffectClock(this, {
          round, completedActor: round > this.round ? this.combatant?.actor : null
        })};
      const options = {direction: 1, worldTime: {delta: this.started && round > this.round ? CONFIG.time.roundTime : 0}};
      if (!this.started && round > 0) {
        this._playCombatSound("startEncounter");
        Hooks.callAll("combatStart", this, data);
      } else if (round !== this.round) Hooks.callAll("combatRound", this, data, options);
      return this.update(data, options);
    }

    async startCombat() {
      return this.#run(() => this.started ? this : this.#refill(1, "refill"));
    }

    async nextRound() {
      return this.#run(() => this.#refill(this.round + 1, "refill"));
    }

    async nextTurn() {
      return this.#run(async () => {
        if (!this.started) return this.#refill(1, "refill");
        let bag = this.getFlag(MODULE_ID, "bag");
        bag = bag?.round === this.round ? foundry.utils.deepClone(bag) : freshBag(this, this.round);
        const eligible = new Set(this.combatants.filter(c => !c.isDefeated).map(c => c.id));
        const draw = drawToken(bag, eligible);
        if (draw.id === null) return this.#refill(this.round + 1, "end");
        bag.entries = draw.entries;
        bag.sequence++;
        bag.last = {kind: "draw", id: draw.id, time: Date.now()};
        const turn = this.turns.findIndex(c => c.id === draw.id);
        const data = {round: this.round, turn, [`flags.${MODULE_ID}.bag`]: bag,
          [`flags.${MODULE_ID}.${EFFECT_CLOCK}`]: advanceEffectClock(this, {completedActor: this.combatant?.actor})};
        const options = {direction: 1, worldTime: {delta: 0}};
        Hooks.callAll("combatTurn", this, data, options);
        return this.update(data, options);
      });
    }

    async resetAll() {
      return this.#run(() => this.#refill(this.round, "refill"));
    }

    async syncBagParticipants() {
      if (!this.started || game.users.activeGM?.id !== game.user.id) return this;
      if (this.#busy) {
        this.#joinPending = true;
        return this;
      }
      return this.#run(async () => {
        const bag = this.getFlag(MODULE_ID, "bag");
        if (!bag || bag.round !== this.round) return this;
        const updated = addParticipants(bag, participants(this), game.settings.get(MODULE_ID, "joinMode") === "immediate");
        return updated ? this.update({[`flags.${MODULE_ID}.bag`]: updated,
          [`flags.${MODULE_ID}.${EFFECT_CLOCK}`]: advanceEffectClock(this)}, {turnEvents: false}) : this;
      });
    }

    async releaseActorEffects(actor) {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || !actor || this.getCombatantsByActor(actor).length) return;
      return releaseCombatEffects(this, actor);
    }

    async _preDelete(...args) {
      const allowed = await super._preDelete?.(...args);
      if (allowed === false) return false;
      if (game.user.isGM) await releaseCombatEffects(this);
      return allowed;
    }

    async previousTurn() {
      ui.notifications.warn(game.i18n.localize("TIS.NoRewind"));
      return this;
    }

    async previousRound() { return this.previousTurn(); }
    async rollInitiative() { return this; }

    _onUpdate(changed, options, userId) {
      const previous = {...this.current};
      if (changed.flags?.[MODULE_ID]?.[EFFECT_CLOCK]) refreshCombatEffects(this);
      const result = super._onUpdate(changed, options, userId);
      const bag = this.getFlag(MODULE_ID, "bag");
      const repeated = changed.flags?.[MODULE_ID]?.bag?.sequence !== undefined &&
        bag?.last?.kind === "draw" && previous.round === this.round &&
        previous.combatantId === this.combatant?.id;
      if (repeated) {
        // Core detects changed combatant IDs; two consecutive chips can name the same actor.
        const combatant = this.combatant;
        const current = {...this.current};
        this.#repeatEvents = this.#repeatEvents.then(async () => {
          if (game.users.activeGM?.id === game.user.id) {
            const registry = CONFIG.ActiveEffect?.documentClass.registry;
            const context = {combat: this, actors: new Set([combatant.actor].filter(Boolean))};
            await this._onEndTurn(combatant, {...previous, skipped: false});
            await registry?.refresh("turnEnd", context);
            await this.clearMovementHistories?.([combatant]);
            await this._onStartTurn(combatant, {...current, skipped: false});
            await registry?.refresh("turnStart", context);
          }
          Hooks.callAll("combatTurnChange", this, previous, current);
        }).catch(error => console.error(`${MODULE_ID} | Turn events`, error));
      }
      return result;
    }
  };
}
