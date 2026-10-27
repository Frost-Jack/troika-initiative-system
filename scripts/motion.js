export const ANIMATION_DURATION = {draw: 3600, pour: 4200};
export const TABLE_Y = -.35;
export const COIN_SCALE = .5;
export const DRAW_TIMING = {launch: .16, impact: .46, settled: .7, focusEnd: .9};

const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

function spring(time) {
  if (time <= 0) return {value: 0, velocity: 0};
  const frequency = 10, damping = .72;
  const decay = Math.exp(-damping * frequency * time);
  const oscillation = frequency * Math.sqrt(1 - damping * damping);
  const angle = oscillation * time;
  return {
    value: 1 - decay * (Math.cos(angle) + damping * frequency / oscillation * Math.sin(angle)),
    velocity: decay * frequency * frequency / oscillation * Math.sin(angle)
  };
}

export function bagMotion(progress, mode = "draw") {
  if (progress <= 0 || progress >= 1) return {opening: 0, velocity: 0, sway: 0};
  const time = progress * ANIMATION_DURATION[mode] / 1000;
  const opening = spring(time - .05);
  const closing = spring(time - (mode === "pour" ? 2.8 : 2.2));
  const velocity = opening.velocity - closing.velocity;
  return {opening: opening.value - closing.value, velocity, sway: -.008 * velocity};
}

function seedValue(seed, salt) {
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  value = Math.imul(value ^ salt, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

// Extent of an XY disk with radius .8 and thickness .15 after Euler XYZ rotation.
export function coinSupportHeight(rx, ry) {
  const verticalNormal = Math.sin(rx) * Math.cos(ry);
  return .8 * Math.sqrt(Math.max(0, 1 - verticalNormal * verticalNormal)) + .075 * Math.abs(verticalNormal);
}

export function coinPose(progress, seed = 1) {
  const p = clamp(progress);
  const finalX = 1.5 + (seedValue(seed, 1) - .5) * .1;
  const finalZ = .35 + (seedValue(seed, 2) - .5) * .08;
  const driftX = (seedValue(seed, 3) - .5) * .16;
  const driftZ = (seedValue(seed, 4) - .5) * .1;
  const finalRz = (seedValue(seed, 5) - .5) * Math.PI * 2;
  const impactTiltX = (seedValue(seed, 6) - .5) * .28;
  const impactTiltY = (seedValue(seed, 7) - .5) * .24;
  const {launch, impact, settled} = DRAW_TIMING;
  if (p >= settled) return {x: finalX, y: TABLE_Y + .075 * COIN_SCALE, z: finalZ,
    rx: -Math.PI / 2, ry: 0, rz: finalRz, scale: COIN_SCALE, visible: true};

  if (p < impact) {
    const flight = clamp((p - launch) / (impact - launch));
    const turn = Math.PI * 2 * smooth((flight - .12) / .88);
    const rx = -Math.PI / 2 + mix(.025, impactTiltX, flight) + turn;
    const ry = mix(-.02, impactTiltY, flight);
    const touchdown = TABLE_Y + coinSupportHeight(-Math.PI / 2 + impactTiltX, impactTiltY) * COIN_SCALE;
    const duration = (impact - launch) * ANIMATION_DURATION.draw / 1000;
    const time = flight * duration;
    const velocity = (touchdown - 1.47 + .5 * 9.8 * duration * duration) / duration;
    const trajectory = 1.47 + velocity * time - .5 * 9.8 * time * time;
    return {
      x: mix(-1.55, finalX - driftX, flight),
      y: Math.max(TABLE_Y + coinSupportHeight(rx, ry) * COIN_SCALE, trajectory),
      z: mix(0, finalZ - driftZ, flight), rx, ry,
      rz: finalRz + (1 - flight) * (seedValue(seed, 8) - .5) * .9,
      scale: COIN_SCALE, visible: p >= launch
    };
  }

  const elapsed = p - impact;
  const rocking = Math.exp(-elapsed * 22) * (1 - smooth(elapsed / (settled - impact)));
  const rx = -Math.PI / 2 + impactTiltX * rocking * Math.cos(elapsed * 58);
  const ry = impactTiltY * rocking * Math.cos(elapsed * 71);
  let lift = 0, start = 0;
  for (let bounce = 0; bounce < 3; bounce++) {
    const duration = [.065, .038, .022][bounce] + seedValue(seed, 10 + bounce) * [.018, .016, .011][bounce];
    const height = [.065, .02, .005][bounce] + seedValue(seed, 20 + bounce) * [.035, .014, .007][bounce];
    if (elapsed >= start && elapsed <= start + duration) {
      const local = (elapsed - start) / duration;
      lift = height * 4 * local * (1 - local);
      break;
    }
    start += duration;
  }
  const friction = smooth(elapsed / (settled - impact));
  return {
    x: finalX - driftX * (1 - friction),
    y: TABLE_Y + coinSupportHeight(rx, ry) * COIN_SCALE + lift * COIN_SCALE,
    z: finalZ - driftZ * (1 - friction), rx, ry,
    rz: finalRz + (seedValue(seed, 30) - .5) * rocking * Math.sin(elapsed * 50) * .12,
    scale: COIN_SCALE, visible: true
  };
}

export function pourPose(progress, index, seed = 1) {
  const salt = index * 16 + 100;
  const duration = .46 + seedValue(seed, salt) * .05;
  const elapsed = progress * ANIMATION_DURATION.pour / 1000 - (.75 + index * .2 + seedValue(seed, salt + 1) * .045);
  const time = Math.max(0, Math.min(duration, elapsed));
  const flight = time / duration;
  const velocity = (-1.65 + .5 * 9.8 * duration * duration) / duration;
  const direction = seedValue(seed, salt + 7) < .5 ? -1 : 1;
  return {
    x: (.7 + seedValue(seed, salt + 2) * .15) * (1 - flight),
    y: 1 + velocity * time - .5 * 9.8 * time * time,
    z: (seedValue(seed, salt + 3) - .5) * .12 * (1 - flight),
    rx: -Math.PI / 2 + (seedValue(seed, salt + 4) - .5) * .4 + direction * time * (.7 + seedValue(seed, salt + 8) * .7),
    ry: (seedValue(seed, salt + 5) - .5) * .3 + time * (seedValue(seed, salt + 9) - .5),
    rz: seedValue(seed, salt + 6) * Math.PI * 2 + direction * time * (1 + seedValue(seed, salt + 10) * 1.2),
    scale: .28, visible: elapsed >= 0 && elapsed < duration
  };
}
