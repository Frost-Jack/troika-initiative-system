import {MODULE_ID} from "./bag.js";
import {freshBag, getInit} from "./combat.js";
import {applyTheme} from "./themes.js";
import {BagStage} from "./visuals.js";
import {ANIMATION_DURATION} from "./motion.js";

const stages = new Map();
const trackers = new Map();
const pendingPours = new Map();
let revealTimer;
let revealCombatId;
const t = key => game.i18n.localize(`TIS.${key}`);
const element = html => html instanceof HTMLElement ? html : html?.[0];
const theme = () => game.settings.get(MODULE_ID, "theme");

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function disposeWithin(root) {
  for (const [container, stage] of stages) {
    const retained = [...trackers.values()].some(state => state.container === container);
    if ((!container.isConnected && !retained) || root?.contains(container)) {
      stage.destroy();
      stages.delete(container);
    }
  }
}

function visibleChip(combat, last) {
  if (!last || last.kind === "refill" || last.kind === "join" || last.kind === "add") {
    return {label: t("Ready"), image: null, kind: "back"};
  }
  if (last.kind === "end") return {label: t("EndRound"), image: null, kind: "end"};
  const combatant = combat.combatants.get(last.id);
  if (!combatant || (!game.user.isGM && (!combatant.visible || combatant.hidden || combatant.token?.hidden))) {
    return {label: t("Hidden"), image: null, kind: "back"};
  }
  const image = combatant.token?.texture?.src || combatant.img || combatant.actor?.img;
  return {label: combatant.name, image, kind: "actor"};
}

function stageError(container, error) {
  const stage = stages.get(container);
  if (!stage) return;
  if (error) console.warn(`${MODULE_ID} | Animation failed`, error);
  stage.destroy();
  container.dataset.renderFailed = "true";
  container.removeAttribute("aria-hidden");
  container.replaceChildren(node("span", "tis-stage-error", t("AnimationError")));
}

function addStage(parent, info, mode = "static", chips = []) {
  const stage = node("div", "tis-stage");
  stage.setAttribute("aria-hidden", "true");
  parent.append(stage);
  const scene = new BagStage(stage, {theme: theme(), info, mode, chips});
  stages.set(stage, scene);
  scene.ready.then(() => {
    if (stage.dataset.renderFailed === "true") stageError(stage);
  }, error => stageError(stage, error));
  return stage;
}

function updatePanel(state, combat, bag) {
  if (state.disposed) return;
  state.combat = combat; state.bag = bag;
  const {panel} = state;
  const header = panel.querySelector(".tis-panel-header");
  header.replaceChildren();
  header.append(node("strong", null, t("Bag")));
  if (game.user.isGM) {
    const remaining = bag.entries.reduce((n, e) => n + (combat.combatants.get(e.id)?.isDefeated === false ? e.remaining : 0), 1);
    header.append(node("small", null, `${t("Remaining")}: ${remaining}`));
  }
  const info = visibleChip(combat, bag.last);
  const pouring = state.pouring && state.pourSequence === bag.sequence;
  panel.querySelector(".tis-chip-caption").textContent = pouring ? state.pourCaption : info.label;
  const detail = panel.querySelector(".tis-panel-detail");
  detail.textContent = pouring && game.user.isGM ? `+${state.pourTotal}` : "";
  detail.hidden = !detail.textContent;
  let button = panel.querySelector(".tis-draw");
  if (!game.user.isGM) button?.remove();
  else if (!button) {
    button = node("button", "tis-draw");
    button.type = "button";
    button.addEventListener("click", async () => {
      state.drawingRequest = true;
      updatePanel(state, state.combat, state.bag);
      try {
        const current = state.combat;
        await (current.started ? current.nextTurn() : current.startCombat());
      } catch (error) {
        console.error(`${MODULE_ID} | Draw failed`, error);
        ui.notifications.error(t("DrawError"));
      } finally {
        state.drawingRequest = false;
        updatePanel(state, state.combat, state.bag);
      }
    });
    panel.append(button);
  }
  if (game.user.isGM) {
    button.textContent = t(combat.started ? "Draw" : "Start");
    button.disabled = game.users.activeGM?.id !== game.user.id || state.pouring || state.drawingRequest;
  }
}

function isFreshPour(bag) {
  const age = Date.now() - Number(bag.last?.time);
  return ["add", "refill", "end"].includes(bag.last?.kind) && age >= 0 && age <= 10000;
}

function prunePendingPours() {
  const now = performance.now();
  for (const [id, pending] of pendingPours) {
    if (now - pending.receivedAt > 10000) pendingPours.delete(id);
  }
}

