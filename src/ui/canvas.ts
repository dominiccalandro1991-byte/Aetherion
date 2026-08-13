/**
 * Aetherion 3D Procedural Planet Genesis
 * Three.js / WebGL globe: molten→living biomes, atmosphere, starfield,
 * organism orbit particles, law patrol rings. Bound to AetherionRuntime.
 */

import * as THREE from 'three';
import type { AetherionRuntime } from '../core/orchestrator.js';

export interface CanvasOptions {
  maxOrganisms?: number;
}

const AETHER_CYAN = 0x00f0ff;
const LIVING_GOLD = 0xffb800;
const VOID_BG = 0x05070a;

/** Lightweight value-noise for procedural surface (no external deps) */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 5): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * smoothNoise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return v;
}

export class PlanetCanvas {
  private host: HTMLCanvasElement;
  private runtime: AetherionRuntime;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private planet: THREE.Mesh;
  private atmosphere: THREE.Mesh;
  private coreGlow: THREE.Mesh;
  private stars: THREE.Points;
  private organisms: THREE.Points;
  private orgPositions: Float32Array;
  private orgColors: Float32Array;
  private patrolRing: THREE.Mesh;
  private patrolRingOuter: THREE.Mesh;
  private maxOrganisms: number;
  private raf = 0;
  private running = false;
  private clock = new THREE.Clock();
  private lastSync = 0;
  private evolution = 0;
  private surfaceTex: THREE.DataTexture;
  private texSize = 256;
  private pointer = { x: 0, y: 0, down: false, lx: 0, ly: 0 };
  private rotY = 0.35;
  private rotX = 0.25;
  private targetRotY = 0.35;
  private targetRotX = 0.25;
  private autoSpin = true;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    runtime: AetherionRuntime,
    options: CanvasOptions = {}
  ) {
    this.host = canvas;
    this.runtime = runtime;
    this.maxOrganisms = options.maxOrganisms ?? 80;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(VOID_BG);
    this.scene.fog = new THREE.FogExp2(VOID_BG, 0.045);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0.35, 3.6);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.host,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(VOID_BG, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const amb = new THREE.AmbientLight(0x1a2430, 0.55);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(4, 2.5, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(AETHER_CYAN, 0.45);
    rim.position.set(-3, -1, -2);
    this.scene.add(rim);
    const goldFill = new THREE.PointLight(LIVING_GOLD, 0.35, 12);
    goldFill.position.set(-2, 1.5, 2);
    this.scene.add(goldFill);

    this.surfaceTex = this.createSurfaceTexture(0);
    const planetMat = new THREE.MeshStandardMaterial({
      map: this.surfaceTex,
      roughness: 0.72,
      metalness: 0.18,
      emissive: new THREE.Color(0x1a0800),
      emissiveIntensity: 0.35,
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), planetMat);
    this.scene.add(this.planet);

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.55,
    });
    this.coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.92, 48, 48), coreMat);
    this.scene.add(this.coreGlow);

    const atmoMat = new THREE.MeshBasicMaterial({
      color: AETHER_CYAN,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 64), atmoMat);
    this.scene.add(this.atmosphere);

    const auraGeo = new THREE.RingGeometry(1.18, 1.32, 64);
    const auraMat = new THREE.MeshBasicMaterial({
      color: LIVING_GOLD,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.rotation.x = Math.PI / 2.4;
    this.scene.add(aura);

    this.patrolRing = this.makeRing(1.38, 1.42, LIVING_GOLD, 0.0);
    this.patrolRingOuter = this.makeRing(1.5, 1.54, 0xff4466, 0.0);
    this.patrolRing.rotation.x = Math.PI / 2.15;
    this.patrolRingOuter.rotation.x = Math.PI / 2.6;
    this.patrolRingOuter.rotation.z = 0.4;
    this.scene.add(this.patrolRing, this.patrolRingOuter);

    this.stars = this.createStarfield(1200);
    this.scene.add(this.stars);

    const cloud = this.createOrganismCloud(this.maxOrganisms);
    this.organisms = cloud.points;
    this.orgPositions = cloud.positions;
    this.orgColors = cloud.colors;
    this.scene.add(this.organisms);

    this.bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.syncFromRuntime(true);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const t = this.clock.getElapsedTime();
      if (t - this.lastSync > 0.2) {
        this.syncFromRuntime(false);
        this.lastSync = t;
      }
      this.animate(t);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  refresh(): void {
    this.syncFromRuntime(true);
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.renderer.dispose();
    this.surfaceTex.dispose();
  }

  private makeRing(
    inner: number,
    outer: number,
    color: number,
    opacity: number
  ): THREE.Mesh {
    const geo = new THREE.RingGeometry(inner, outer, 96);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  private createStarfield(count: number): THREE.Points {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 28;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const warm = Math.random() > 0.85;
      col[i * 3] = warm ? 1 : 0.7 + Math.random() * 0.3;
      col[i * 3 + 1] = warm ? 0.85 : 0.85 + Math.random() * 0.15;
      col[i * 3 + 2] = warm ? 0.55 : 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    });
    return new THREE.Points(geo, mat);
  }

  private createOrganismCloud(count: number): {
    points: THREE.Points;
    positions: Float32Array;
    colors: Float32Array;
  } {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 1.05 + Math.random() * 0.25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      colors[i * 3] = 0;
      colors[i * 3 + 1] = 0.94;
      colors[i * 3 + 2] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    return { points: new THREE.Points(geo, mat), positions, colors };
  }

  private createSurfaceTexture(evolution: number): THREE.DataTexture {
    const size = this.texSize;
    const data = new Uint8Array(size * size * 4);
    this.paintSurface(data, size, evolution);
    const tex = new THREE.DataTexture(data, size, size);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  private paintSurface(data: Uint8Array, size: number, evolution: number): void {
    const seedBoost = evolution;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const n = fbm(u * 6, v * 4, 5);
        const n2 = fbm(u * 12 + 3.1, v * 8 - 1.7, 3);
        const elev = n * 0.7 + n2 * 0.3;

        let r: number;
        let g: number;
        let b: number;

        if (evolution < 0.25) {
          const t = elev;
          r = 20 + t * 80 + (1 - evolution * 4) * 40;
          g = 8 + t * 25;
          b = 4 + t * 10;
        } else {
          const land = elev > 0.42 - seedBoost * 0.08;
          if (!land) {
            const depth = elev;
            r = 5 + depth * 20;
            g = 25 + depth * 40 + evolution * 50;
            b = 50 + depth * 60 + evolution * 80;
          } else if (elev > 0.72) {
            r = 180 + n2 * 40;
            g = 160 + n2 * 30;
            b = 90 + n2 * 20;
          } else {
            const flora = evolution * (0.5 + n2 * 0.5);
            r = 15 + (1 - flora) * 90 + n2 * 30;
            g = 40 + flora * 140 + n * 30;
            b = 25 + flora * 90 + (1 - elev) * 40;
          }
        }

        if (evolution < 0.45 && n2 > 0.62) {
          r = Math.min(255, r + 120 * (1 - evolution * 2));
          g = Math.min(255, g + 40 * (1 - evolution * 2));
        }

        const i = (y * size + x) * 4;
        data[i] = Math.min(255, Math.max(0, r));
        data[i + 1] = Math.min(255, Math.max(0, g));
        data[i + 2] = Math.min(255, Math.max(0, b));
        data[i + 3] = 255;
      }
    }
  }

  private updateSurface(evolution: number): void {
    const data = this.surfaceTex.image.data as Uint8Array;
    this.paintSurface(data, this.texSize, evolution);
    this.surfaceTex.needsUpdate = true;
  }

  private syncFromRuntime(forceTexture: boolean): void {
    const state = this.runtime.getState();
    const tick = state.tick;
    const seeds = state.seedTotal;
    const eTick = Math.min(1, tick / 40);
    const eSeed = Math.min(1, seeds / 60);
    const nextEvo = Math.min(1, eTick * 0.55 + eSeed * 0.45 + (tick > 0 ? 0.08 : 0));
    if (forceTexture || Math.abs(nextEvo - this.evolution) > 0.03) {
      this.evolution = nextEvo;
      this.updateSurface(this.evolution);
    }

    const coreMat = this.coreGlow.material as THREE.MeshBasicMaterial;
    coreMat.opacity = Math.max(0, 0.55 * (1 - this.evolution * 1.4));
    this.coreGlow.visible = coreMat.opacity > 0.02;

    const planetMat = this.planet.material as THREE.MeshStandardMaterial;
    planetMat.emissiveIntensity = 0.35 * (1 - this.evolution * 0.7) + 0.05;
    planetMat.emissive = new THREE.Color(this.evolution < 0.3 ? 0x2a1000 : 0x001820);

    const atmo = this.atmosphere.material as THREE.MeshBasicMaterial;
    atmo.opacity = 0.08 + this.evolution * 0.14;

    const genomes = this.runtime.genetics.genomes;
    const meanFit = this.runtime.genetics.meanFitness || 0.5;
    const count = Math.min(this.maxOrganisms, Math.max(genomes.length, 12));
    const geo = this.organisms.geometry;
    geo.setDrawRange(0, count);

    for (let i = 0; i < count; i++) {
      const g = genomes[i];
      const fitness = g?.fitness ?? meanFit;
      const r = 1.06 + (1 - fitness) * 0.18 + (i % 7) * 0.01;
      const theta = (i / count) * Math.PI * 2 + fitness * 0.5;
      const phi = Math.acos(((i * 0.618) % 1) * 1.6 - 0.8);
      this.orgPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      this.orgPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.orgPositions[i * 3 + 2] = r * Math.cos(phi);
      const ft = Math.min(1, Math.max(0, fitness));
      this.orgColors[i * 3] = ft * 1.0;
      this.orgColors[i * 3 + 1] = 0.85 + ft * 0.1;
      this.orgColors[i * 3 + 2] = 1 - ft * 0.9;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    const sri = state.sriMax;
    const pr = this.patrolRing.material as THREE.MeshBasicMaterial;
    const pr2 = this.patrolRingOuter.material as THREE.MeshBasicMaterial;
    if (sri > 0.7) {
      pr.opacity = 0.55;
      pr.color.setHex(0xff4466);
      pr2.opacity = 0.4;
      pr2.color.setHex(0xff2244);
    } else if (sri > 0.45) {
      pr.opacity = 0.4;
      pr.color.setHex(LIVING_GOLD);
      pr2.opacity = 0.22;
      pr2.color.setHex(0xffaa00);
    } else {
      pr.opacity = sri * 0.25;
      pr.color.setHex(AETHER_CYAN);
      pr2.opacity = 0;
    }
  }

  private animate(t: number): void {
    this.rotY += (this.targetRotY - this.rotY) * 0.08;
    this.rotX += (this.targetRotX - this.rotX) * 0.08;
    if (this.autoSpin && !this.pointer.down) {
      this.targetRotY += 0.0035;
    }
    this.planet.rotation.y = this.rotY;
    this.planet.rotation.x = this.rotX * 0.35;
    this.coreGlow.rotation.copy(this.planet.rotation);
    this.atmosphere.rotation.y = this.rotY * 0.9;

    this.patrolRing.rotation.z = t * 0.15;
    this.patrolRingOuter.rotation.z = -t * 0.1;

    this.organisms.rotation.y = -this.rotY * 0.4 + t * 0.05;
    this.organisms.rotation.x = this.rotX * 0.2;

    this.stars.rotation.y = t * 0.008;
  }

  private resize(): void {
    const parent = this.host.parentElement ?? this.host;
    const w = Math.max(280, parent.clientWidth || 640);
    const h = Math.max(240, Math.min(480, Math.round(w * 0.58)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.host.style.width = `${w}px`;
    this.host.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private bindPointer(): void {
    const el = this.host;
    const onDown = (x: number, y: number) => {
      this.pointer.down = true;
      this.pointer.lx = x;
      this.pointer.ly = y;
      this.autoSpin = false;
    };
    const onMove = (x: number, y: number) => {
      if (!this.pointer.down) return;
      const dx = x - this.pointer.lx;
      const dy = y - this.pointer.ly;
      this.targetRotY += dx * 0.005;
      this.targetRotX = Math.max(-1.1, Math.min(1.1, this.targetRotX + dy * 0.004));
      this.pointer.lx = x;
      this.pointer.ly = y;
    };
    const onUp = () => {
      this.pointer.down = false;
      setTimeout(() => {
        this.autoSpin = true;
      }, 2500);
    };

    el.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onUp);

    el.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    el.addEventListener('touchend', onUp);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const z = this.camera.position.z + e.deltaY * 0.002;
        this.camera.position.z = Math.max(2.2, Math.min(6.5, z));
      },
      { passive: false }
    );
  }
}

export default PlanetCanvas;
