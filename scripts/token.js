import * as THREE from "../vendor/three/three.module.js";
import {GLTFLoader} from "../vendor/three/GLTFLoader.js";

const modelURL = new URL("../assets/models/realistic-token.glb", import.meta.url).href;
let modelPromise;

function surfaceMap() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = "#aaa";
  context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 180; i++) {
    const x = (i * 73 + 19) % 256, y = (i * 109 + 47) % 256;
    context.strokeStyle = i % 3 ? "#9b9b9b" : "#b6b6b6";
    context.lineWidth = .45;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 3 + i % 17, y + (i % 7 - 3) * .25);
    context.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

export async function createChip(theme, frontTexture, backTexture) {
  const loaded = await (modelPromise ??= new GLTFLoader().loadAsync(modelURL));
  loaded.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(loaded.scene);
  const center = bounds.getCenter(new THREE.Vector3());
  const dimensions = bounds.getSize(new THREE.Vector3());
  const radiusScale = 1.6 / Math.max(dimensions.x, dimensions.z);
  const group = new THREE.Group();
  group.name = "initiative-token";
  const metal = new THREE.MeshPhysicalMaterial({
    color: theme.metal,
    metalness: theme.metalness,
    roughness: Math.max(.24, theme.roughness),
    bumpMap: surfaceMap(), bumpScale: .0015,
    clearcoat: .12, clearcoatRoughness: .45
  });

  loaded.scene.traverse(part => {
    if (!part.isMesh) return;
    const geometry = part.geometry.clone();
    geometry.applyMatrix4(part.matrixWorld);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.rotateX(Math.PI / 2);
    geometry.scale(radiusScale, radiusScale, .15 / dimensions.y);
    const body = new THREE.Mesh(geometry, metal);
    body.name = "minted-body";
    body.castShadow = body.receiveShadow = true;
    group.add(body);
  });

  const reeds = new THREE.InstancedMesh(new THREE.BoxGeometry(.005, .025, .105), metal, 160);
  const placement = new THREE.Object3D();
  for (let i = 0; i < reeds.count; i++) {
    const angle = i / reeds.count * Math.PI * 2;
    placement.position.set(Math.sin(angle) * .791, Math.cos(angle) * .791, 0);
    placement.rotation.z = -angle;
    placement.updateMatrix();
    reeds.setMatrixAt(i, placement.matrix);
  }
  reeds.name = "reeded-edge";
  reeds.castShadow = true;
  group.add(reeds);

  const rimGeometry = new THREE.TorusGeometry(.707, .011, 8, 128);
  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(rimGeometry, metal);
    rim.position.z = side * .076;
    rim.castShadow = true;
    group.add(rim);
  }

  frontTexture.anisotropy = 8;
  const front = new THREE.Mesh(new THREE.CircleGeometry(.683, 128),
    new THREE.MeshBasicMaterial({map: frontTexture, toneMapped: false}));
  front.name = "portrait-front";
  front.position.z = .079;
  group.add(front);

  const back = new THREE.Mesh(new THREE.CircleGeometry(.683, 128),
    new THREE.MeshStandardMaterial({map: backTexture, metalness: .38, roughness: .58}));
  back.name = "emblem-back";
  back.position.z = -.079;
  back.rotation.y = Math.PI;
  group.add(back);

  const glaze = new THREE.Mesh(new THREE.CircleGeometry(.681, 128),
    new THREE.MeshPhysicalMaterial({color: "#ffffff", metalness: 0, roughness: .22,
      clearcoat: .8, clearcoatRoughness: .25, transparent: true, opacity: .025, depthWrite: false}));
  glaze.name = "portrait-varnish";
  glaze.position.z = .080;
  group.add(glaze);
  return group;
}