function playPanelPour(state, combat, bag, live = false, afterEndDraw = false) {
  if (bag.last?.kind === "end" && !afterEndDraw) return;
  if ((!live && !isFreshPour(bag)) || state.pourSequence === bag.sequence) return;
  const added = bag.last.kind === "add" ? bag.last.added ?? []
    : bag.entries.filter(e => e.remaining > 0).map(e => ({id: e.id, count: e.remaining}));
  const counts = added.map(entry => ({id: entry.id, count: entry.count}));
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  let remaining = total;
  const chips = [];
  while (chips.length < 7 && remaining > 0) {
    let ticket = Math.floor(Math.random() * remaining);
    for (const entry of counts) {
      if (ticket < entry.count) {
        chips.push(visibleChip(combat, {kind: "draw", id: entry.id}));
        entry.count--; remaining--;
        break;
      }
      ticket -= entry.count;
    }
  }
  const sequence = bag.sequence;
  state.pourSequence = sequence;
  state.pouring = true;
  state.pourCaption = t(bag.last.kind === "add" ? "Added" : bag.last.kind === "end" ? "EndRound" : "Ready");
  state.pourTotal = total;
  updatePanel(state, combat, bag);
  state.stage.playPour(chips).catch(error => stageError(state.container, error)).finally(() => {
    if (state.disposed || state.pourSequence !== sequence) return;
    state.pouring = false;
    updatePanel(state, state.combat, state.bag);
  });
}

export function renderTracker(app, html) {
  prunePendingPours();
  const root = element(html);
  if (!root) return;
  const combat = app.viewed ?? app.combat;
  let state = trackers.get(app);
  if (state && (!combat || state.combat.id !== combat.id || state.theme !== theme())) {
    if (state.combat.id !== combat?.id && revealCombatId === state.combat.id) destroyVisuals();
    state.disposed = true;
    trackers.delete(app);
    disposeWithin(state.panel); state.panel.remove(); state = null;
  }
  if (!combat) {
    root.classList.remove("tis-tracker");
    return;
  }
  root.classList.add("tis-tracker");
  const stored = combat.getFlag(MODULE_ID, "bag");
  const bag = stored?.round === combat.round ? stored : freshBag(combat, combat.round);
  const pending = pendingPours.get(combat.id);
  if (pending && (pending.sequence !== bag.sequence || performance.now() - pending.receivedAt > 10000)) pendingPours.delete(combat.id);
  const changedSequence = state && state.sequence !== bag.sequence;
  if (!state) {
    const panel = node("section", "tis-panel tis-themed");
    applyTheme(panel, theme());
    panel.append(node("div", "tis-panel-header"));
    const container = addStage(panel, {kind: "back"});
    panel.append(node("div", "tis-chip-caption"), node("div", "tis-panel-detail"));
    state = {panel, container, stage: stages.get(container), combat, theme: theme()};
    trackers.set(app, state);
  }
  const {panel} = state;
  root.querySelectorAll(".tis-panel").forEach(other => {
    if (other !== panel) { disposeWithin(other); other.remove(); }
  });
  const trackerHeader = root.querySelector(".combat-tracker-header");
  if (trackerHeader) trackerHeader.after(panel);
  else (root.querySelector(".window-content") ?? root).prepend(panel);
  updatePanel(state, combat, bag);
  if (combat.active && (changedSequence || pendingPours.has(combat.id))) {
    playPanelPour(state, combat, bag, pendingPours.has(combat.id), pendingPours.get(combat.id)?.afterEndDraw);
    pendingPours.delete(combat.id);
  }
  state.sequence = bag.sequence;

  for (const row of root.querySelectorAll("[data-combatant-id]")) {
    const combatant = combat.combatants.get(row.dataset.combatantId);
    if (!combatant) continue;
    const count = row.querySelector(".token-initiative");
    if (count) {
      const entry = bag.entries.find(e => e.id === combatant.id);
      const badge = node("span", "tis-count", `${combatant.isDefeated ? 0 : entry?.remaining ?? 0}/${entry?.total ?? 0}`);
      badge.title = t("CountHint");
      count.replaceChildren(badge);
    }
  }
  if (!game.user.isGM) {
    root.querySelectorAll('[data-control="nextTurn"], [data-action="nextTurn"]').forEach(e => e.hidden = true);
  }
}

