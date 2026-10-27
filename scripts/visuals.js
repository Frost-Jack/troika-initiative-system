import * as THREE from "../vendor/three/three.module.js";
import {GLTFLoader} from "../vendor/three/GLTFLoader.js";
import {getTheme} from "./themes.js";
import {createChip} from "./token.js";
import {ANIMATION_DURATION, DRAW_TIMING, TABLE_Y, bagMotion, coinPose, pourPose} from "./motion.js";

const bagURL = new URL("../assets/models/photoscan-bag.glb", import.meta.url).href;
let modelPromise;
const model = () => modelPromise ??= new GLTFLoader().loadAsync(bagURL).then(loaded => {
  loaded.scene.traverse(part => {
    const map = part.material?.map;
    if (!map?.image || map.image.width <= 2048) return;
    const original = map.image, surface = canvas(2048);
    surface.getContext("2d").drawImage(original, 0, 0, 2048, 2048);
    map.image = surface;
    original.close?.();
  });
  return loaded;
});
const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

function canvas(size = 512) {
  const result = document.createElement("canvas");
  result.width = result.height = size;
  return result;
}

function texture(surface) {
  const result = new THREE.CanvasTexture(surface);
  result.colorSpace = THREE.SRGBColorSpace;
  return result;
}

function emblem(ctx, pattern, x, y, radius) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = radius * .075;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (pattern === "leaf") {
    ctx.moveTo(0, radius * .85);
    ctx.bezierCurveTo(-radius, 0, -radius * .65, -radius * .75, radius * .5, -radius);
    ctx.bezierCurveTo(radius, -radius * .1, radius * .6, radius * .5, 0, radius * .85);
    ctx.moveTo(0, radius * .8); ctx.lineTo(radius * .35, -radius * .65);
    for (const n of [-.35, 0, .35]) {
      ctx.moveTo(radius * .15, n * radius); ctx.lineTo(-radius * .35, (n - .3) * radius);
    }
  } else if (pattern === "claw") {
    for (const n of [-1, 0, 1]) {
      ctx.moveTo(n * radius * .48 - radius * .2, radius * .8);
      ctx.quadraticCurveTo(n * radius * .48 + radius * .5, 0, n * radius * .48 + radius * .15, -radius);
    }
  } else if (pattern === "arch") {
    ctx.moveTo(-radius * .65, radius * .8); ctx.lineTo(-radius * .65, -radius * .1);
    ctx.quadraticCurveTo(-radius * .5, -radius * .7, 0, -radius);
    ctx.quadraticCurveTo(radius * .5, -radius * .7, radius * .65, -radius * .1);
    ctx.lineTo(radius * .65, radius * .8); ctx.closePath();
    ctx.moveTo(0, -radius * .55); ctx.lineTo(0, radius * .5);
    ctx.moveTo(-radius * .28, -radius * .05); ctx.lineTo(radius * .28, -radius * .05);
  } else {
    const arms = pattern === "snow" ? 6 : pattern === "star" ? 5 : 4;
    for (let i = 0; i < arms; i++) {
      const angle = i * Math.PI * 2 / arms - Math.PI / 2;
      const a = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
      ctx.moveTo(0, 0); ctx.lineTo(a.x * radius, a.y * radius);
      if (pattern === "snow") {
        for (const side of [-1, 1]) {
          ctx.moveTo(a.x * radius * .65, a.y * radius * .65);
          ctx.lineTo(a.x * radius * .4 - a.y * radius * .24 * side, a.y * radius * .4 + a.x * radius * .24 * side);
        }
      } else {
        ctx.lineTo(Math.cos(angle + .3) * radius * .4, Math.sin(angle + .3) * radius * .4);
        ctx.lineTo(0, 0);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

function reverseTexture(theme, end = false, size = 512) {
  const surface = canvas(size);
  const ctx = surface.getContext("2d");
  ctx.scale(size / 512, size / 512);
  ctx.fillStyle = theme.recess; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = theme.metal; ctx.fillStyle = theme.metal;
  for (const r of [228, 210, 190]) {
    ctx.lineWidth = r === 210 ? 4 : 2;
    ctx.beginPath(); ctx.arc(256, 256, r, 0, Math.PI * 2); ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    ctx.beginPath(); ctx.arc(256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200, 3, 0, 7); ctx.fill();
  }
  if (end) {
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(185, 155); ctx.lineTo(327, 155); ctx.lineTo(185, 357);
    ctx.lineTo(327, 357); ctx.lineTo(185, 155); ctx.stroke();
  } else emblem(ctx, theme.pattern, 256, 256, 125);
  return texture(surface);
}

function clothTexture(pattern = "rune") {
  const surface = canvas(256);
  const ctx = surface.getContext("2d");
  ctx.fillStyle = "#aaa"; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 2) {
    ctx.strokeStyle = i % 4 ? "#969696" : "#bdbdbd";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  if (pattern === "claw") {
    ctx.strokeStyle = "#555"; ctx.lineWidth = 3;
    for (let y = -16; y < 280; y += 32) for (let x = -32; x < 280; x += 32) {
      ctx.beginPath(); ctx.arc(x + (y % 64 ? 16 : 0), y, 20, 0, Math.PI); ctx.stroke();
    }
  } else if (pattern === "leaf") {
    for (let y = 0; y < 256; y += 7) {
      ctx.strokeStyle = "#777"; ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y + Math.sin(x / 34 + y) * 5);
      ctx.stroke();
    }
  }
  const result = texture(surface);
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(4, 4);
  return result;
}

async function portraitTexture(source, theme, size = 1024, signal) {
  if (!source) return reverseTexture(theme, false, Math.min(size, 512));
  const surface = canvas(size);
  const ctx = surface.getContext("2d", {willReadFrequently: true});
  ctx.fillStyle = theme.recess; ctx.fillRect(0, 0, size, size);
  const video = /\.(webm|mp4)(?:\?|$)/i.test(source);
  const image = document.createElement(video ? "video" : "img");
  image.crossOrigin = "anonymous";
  if (video) { image.muted = true; image.preload = "auto"; }
  const release = () => { image.removeAttribute("src"); if (video) image.load(); };
  try {
    await new Promise((resolve, reject) => {
      const event = video ? "loadeddata" : "load";
      const done = error => {
        clearTimeout(timer); signal?.removeEventListener("abort", abort);
        image.removeEventListener(event, loaded); image.removeEventListener("error", failed);
        if (error) { release(); reject(error); } else resolve();
      };
      const loaded = () => done();
      const failed = () => done(new Error("Portrait could not be loaded"));
      const abort = () => done(new DOMException("Portrait cancelled", "AbortError"));
      const timer = setTimeout(failed, 10000);
      image.addEventListener(event, loaded); image.addEventListener("error", failed);
      signal?.addEventListener("abort", abort, {once: true});
      if (signal?.aborted) abort(); else image.src = source;
    });
    const width = image.naturalWidth || image.videoWidth;
    const height = image.naturalHeight || image.videoHeight;
    const sample = canvas(128), scan = sample.getContext("2d", {willReadFrequently: true});
    scan.drawImage(image, 0, 0, 128, 128);
    let bounds = [0, 0, width, height];
    try {
      const pixels = scan.getImageData(0, 0, 128, 128).data;
      let left = 128, top = 128, right = 0, bottom = 0;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        if (pixels[(y * 128 + x) * 4 + 3] < 28) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (right > left && bottom > top) bounds = [left / 128 * width, top / 128 * height,
        (right - left + 1) / 128 * width, (bottom - top + 1) / 128 * height];
    } catch { /* Cross-origin images can still be displayed without alpha analysis. */ }
    const extent = Math.max(bounds[2], bounds[3]);
    const scale = surface.width * 990 / 1024 / extent;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, ...bounds, (surface.width - bounds[2] * scale) / 2, (surface.height - bounds[3] * scale) / 2,
      bounds[2] * scale, bounds[3] * scale);
    return texture(surface);
  } finally { release(); }
}


async function bagMesh(theme) {
  const loaded = await model();
  loaded.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(loaded.scene);
  const center = box.getCenter(new THREE.Vector3());
  const scale = 2.05 / box.getSize(new THREE.Vector3()).y;
  const group = new THREE.Group();
  const mouths = [];
  const cutoff = {value: 2.1};
  const applyCutoff = shader => {
    shader.uniforms.tisBagCutoff = cutoff;
    shader.vertexShader = "varying float tisBagHeight;\n" + shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\ntisBagHeight = position.y;");
    shader.fragmentShader = "varying float tisBagHeight;\nuniform float tisBagCutoff;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\nif (tisBagHeight > tisBagCutoff) discard;");
  };
  loaded.scene.traverse(part => {
    if (!part.isMesh) return;
    const geometry = part.geometry.clone();
    geometry.applyMatrix4(part.matrixWorld);
    geometry.translate(-center.x, -box.min.y, -center.z);
    geometry.scale(scale, scale, scale);
    const source = part.material;
    const material = new THREE.MeshStandardMaterial({roughness: .96, metalness: 0});
    if (source.map) {
      material.map = source.map.clone();
      material.map.anisotropy = 8;
    }
    material.side = THREE.FrontSide;
    material.color.set(theme.cloth).multiplyScalar(3.8);
    material.onBeforeCompile = shader => {
      applyCutoff(shader);
      const map = THREE.ShaderChunk.map_fragment.replace("diffuseColor *= sampledDiffuseColor;",
        "sampledDiffuseColor.rgb = vec3(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))) * 2.2; diffuseColor *= sampledDiffuseColor;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", map);
    };
    material.customProgramCacheKey = () => "troika-photoscan-cloth";
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "photoscan-cloth";
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking});
    mesh.customDepthMaterial.onBeforeCompile = applyCutoff;
    mesh.customDepthMaterial.customProgramCacheKey = () => "troika-photoscan-depth";
    mesh.userData.original = Float32Array.from(geometry.attributes.position.array);
    group.add(mesh);
    const liningMaterial = new THREE.MeshBasicMaterial({color: "#0c0d11", side: THREE.BackSide, toneMapped: false});
    liningMaterial.onBeforeCompile = material.onBeforeCompile;
    liningMaterial.customProgramCacheKey = () => "troika-photoscan-lining";
    const lining = new THREE.Mesh(geometry, liningMaterial);
    lining.name = "photoscan-lining";
    lining.frustumCulled = false;
    group.add(lining);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) > 1.64) mouths.push(new THREE.Vector2(positions.getX(i), positions.getZ(i)));
    }
  });
  const mouthCenter = mouths.reduce((sum, p) => sum.add(p), new THREE.Vector2()).divideScalar(mouths.length || 1);
  group.userData.mouth = new THREE.Vector3(mouthCenter.x, 1.76, mouthCenter.y);
  const cloth = group.getObjectByName("photoscan-cloth").geometry;
  const positions = cloth.attributes.position, indices = cloth.index;
  function section(height, padding = .015) {
    const contour = [];
    for (let i = 0; i < indices.count; i += 3) {
      const vertices = [0, 1, 2].map(n => new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + n)));
      for (let n = 0; n < 3; n++) {
        const a = vertices[n], b = vertices[(n + 1) % 3];
        if ((a.y - height) * (b.y - height) >= 0) continue;
        contour.push(a.clone().lerp(b, (height - a.y) / (b.y - a.y)));
      }
    }
    return Array.from({length: 64}, (_, i) => {
      const angle = i * Math.PI * 2 / 64;
      const candidates = contour.filter(p => Math.abs(Math.atan2(Math.sin(Math.atan2(p.z - mouthCenter.y, p.x - mouthCenter.x) - angle),
        Math.cos(Math.atan2(p.z - mouthCenter.y, p.x - mouthCenter.x) - angle))) < .11);
      const radius = (candidates.length ? Math.max(...candidates.map(p => Math.hypot(p.x - mouthCenter.x, p.z - mouthCenter.y))) : .28) + padding;
      return new THREE.Vector3(mouthCenter.x + Math.cos(angle) * radius, height, mouthCenter.y + Math.sin(angle) * radius);
    });
  }
  const rimPoints = section(1.76);
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPoints, true), 128, .016, 6, true),
    new THREE.MeshStandardMaterial({color: theme.cloth, roughness: .95, transparent: true,
      bumpMap: clothTexture(), bumpScale: .009}));
  rim.name = "photoscan-rim";
  rim.castShadow = rim.receiveShadow = true;
  rim.frustumCulled = false;
  rim.userData.original = Float32Array.from(rim.geometry.attributes.position.array);
  group.add(rim);
  const cordMaterial = new THREE.MeshStandardMaterial({color: new THREE.Color(theme.cloth).lerp(new THREE.Color("#aca499"), .3),
    roughness: .9, bumpMap: clothTexture(), bumpScale: .016});
  const cordPoints = section(1.66, .055);
  const wrap = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPoints, true), 128, .021, 6, true), cordMaterial);
  wrap.name = "drawcord-wrap";
  wrap.userData.original = Float32Array.from(wrap.geometry.attributes.position.array);
  wrap.castShadow = wrap.receiveShadow = true; wrap.frustumCulled = false;
  group.add(wrap);
  const ends = [-1, 1].map(side => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(.1, .1, 0), new THREE.Vector3(.2, 0, .1)]);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, .018, 6, false), cordMaterial);
    mesh.name = "drawcord-tail"; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(.029, 8, 6), cordMaterial);
    knot.castShadow = true;
    group.add(mesh, knot);
    return {mesh, knot, anchor: cordPoints[side < 0 ? 24 : 8]};
  });
  const inside = new THREE.Mesh(new THREE.CircleGeometry(.4, 64), new THREE.MeshBasicMaterial({color: "#050609"}));
  inside.rotation.x = -Math.PI / 2; inside.position.set(mouthCenter.x, 1.28, mouthCenter.y);
  group.add(inside);
  const deforming = group.children.filter(child => child.userData.original);
  for (const mesh of deforming) {
    const original = mesh.userData.original;
    mesh.userData.influence = Float32Array.from({length: original.length / 3}, (_, i) => smooth((original[i * 3 + 1] - 1.15) / .77));
  }
  group.userData.open = (value, velocity = 0, seconds = 0) => {
    cutoff.value = 2.1 - .34 * smooth((value - .25) / .75);
    rim.visible = value > .4;
    rim.material.opacity = smooth((value - .4) / .25);
    inside.visible = value > .3;
    inside.position.y = cutoff.value - .43;
    for (const mesh of deforming) {
      const positions = mesh.geometry.attributes.position, original = mesh.userData.original;
      for (let i = 0; i < positions.count; i++) {
        const x = original[i * 3], y = original[i * 3 + 1], z = original[i * 3 + 2];
        const influence = mesh.userData.influence[i];
        const radius = mix(1, mix(.72, 2.4, value), influence);
        positions.setXYZ(i, mouthCenter.x + (x - mouthCenter.x) * radius, y + (mesh === rim ? cutoff.value - 1.76 : 0),
          mouthCenter.y + (z - mouthCenter.y) * radius);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    for (const {mesh, knot, anchor: originalAnchor} of ends) {
      const influence = smooth((1.66 - 1.15) / .77), spread = mix(1, mix(.72, 2.4, value), influence);
      const outward = new THREE.Vector3(originalAnchor.x - mouthCenter.x, 0, originalAnchor.z - mouthCenter.y).normalize();
      const anchor = new THREE.Vector3(mouthCenter.x + (originalAnchor.x - mouthCenter.x) * spread,
        1.66, mouthCenter.y + (originalAnchor.z - mouthCenter.y) * spread);
      const slack = mix(.6, .2, clamp(value, 0, 1));
      const sway = velocity * .017 + Math.sin(seconds * 12 + outward.x) * Math.abs(velocity) * .005;
      const tip = anchor.clone().addScaledVector(outward, slack);
      tip.y += -.22 - slack * .25 + sway;
      const curve = new THREE.CatmullRomCurve3([anchor,
        anchor.clone().addScaledVector(outward, slack * .55).add(new THREE.Vector3(0, -.01 + sway, .02)),
        tip.clone().add(new THREE.Vector3(0, .07, .015)), tip]);
      curve.arcLengthDivisions = 48;
      const frames = curve.computeFrenetFrames(32, false), position = mesh.geometry.attributes.position, normal = mesh.geometry.attributes.normal;
      const point = new THREE.Vector3();
      for (let i = 0; i <= 32; i++) {
        const center = curve.getPointAt(i / 32, point);
        for (let j = 0; j <= 6; j++) {
          const angle = j / 6 * Math.PI * 2;
          const cosine = -Math.cos(angle), sine = Math.sin(angle);
          const dx = frames.normals[i].x * cosine + frames.binormals[i].x * sine;
          const dy = frames.normals[i].y * cosine + frames.binormals[i].y * sine;
          const dz = frames.normals[i].z * cosine + frames.binormals[i].z * sine;
          const index = i * 7 + j;
          position.setXYZ(index, center.x + dx * .018, center.y + dy * .018, center.z + dz * .018);
          normal.setXYZ(index, dx, dy, dz);
        }
      }
      position.needsUpdate = normal.needsUpdate = true;
      knot.position.copy(tip);
    }
  };
  return group;
}

function disposeScene(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    if (object.isLight) object.shadow?.dispose();
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [...(Array.isArray(object.material) ? object.material : [object.material]),
      object.customDepthMaterial, object.customDistanceMaterial].filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose());
}

