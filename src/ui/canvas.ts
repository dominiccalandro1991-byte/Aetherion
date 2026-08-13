/**
 * Aetherion Planet & Biome Canvas Renderer
 * 2D viewport: planetary grid, genetic population clusters,
 * law-enforcement threat overlay, TOC bottleneck heatmap.
 * Targets ~60fps via requestAnimationFrame, state driven by AetherionRuntime.
 */

import type { AetherionRuntime } from '../core/orchestrator.js';
import type { Genome } from '../foundation/04-genetic-mutation.js';

export interface CanvasOptions {
  /** Max organisms drawn (performance cap) */
  maxOrganisms?: number;
  /** Grid resolution for biome cells */
  gridSize?: number;
}

interface OrganismSprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  fitness: number;
  generation: number;
  id: string;
}

interface BiomeCell {
  gx: number;
  gy: number;
  heat: number; // TOC / seed density 0..1
  threat: number; // law overlay 0..1
}

const TAU = Math.PI * 2;

export class PlanetCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private runtime: AetherionRuntime;
  private raf = 0;
  private running = false;
  private organisms: OrganismSprite[] = [];
  private cells: BiomeCell[] = [];
  private gridSize: number;
  private maxOrganisms: number;
  private lastSync = 0;
  private dpr = 1;
  private planetCx = 0;
  private planetCy = 0;
  private planetR = 0;
  private tickLabel = 0;

  constructor(
    canvas: HTMLCanvasElement,
    runtime: AetherionRuntime,
    options: CanvasOptions = {}
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.runtime = runtime;
    this.gridSize = options.gridSize ?? 12;
    this.maxOrganisms = options.maxOrganisms ?? 64;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.seedOrganismsFromGenetics();
    this.buildGrid();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (t: number) => {
      if (!this.running) return;
      // Sync simulation state ~ every 200ms (matches default runtime interval)
      if (t - this.lastSync > 180) {
        this.syncFromRuntime();
        this.lastSync = t;
      }
      this.stepPhysics(1 / 60);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Force an immediate state pull (e.g. after Manual Tick) */
  refresh(): void {
    this.syncFromRuntime();
  }

  private resize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(280, parent.clientWidth || 640);
    const h = Math.max(220, Math.min(420, Math.round(w * 0.55)));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.planetCx = w * 0.5;
    this.planetCy = h * 0.52;
    this.planetR = Math.min(w, h) * 0.36;
    this.buildGrid();
  }

  private buildGrid(): void {
    this.cells = [];
    for (let gy = 0; gy < this.gridSize; gy++) {
      for (let gx = 0; gx < this.gridSize; gx++) {
        this.cells.push({ gx, gy, heat: 0, threat: 0 });
      }
    }
  }

  private seedOrganismsFromGenetics(): void {
    const genomes = this.runtime.genetics.genomes;
    this.organisms = [];
    const n = Math.min(this.maxOrganisms, Math.max(genomes.length, 12));
    for (let i = 0; i < n; i++) {
      const g = genomes[i];
      this.organisms.push(this.spriteFromGenome(g, i, n));
    }
  }

  private spriteFromGenome(g: Genome | undefined, i: number, n: number): OrganismSprite {
    const angle = (i / n) * TAU + Math.random() * 0.2;
    const dist = this.planetR * (0.25 + Math.random() * 0.55);
    const fitness = g?.fitness ?? 0.4 + Math.random() * 0.3;
    // Fitness → cyan-gold spectrum (Aetherion palette)
    const hue = 180 - fitness * 130; // 180 cyan → ~50 gold
    return {
      x: this.planetCx + Math.cos(angle) * dist,
      y: this.planetCy + Math.sin(angle) * dist * 0.85,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: 2.5 + fitness * 4,
      hue,
      fitness,
      generation: g?.generation ?? 0,
      id: g?.id ?? `spawn-${i}`,
    };
  }

  private syncFromRuntime(): void {
    const state = this.runtime.getState();
    this.tickLabel = state.tick;

    const genomes = this.runtime.genetics.genomes;
    const meanFit = this.runtime.genetics.meanFitness || 0.5;
    const variance = this.runtime.genetics.geneVariance || 0.1;

    // Rebuild / update organism pool
    const target = Math.min(this.maxOrganisms, Math.max(genomes.length, 8));
    while (this.organisms.length < target) {
      const g = genomes[this.organisms.length];
      this.organisms.push(this.spriteFromGenome(g, this.organisms.length, target));
    }
    if (this.organisms.length > target) {
      this.organisms.length = target;
    }
    for (let i = 0; i < this.organisms.length; i++) {
      const g = genomes[i];
      const o = this.organisms[i];
      if (g) {
        o.fitness = g.fitness;
        o.hue = 180 - g.fitness * 130;
        o.radius = 2.5 + g.fitness * 4 + variance * 8;
        o.generation = g.generation;
      } else {
        o.fitness = meanFit;
        o.hue = 180 - meanFit * 130;
      }
    }

    // Seed density → biome heat (Engine 06)
    const seedNorm = Math.min(1, state.seedTotal / 80);
    // TOC CIS → localized heat hotspot
    const toc = this.runtime.toc.currentConstraint;
    const cis = toc?.constraintImpactScore ?? 0;
    const tocGx = toc ? Math.floor(this.gridSize * 0.55) : -1;
    const tocGy = toc ? Math.floor(this.gridSize * 0.4) : -1;

    // Law threat from SRI proxy
    const threatLevel =
      state.sriMax > 0.7 ? 1 : state.sriMax > 0.45 ? 0.55 : state.sriMax * 0.4;

    for (const cell of this.cells) {
      const nx = cell.gx / this.gridSize;
      const ny = cell.gy / this.gridSize;
      // Radial falloff from planet center in grid space
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const radial = Math.sqrt(dx * dx + dy * dy);
      let heat = seedNorm * Math.max(0, 1 - radial * 1.6);
      if (cell.gx === tocGx && cell.gy === tocGy) {
        heat = Math.min(1, heat + cis * 0.85);
      } else if (Math.abs(cell.gx - tocGx) <= 1 && Math.abs(cell.gy - tocGy) <= 1) {
        heat = Math.min(1, heat + cis * 0.35);
      }
      cell.heat = heat;
      cell.threat = threatLevel * Math.max(0, 1 - radial * 1.3);
    }
  }

  private stepPhysics(dt: number): void {
    const cx = this.planetCx;
    const cy = this.planetCy;
    const rMax = this.planetR * 0.92;
    for (const o of this.organisms) {
      // Mild orbital drift
      const dx = o.x - cx;
      const dy = o.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Tangential velocity component
      o.vx += (-dy / dist) * 0.015 + (Math.random() - 0.5) * 0.02;
      o.vy += (dx / dist) * 0.015 + (Math.random() - 0.5) * 0.02;
      o.vx *= 0.98;
      o.vy *= 0.98;
      o.x += o.vx;
      o.y += o.vy;
      // Soft containment inside planet disc
      const nd = Math.sqrt((o.x - cx) ** 2 + (o.y - cy) ** 2);
      if (nd > rMax) {
        const s = rMax / nd;
        o.x = cx + (o.x - cx) * s;
        o.y = cy + (o.y - cy) * s;
        o.vx *= -0.3;
        o.vy *= -0.3;
      }
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    // Void background
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(
      this.planetCx,
      this.planetCy,
      this.planetR * 0.2,
      this.planetCx,
      this.planetCy,
      this.planetR * 2.2
    );
    bg.addColorStop(0, '#111820');
    bg.addColorStop(0.55, '#0B0F14');
    bg.addColorStop(1, '#05070a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Soft star field
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97) % w) + (i % 7);
      const sy = ((i * 53) % h) + (i % 5);
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Biome heatmap cells (projected onto planet disc)
    this.drawBiomeHeat();

    // Planet rim
    ctx.beginPath();
    ctx.arc(this.planetCx, this.planetCy, this.planetR, 0, TAU);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.planetCx, this.planetCy, this.planetR + 6, 0, TAU);
    ctx.strokeStyle = 'rgba(255, 184, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Orbital rings
    ctx.save();
    ctx.translate(this.planetCx, this.planetCy);
    ctx.rotate(-0.35);
    ctx.scale(1, 0.35);
    ctx.beginPath();
    ctx.arc(0, 0, this.planetR * 1.25, 0, TAU);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, this.planetR * 1.45, 0, TAU);
    ctx.strokeStyle = 'rgba(255, 184, 0, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Law enforcement threat arc
    this.drawThreatOverlay();

    // Organisms
    for (const o of this.organisms) {
      const glow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius * 3);
      glow.addColorStop(0, `hsla(${o.hue}, 90%, 60%, 0.85)`);
      glow.addColorStop(1, `hsla(${o.hue}, 90%, 50%, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.radius * 3, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(o.x, o.y, o.radius, 0, TAU);
      ctx.fillStyle = `hsl(${o.hue}, 85%, 58%)`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    // HUD labels
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`PLANET VIEW · T-${this.tickLabel}`, 12, 18);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.fillText(
      `POP ${this.organisms.length} · GEN ${this.runtime.genetics.generation}`,
      12,
      34
    );
    const toc = this.runtime.toc.currentConstraint;
    if (toc) {
      ctx.fillStyle = 'rgba(255, 184, 0, 0.85)';
      ctx.fillText(`TOC · ${toc.type}`, 12, h - 14);
    }
  }

  private drawBiomeHeat(): void {
    const ctx = this.ctx;
    const cellW = (this.planetR * 2) / this.gridSize;
    const cellH = cellW * 0.85;
    const originX = this.planetCx - this.planetR;
    const originY = this.planetCy - this.planetR * 0.85;

    for (const cell of this.cells) {
      if (cell.heat < 0.04) continue;
      const x = originX + cell.gx * cellW;
      const y = originY + cell.gy * cellH;
      // Only draw cells roughly inside planet disc
      const cx = x + cellW / 2;
      const cy = y + cellH / 2;
      const d = Math.hypot(cx - this.planetCx, cy - this.planetCy);
      if (d > this.planetR * 0.95) continue;

      const a = 0.15 + cell.heat * 0.45;
      // Gold heat for TOC bottleneck, cyan for seed density
      const isTocHot = cell.heat > 0.55;
      ctx.fillStyle = isTocHot
        ? `rgba(255, 184, 0, ${a})`
        : `rgba(0, 240, 255, ${a * 0.85})`;
      ctx.fillRect(x, y, cellW - 1, cellH - 1);
    }
  }

  private drawThreatOverlay(): void {
    const state = this.runtime.getState();
    if (state.sriMax < 0.35) return;
    const ctx = this.ctx;
    const intensity = Math.min(1, state.sriMax);
    ctx.beginPath();
    ctx.arc(
      this.planetCx,
      this.planetCy,
      this.planetR * (0.7 + intensity * 0.25),
      -Math.PI * 0.2,
      Math.PI * 0.55
    );
    ctx.strokeStyle =
      intensity > 0.7
        ? `rgba(255, 68, 102, ${0.35 + intensity * 0.4})`
        : `rgba(255, 184, 0, ${0.25 + intensity * 0.35})`;
    ctx.lineWidth = 3 + intensity * 4;
    ctx.stroke();

    // Patrol dashed ring
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(this.planetCx, this.planetCy, this.planetR * 1.08, 0, TAU);
    ctx.strokeStyle =
      intensity > 0.7 ? 'rgba(255, 68, 102, 0.45)' : 'rgba(255, 184, 0, 0.3)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();

    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.fillStyle =
      intensity > 0.7 ? 'rgba(255, 107, 133, 0.9)' : 'rgba(255, 184, 0, 0.85)';
    ctx.fillText(
      intensity > 0.7 ? 'LAW · CRITICAL PATROL' : 'LAW · ELEVATED',
      this.planetCx + this.planetR * 0.55,
      this.planetCy - this.planetR * 0.75
    );
  }
}

export default PlanetCanvas;
