export const MODULE_ID = "troika-initiative-system";
export const ENEMY_LIMIT = 15;

export function tokenCount(base, init) {
  const value = Number(base) + Number(init);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}


export function allocateTokens(participants, limit = ENEMY_LIMIT, random = Math.random) {
  const entries = participants.map(p => ({...p, total: tokenCount(p.total, 0)}));
  const enemies = entries.filter(p => p.enemy && p.total > 0);
  const requested = enemies.reduce((n, p) => n + p.total, 0);
  if (requested <= limit) return entries;
  const shares = enemies.map(p => {
    const share = p.total * limit / requested;
    p.total = Math.floor(share);
    return {entry: p, remainder: share - p.total, tie: random()};
  });
  let extra = limit - enemies.reduce((n, p) => n + p.total, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.tie - b.tie);
  for (const {entry} of shares) {
    if (extra-- <= 0) break;
    entry.total++;
  }
  return entries;
}

export function fillBag(participants, round, sequence = 0, random = Math.random) {
  return {
    round, sequence, last: null,
    entries: allocateTokens(participants, ENEMY_LIMIT, random)
      .map(({id, total, enemy}) => ({id, total, remaining: total, enemy: Boolean(enemy)}))
  };
}

function removeIneligibleTokens(entries, eligibleIds) {
  return entries.map(e => eligibleIds.has(e.id) || !e.remaining ? {...e}
    : {...e, discarded: (e.discarded ?? 0) + e.remaining, remaining: 0});
}

export function addParticipants(bag, participants, immediate, random = Math.random) {
  const known = new Set(bag.entries.map(e => e.id));
  const newcomers = participants.filter(p => !known.has(p.id));
  if (!newcomers.length) return null;
  const current = new Map(participants.map(p => [p.id, p]));
  const entries = removeIneligibleTokens(bag.entries, current)
    .map(e => ({...e, enemy: e.enemy ?? current.get(e.id)?.enemy ?? false}));
  entries.push(...newcomers.map(p => ({id: p.id, total: immediate ? p.total : 0,
    remaining: immediate ? p.total : 0, enemy: Boolean(p.enemy)})));
  if (immediate) {
    const spent = entries.filter(e => e.enemy).reduce((sum, e) => sum + e.total - e.remaining - (e.discarded ?? 0), 0);
    const allocated = allocateTokens(entries.map(e => ({id: e.id, total: e.remaining, enemy: e.enemy})),
      Math.max(0, ENEMY_LIMIT - spent), random);
    entries.forEach((e, i) => {
      const discarded = e.discarded ?? 0;
      const used = e.total - e.remaining - discarded;
      e.remaining = allocated[i].total;
      e.total = used + e.remaining + discarded;
    });
  }
  const added = entries.filter(e => !known.has(e.id) && e.remaining > 0)
    .map(e => ({id: e.id, count: e.remaining}));
  return {...bag, entries, sequence: bag.sequence + 1,
    last: {kind: added.length ? "add" : "join", id: null, added, time: Date.now()}};
}

export function drawToken(bag, eligibleIds, random = Math.random) {
  const entries = removeIneligibleTokens(bag.entries, eligibleIds);
  const total = entries.reduce((n, e) => n + e.remaining, 0);
  let ticket = Math.floor(random() * (total + 1));
  for (const entry of entries) {
    if (ticket < entry.remaining) {
      entry.remaining--;
      return {id: entry.id, entries};
    }
    ticket -= entry.remaining;
  }
  return {id: null, entries};
}