export class BagStage {
  constructor(container, {theme = "fantasy", info = {}, mode = "static", chips = [], seed = Math.random()} = {}) {
    this.container = container; this.theme = getTheme(theme); this.info = info; this.mode = mode;
    this.chips = chips; this.disposed = false; this.frame = 0;
    this.seed = seed;
    this.abort = new AbortController();
    this.ready = this.initialize().catch(error => {
      if (!this.disposed) {
        console.warn("troika-initiative-system | 3D stage", error);
        this.container.dataset.renderFailed = "true";
        this.destroy();
      }
    });
  }

  async initialize() {
    await Promise.resolve();
    if (this.disposed) return;
    this.scene = new THREE.Scene();
    const {width, height} = this.container.getBoundingClientRect();
    this.renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(Math.max(width, 1), Math.max(height, 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const aspect = Math.max(width, 1) / Math.max(height, 1);
    this.camera = new THREE.OrthographicCamera(-3.55, 3.55, 3.55 / aspect, -3.55 / aspect, .1, 30);
    this.camera.position.set(0, 4.8, 8.8); this.camera.lookAt(0, .95, 0);
    this.scene.add(new THREE.HemisphereLight(0xf6eddf, 0x45404b, 1.5));
    const key = new THREE.DirectionalLight(0xfff1d9, 2.7); key.position.set(-3, 6, 5);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 18});
    key.shadow.bias = -.0003; key.shadow.normalBias = .012;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd7e9ff, 1.3); fill.position.set(3, 3, -2); this.scene.add(fill);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.ShadowMaterial({opacity: .38}));
    table.rotation.x = -Math.PI / 2; table.position.y = TABLE_Y; table.receiveShadow = true; this.scene.add(table);
    this.bag = await bagMesh(this.theme);
    if (this.disposed) { disposeScene(this.bag); return; }
    this.bag.position.set(-1.55, -.35, 0); this.bag.rotation.y = -.14;
    this.scene.add(this.bag);
    const face = await portraitTexture(this.info.image, this.theme, 1024, this.abort.signal).catch(() => reverseTexture(this.theme));
    if (this.disposed) { face.dispose(); return; }
    if (this.info.kind === "end") { face.dispose(); this.token = await createChip(this.theme, reverseTexture(this.theme, true), reverseTexture(this.theme)); }
    else this.token = await createChip(this.theme, face, reverseTexture(this.theme));
    if (this.disposed) { disposeScene(this.token); return; }
    this.scene.add(this.token);
    this.incoming = [];
    if (this.mode === "pour") await this.prepareIncoming(this.chips);
    if (this.disposed) return;
    this.container.append(this.renderer.domElement);
    this.container.dataset.ready = "true";
    this.resize = new ResizeObserver(() => {
      if (this.disposed) return;
      const {width, height} = this.container.getBoundingClientRect();
      if (!width || !height) return;
      this.renderer.setSize(width, height); this.camera.top = 3.55 * height / width; this.camera.bottom = -this.camera.top;
      this.camera.updateProjectionMatrix(); this.renderer.render(this.scene, this.camera);
    });
    this.resize.observe(this.container);
    this.finished = this.animate(this.mode);
  }

  async prepareIncoming(chips) {
    for (const item of this.incoming) { this.scene.remove(item); disposeScene(item); }
    this.incoming = [];
    for (const info of chips.slice(0, 7)) {
      const image = await portraitTexture(info.image, this.theme, 256, this.abort.signal).catch(() => reverseTexture(this.theme, false, 256));
      if (this.disposed) { image.dispose(); return; }
      const item = await createChip(this.theme, image, reverseTexture(this.theme, false, 256));
      if (this.disposed) { disposeScene(item); return; }
      item.scale.setScalar(.28); item.visible = false; item.userData.label = info.label;
      this.incoming.push(item); this.scene.add(item);
    }
  }

  playPour(chips) {
    const revision = this.pourRevision = (this.pourRevision ?? 0) + 1;
    this.pourQueue = (this.pourQueue ?? this.ready).catch(() => {}).then(async () => {
      if (this.disposed || revision !== this.pourRevision) return;
      try {
        await this.prepareIncoming(chips);
        if (this.disposed || revision !== this.pourRevision) return;
        await this.animate("pour");
      } finally {
        if (!this.disposed) {
          for (const item of this.incoming) { this.scene.remove(item); disposeScene(item); }
          this.incoming = [];
          this.mode = "static"; this.pose(1);
        }
      }
    });
    return this.pourQueue;
  }

  animate(mode) {
    cancelAnimationFrame(this.frame); this.finishAnimation?.(); this.mode = mode;
    if (mode === "static" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.frame = 0; this.pose(1); return Promise.resolve();
    }
    this.pose(0);
    this.started = performance.now();
    const finished = new Promise(resolve => { this.finishAnimation = resolve; });
    const tick = now => {
      if (this.disposed) return;
      const progress = Math.min((now - this.started) / ANIMATION_DURATION[this.mode], 1);
      this.pose(progress);
      if (progress < 1) this.frame = requestAnimationFrame(tick);
      else { this.frame = 0; this.finishAnimation?.(); this.finishAnimation = null; }
    };
    this.frame = requestAnimationFrame(tick);
    return finished;
  }

  pose(progress) {
    if (this.disposed || !this.token) return;
    this.progress = progress;
    const movement = this.mode === "static" ? {opening: 0, velocity: 0, sway: 0} : bagMotion(progress, this.mode);
    const seconds = progress * (ANIMATION_DURATION[this.mode] ?? 0) / 1000;
    this.bag.userData.open(movement.opening, movement.velocity, seconds);
    this.bag.position.x = this.mode === "draw" ? -1.55 : 0;
    this.bag.rotation.z = movement.sway;
    this.bag.updateMatrixWorld(true);
    const mouth = this.bag.localToWorld(this.bag.userData.mouth.clone());
    if (this.mode === "pour") {
      this.token.visible = false;
      this.incoming.forEach((item, i) => {
        const coin = pourPose(progress, i, this.seed);
        item.visible = coin.visible;
        item.position.set(mouth.x + coin.x, mouth.y + coin.y, mouth.z + coin.z);
        item.rotation.set(coin.rx, coin.ry, coin.rz);
      });
    } else if (this.mode === "static") {
      this.token.visible = false;
    } else {
      const coin = coinPose(progress, this.seed);
      this.token.visible = coin.visible;
      const centering = 1 - clamp((progress - DRAW_TIMING.launch) /
        (DRAW_TIMING.impact - DRAW_TIMING.launch), 0, 1);
      this.token.position.set(coin.x + (mouth.x + 1.55) * centering, coin.y, coin.z + mouth.z * centering);
      this.token.rotation.set(coin.rx, coin.ry, coin.rz);
      this.token.scale.setScalar(coin.scale);
      if (this.mode === "draw") {
        const focus = smooth((progress - DRAW_TIMING.settled) / (DRAW_TIMING.focusEnd - DRAW_TIMING.settled));
        this.token.position.lerp(new THREE.Vector3(1.05, 1.3, 1.2), focus);
        this.token.quaternion.slerp(this.camera.quaternion, focus);
        this.token.scale.setScalar(mix(coin.scale, 1.25, focus));
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); this.resize?.disconnect();
    this.abort.abort();
    this.finishAnimation?.(); this.finishAnimation = null;
    if (this.scene) disposeScene(this.scene);
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer?.domElement.remove();
  }
}
