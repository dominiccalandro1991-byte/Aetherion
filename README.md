# Aetherion

**Forge Worlds. Shape Destiny.**

Official standalone game application repository for Aetherion (Planet Builders lineage).

## Branding & Logo Mapping

| Asset | Role | File |
|-------|------|------|
| **Primary UI / App Logo** | Application icon, navigation headers, Steam avatar, App Store, in-game UI | `brand/aetherion-ui-primary.jpeg` (IMG_4588) |
| **Marketing / Key-Art Hero** | Full-bleed promotional, cinematic loading screens, EXR marketing | `brand/aetherion-keyart-hero.jpeg` (IMG_4587) |

**Design Tokens:** `src/css/aetherion-theme.css`  
- Deep Void Black `#0B0F14`  
- Aether Cyan `#00F0FF`  
- Living Gold `#FFB800`  
- Crystalline White `#FFFFFF`  
- Safe zone: 10–15 % padding · Minimum legible size: 64×64 px

## Architecture Boundary

- This repository is the **dedicated game application**.
- `nano-sandbox` remains pure platform infrastructure (NNACC / NASE / NADRE).  
  **Do not cross-contaminate.**

## 14 Foundation Engines

All engines live under `src/foundation/` and implement the verified specifications from the Planet Builders / Galactic Domination master package.

1. **Retention Proxies** – Player engagement & churn metrics  
2. **Economic Stability under Mutation** – Mutation-resilient economic controls  
3. **Independent Review / Peer-Review Scoring** – Community verification pipelines  
4. **Genetic Mutation / Fitness** – Genome, mutation operators, multi-objective fitness  
5. **Law-Enforcement Hierarchy** – Ranked state machine for governance  
6. **Seed Cascade** – Deterministic seed propagation & carrying-capacity math  
7. **Anti-Singularity Controls** – TRIZ-based growth governors  
8. **Atomic Failure Modes** – FMEA registry & recovery  
9. **Concurrent Activity Logs** – High-throughput hash-chained async logs  
10. **Prior-Art Confirmation** – Immutable IP / skin verification  
11. **ALCOA+ Audit Trails** – Attributable, contemporaneous integrity trails  
12. **Server Metrics** – Real-time telemetry & stability composites  
13. **Industrial Control Layers** – Poka-Yoke, Andon, SPC  
14. **TOC Bottleneck Analysis** – Five focusing steps + DBR

## Quick Start

```bash
npm install
npx tsc --noEmit   # type-check all engines
```

## License

Private / UNLICENSED – Aetherion project.


## Live Dashboard

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

- Header uses the primary UI logo (`brand/aetherion-ui-primary.jpeg` / IMG_4588)
- Runtime controls: Start / Pause / Manual Tick / Reset bound to `AetherionRuntime`
- Telemetry cards for Economic Stability, Genetics, TOC, Law, Anti-Singularity, Seed Cascade, Industrial Controls, AFM
- Live ALCOA+ / activity feed

## GitHub Pages

Live dashboard: **https://dominiccalandro1991-byte.github.io/Aetherion/**

Deployment is automated via `.github/workflows/deploy.yml` on every push to `main` (tests must pass before deploy).