export function renderCombatantConfig(app, html) {
  const root = element(html);
  const combatant = app.document ?? app.object;
  if (!root || !combatant || !game.user.isGM || root.querySelector(".tis-init-field")) return;
  const group = node("div", "form-group tis-init-field");
  const label = node("label", null, "Init");
  const input = node("input");
  input.type = "number"; input.step = "1"; input.value = String(getInit(combatant));
  input.id = `tis-init-${combatant.id}`; label.htmlFor = input.id;
  if (game.system.id === "lfg") {
    input.disabled = true; input.title = t("LfgInit");
  } else input.name = `flags.${MODULE_ID}.init`;
  group.append(label, input);
  const form = root.matches("form") ? root : root.querySelector("form");
  const footer = form?.querySelector("footer, .form-footer");
  if (footer) footer.before(group);
  else form?.append(group);
}

export function destroyTracker(app, html) {
  const state = trackers.get(app);
  if (state) {
    state.disposed = true;
    trackers.delete(app);
    disposeWithin(state.panel); state.panel.remove();
  }
  disposeWithin(element(html) ?? element(app.element));
}

export function destroyVisuals() {
  clearTimeout(revealTimer);
  revealCombatId = null;
  const reveal = document.getElementById("tis-reveal");
  if (reveal) { disposeWithin(reveal); reveal.remove(); }
  disposeWithin();
}

export function destroyCombatVisuals(combat) {
  pendingPours.delete(combat.id);
  if (revealCombatId === combat.id) destroyVisuals();
  for (const [app, state] of trackers) {
    if (state.combat.id === combat.id) destroyTracker(app);
  }
}

export function destroyAllVisuals() {
  destroyVisuals();
  for (const app of trackers.keys()) destroyTracker(app);
  pendingPours.clear();
}

export function refreshTrackerControls() {
  if (!game.user.isGM) destroyVisuals();
  for (const state of trackers.values()) updatePanel(state, state.combat, state.bag);
}

export function onCombatUpdate(combat, changed) {
  prunePendingPours();
  const viewed = ui.combat?.viewed ?? ui.combat?.combat ?? game.combat
    ?? [...trackers.values()].find(state => state.panel.isConnected)?.combat;
  if (!viewed || viewed.id !== combat.id) return;
  if (combat.id === revealCombatId && changed.active === false) destroyVisuals();
  if (changed.flags?.[MODULE_ID]?.bag?.sequence === undefined) return;
  const bag = combat.getFlag(MODULE_ID, "bag");
  if (!bag?.last || !combat.active || bag.last.kind === "join") return;
  destroyVisuals();
  revealCombatId = combat.id;
  if (["add", "refill"].includes(bag.last.kind)) {
    let handled = false;
    for (const state of trackers.values()) {
      if (state.combat.id === combat.id) {
        // The update hook is a live receipt; GM and player wall clocks may differ.
        playPanelPour(state, combat, bag, true);
        handled = true;
      }
    }
    if (!handled) pendingPours.set(combat.id, {sequence: bag.sequence, receivedAt: performance.now()});
    return;
  }
  for (const state of trackers.values()) {
    if (state.combat.id === combat.id) updatePanel(state, combat, bag);
  }
  const info = visibleChip(combat, bag.last);
  const reveal = node("section", "tis-reveal tis-themed tis-drawing");
  reveal.id = "tis-reveal"; reveal.setAttribute("role", "status");
  applyTheme(reveal, theme());
  const header = node("header", "tis-reveal-header");
  const shownRound = bag.last.kind === "end" ? Math.max(1, combat.round - 1) : combat.round;
  header.append(node("span", "tis-round-label", `${t("Round")} ${shownRound}`));
  reveal.append(header);
  const stage = addStage(reveal, info, "draw");
  reveal.append(node("div", "tis-chip-caption", info.label));
  document.body.append(reveal);
  const scheduleRemoval = () => {
    if (stage.isConnected) revealTimer = setTimeout(destroyVisuals, ANIMATION_DURATION.draw + 1250);
  };
  stages.get(stage).ready.then(scheduleRemoval, scheduleRemoval);
  if (bag.last.kind === "end") {
    const scene = stages.get(stage);
    const endSequence = bag.sequence;
    scene.ready.then(async () => {
      await scene.finished;
      if (!stage.isConnected || !combat.active || combat.getFlag(MODULE_ID, "bag")?.sequence !== endSequence) return;
      let handled = false;
      for (const state of trackers.values()) {
        if (state.combat.id === combat.id) {
          playPanelPour(state, combat, bag, true, true);
          handled = true;
        }
      }
      if (!handled) pendingPours.set(combat.id, {sequence: endSequence, receivedAt: performance.now(), afterEndDraw: true});
    }).catch(error => stageError(stage, error));
  }
}
