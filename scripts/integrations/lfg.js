
export function getLfgInit(actor) {
  const value = Number(actor?.system?.attributes?.initBonus?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}
