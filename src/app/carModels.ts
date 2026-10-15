/**
 * Procedural vehicle library for the 3D inspection view.
 *
 * Each car is described by a few profiles (side silhouette, roofline, plan
 * taper, cross-section roundness). The body and glasshouse are lofted from
 * those profiles into smooth shells, then every triangle is classified into
 * an inspection zone (bonnet, sides, roof…) so the shell stays seamless yet
 * each panel can be hovered, clicked and tinted independently.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type CarZone = "front" | "bonnet" | "glass" | "roof" | "boot" | "rear" | "left" | "right" | "wheels";
export type ModelKey = "hatch" | "suv" | "coupe";

type Pts = [number, number][];
type Spec = {
  label: string;
  xr: number;
  xf: number;
  W: number; // half width
  plan: number; // plan-view squareness
  ns: number; // cross-section squareness
  tumble: number;
  clad: number; // dark lower band
  y0: Pts;
  y1: Pts;
  wheels: { x: number[]; r: number; rim: number; width: number; spokes: "twin" | "fine" | "chunky"; caliper: string; rimColor: string };
  gh: { x0: number; x1: number; w: number; plan: number; ns: number; tumble: number; top: Pts; roof: [number, number]; blackRoof?: boolean };
  lights: { head: number; tail: number; bar?: boolean; tailBar?: boolean; drl?: boolean };
  grille: { y: number; h: number; w: number };
  plate: { f: number; r: number };
  doors: number[];
  handles: number[];
  extras: { lip?: boolean; duck?: boolean; rails?: boolean; skid?: boolean; exhaust?: number };
};

export const MODELS: Record<ModelKey, Spec> = {
  hatch: {
    label: "Hatch",
    xr: -2.13,
    xf: 2.13,
    W: 0.9,
    plan: 7,
    ns: 6,
    tumble: 0.08,
    clad: 0.07,
    y0: [[-2.13, 0.46], [-1.95, 0.3], [-1.6, 0.27], [1.6, 0.27], [1.95, 0.3], [2.13, 0.44]],
    y1: [[-2.13, 0.86], [-2.0, 0.98], [-1.5, 1.0], [0, 1.0], [1.0, 0.97], [1.6, 0.9], [2.0, 0.8], [2.13, 0.7]],
    wheels: { x: [1.32, -1.3], r: 0.335, rim: 0.235, width: 0.24, spokes: "twin", caliper: "#8E979E", rimColor: "#C9D0D6" },
    gh: { x0: -1.98, x1: 1.08, w: 0.74, plan: 8, ns: 4, tumble: 0.2, top: [[-1.98, 0.98], [-1.85, 1.3], [-1.55, 1.45], [-0.6, 1.5], [0.3, 1.48], [0.55, 1.4], [1.08, 0.98]], roof: [-1.5, 0.38] },
    lights: { head: 0.8, tail: 0.9 },
    grille: { y: 0.55, h: 0.12, w: 0.5 },
    plate: { f: 0.42, r: 0.64 },
    doors: [0.95, -0.15, -1.25],
    handles: [0.3, -0.85],
    extras: { lip: true },
  },
  suv: {
    label: "SUV",
    xr: -2.3,
    xf: 2.3,
    W: 0.98,
    plan: 9,
    ns: 8,
    tumble: 0.06,
    clad: 0.2,
    y0: [[-2.3, 0.6], [-2.15, 0.44], [2.15, 0.44], [2.3, 0.58]],
    y1: [[-2.3, 1.02], [-2.2, 1.12], [0, 1.16], [1.4, 1.13], [2.0, 1.06], [2.3, 0.9]],
    wheels: { x: [1.4, -1.4], r: 0.39, rim: 0.25, width: 0.28, spokes: "chunky", caliper: "#5B6168", rimColor: "#B9C1C8" },
    gh: { x0: -2.2, x1: 1.15, w: 0.8, plan: 10, ns: 5, tumble: 0.14, top: [[-2.2, 1.12], [-2.14, 1.6], [-1.95, 1.76], [0, 1.8], [0.5, 1.76], [0.7, 1.68], [1.15, 1.12]], roof: [-1.9, 0.5] },
    lights: { head: 1.0, tail: 1.05, drl: true },
    grille: { y: 0.8, h: 0.2, w: 0.62 },
    plate: { f: 0.62, r: 0.8 },
    doors: [1.05, -0.1, -1.25],
    handles: [0.45, -0.75],
    extras: { rails: true, skid: true },
  },
  coupe: {
    label: "Coupé",
    xr: -2.3,
    xf: 2.3,
    W: 0.95,
    plan: 5,
    ns: 5,
    tumble: 0.12,
    clad: 0.05,
    y0: [[-2.3, 0.38], [-2.1, 0.24], [2.1, 0.23], [2.3, 0.32]],
    y1: [[-2.3, 0.74], [-2.1, 0.88], [-1.4, 0.93], [-0.4, 0.9], [0.6, 0.86], [1.3, 0.82], [1.9, 0.74], [2.3, 0.52]],
    wheels: { x: [1.42, -1.36], r: 0.34, rim: 0.26, width: 0.27, spokes: "fine", caliper: "#E11D2E", rimColor: "#2A2E33" },
    gh: { x0: -1.9, x1: 0.95, w: 0.7, plan: 6, ns: 3.4, tumble: 0.18, top: [[-1.9, 0.9], [-1.4, 1.06], [-0.8, 1.24], [-0.2, 1.3], [0.25, 1.24], [0.95, 0.86]], roof: [-0.95, 0.1] },
    lights: { head: 0.64, tail: 0.82, bar: true, tailBar: true },
    grille: { y: 0.38, h: 0.1, w: 0.7 },
    plate: { f: 0.34, r: 0.5 },
    doors: [0.85, -0.55],
    handles: [-0.3],
    extras: { duck: true, exhaust: 4 },
  },
};

export const PAINTS = [
  { name: "Lapis blue", hex: "#2346B0" },
  { name: "Glacier white", hex: "#E6EAEE" },
  { name: "Obsidian", hex: "#16191C" },
  { name: "Flame red", hex: "#B3121B" },
  { name: "Sage", hex: "#5E7D6A" },
  { name: "Sunset", hex: "#D9631E" },
];

/* ── maths helpers ── */
function curve(pts: Pts) {
  const n = pts.length;
  return (x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(n - 1, i + 2)][1];
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
}
const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
const planFactor = (x: number, xc: number, hl: number, p: number) => {
  const u = Math.min(1, Math.abs((x - xc) / hl));
  return Math.pow(Math.max(0, 1 - Math.pow(u, p)), 1 / p);
};

type Section = { y0: (x: number) => number; y1: (x: number) => number; w: (x: number) => number; ns: number; tumble: number };
/** point on a superellipse cross-section */
function sectionPoint(S: Section, x: number, th: number, out: THREE.Vector3) {
  const y0 = S.y0(x), y1 = S.y1(x);
  const mid = (y0 + y1) / 2, h = (y1 - y0) / 2;
  const sy = sgnPow(Math.sin(th), 2 / S.ns);
  const sz = sgnPow(Math.cos(th), 2 / S.ns);
  const up = Math.max(0, sy);
  return out.set(x, mid + h * sy, S.w(x) * sz * (1 - S.tumble * up * up));
}
/** half-width of a section at a given height */
function sideZ(S: Section, x: number, y: number) {
  const y0 = S.y0(x), y1 = S.y1(x);
  const mid = (y0 + y1) / 2, h = (y1 - y0) / 2;
  const sy = Math.max(-1, Math.min(1, (y - mid) / h));
  const sz = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(sy), S.ns / 2)), 2 / S.ns);
  const up = Math.max(0, sy);
  return S.w(x) * sz * (1 - S.tumble * up * up);
}

function loft(S: Section, x0: number, x1: number, nx: number, nth: number, th0 = -Math.PI / 2, th1 = (3 * Math.PI) / 2, grow = 0) {
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const xc = (x0 + x1) / 2, hl = (x1 - x0) / 2;
  for (let i = 0; i <= nx; i++) {
    const v = -1 + (2 * i) / nx;
    const x = xc + hl * Math.sin((v * Math.PI) / 2); // denser at the ends
    for (let j = 0; j <= nth; j++) {
      sectionPoint(S, x, th0 + ((th1 - th0) * j) / nth, p);
      if (grow) {
        p.y += grow;
        p.z *= 1 + grow;
      }
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = nth + 1;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nth; j++) {
      const a = i * row + j, b = (i + 1) * row + j, c = i * row + j + 1, d = (i + 1) * row + j + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

export type Shell = { mesh: THREE.Mesh; zones: CarZone[]; base: THREE.Color[]; colors: THREE.BufferAttribute };
export type BuiltCar = {
  group: THREE.Group;
  shells: Shell[];
  meshZones: THREE.Mesh[];
  tyreMat: THREE.MeshStandardMaterial;
  anchors: Record<CarZone, { p: [number, number, number]; n: [number, number, number] }>;
  height: number;
  dispose: () => void;
};

function plateTexture(front: boolean) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 112;
  const x = c.getContext("2d")!;
  x.fillStyle = front ? "#F4F5F2" : "#FFD60A";
  x.fillRect(0, 0, 512, 112);
  x.fillStyle = "#0B3FA8";
  x.fillRect(0, 0, 54, 112);
  x.fillStyle = "#fff";
  x.font = "bold 22px sans-serif";
  x.textAlign = "center";
  x.fillText("UK", 27, 92);
  x.fillStyle = "#111";
  x.font = "bold 78px 'Arial Black', Arial, sans-serif";
  x.fillText("BD71 KLO", 284, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Build a car. `paint` is shared by reference so the caller can recolour the
 * car live by mutating it.
 */
export function buildCar(key: ModelKey, paint: THREE.Color): BuiltCar {
  const s = MODELS[key];
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const keep = <T extends THREE.Material>(m: T) => (mats.push(m), m);
  const shells: Shell[] = [];
  const meshZones: THREE.Mesh[] = [];

  const TRIM = new THREE.Color("#121518");
  const PILLAR = new THREE.Color("#0A0C0E");
  const GLASS = new THREE.Color("#1B2731");

  /* ── profiles ── */
  const Y0raw = curve(s.y0), Y1 = curve(s.y1);
  const R = s.wheels.r + 0.075;
  const y0 = (x: number) => {
    let y = Y0raw(x);
    for (const wx of s.wheels.x) {
      const dx = x - wx;
      if (Math.abs(dx) < R) y = Math.max(y, s.wheels.r + Math.sqrt(R * R - dx * dx) * 0.93);
    }
    return Math.min(y, Y1(x) - 0.08);
  };
  const bxc = (s.xf + s.xr) / 2, bhl = (s.xf - s.xr) / 2;
  const body: Section = { y0, y1: Y1, w: (x) => s.W * planFactor(x, bxc, bhl, s.plan), ns: s.ns, tumble: s.tumble };
  const GT = curve(s.gh.top);
  const gxc = (s.gh.x0 + s.gh.x1) / 2, ghl = (s.gh.x1 - s.gh.x0) / 2;
  const glassS: Section = { y0: (x) => Y1(x) - 0.35, y1: GT, w: (x) => s.gh.w * planFactor(x, gxc, ghl, s.gh.plan), ns: s.gh.ns, tumble: s.gh.tumble };

  /* ── materials ── */
  const paintMat = keep(new THREE.MeshPhysicalMaterial({ color: "#ffffff", vertexColors: true, metalness: 0.48, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const glassMat = keep(
    new THREE.MeshPhysicalMaterial({ color: "#ffffff", vertexColors: true, metalness: 0.2, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.74, envMapIntensity: 1.7 })
  );
  const trim = keep(new THREE.MeshStandardMaterial({ color: "#121518", metalness: 0.35, roughness: 0.55 }));
  const chrome = keep(new THREE.MeshStandardMaterial({ color: "#E3E8EC", metalness: 1, roughness: 0.12 }));
  const interior = keep(new THREE.MeshStandardMaterial({ color: "#26221F", roughness: 0.85 }));
  const head = keep(new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#EAF7FF", emissiveIntensity: 2.2 }));
  const lens = keep(new THREE.MeshPhysicalMaterial({ color: "#0D1418", metalness: 0.3, roughness: 0.05, clearcoat: 1 }));
  const tail = keep(new THREE.MeshStandardMaterial({ color: "#ff2a1f", emissive: "#ff1f14", emissiveIntensity: 1.8 }));
  const tyreMat = keep(new THREE.MeshStandardMaterial({ color: "#17191B", roughness: 0.9, side: THREE.DoubleSide, emissive: "#000000", emissiveIntensity: 0 }));
  tyreMat.userData.base = tyreMat.color.clone();
  const rimMat = keep(new THREE.MeshStandardMaterial({ color: s.wheels.rimColor, metalness: 0.95, roughness: 0.22 }));
  const discMat = keep(new THREE.MeshStandardMaterial({ color: "#6D7378", metalness: 0.9, roughness: 0.45 }));
  const caliperMat = keep(new THREE.MeshStandardMaterial({ color: s.wheels.caliper, metalness: 0.3, roughness: 0.35 }));

  const addMesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = group) => {
    geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    parent.add(mesh);
    return mesh;
  };
  const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const tube = (pts: THREE.Vector3[], r: number, m: THREE.Material, seg = 48) => addMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 10, false), m);

  /* ── shell builder with per-triangle zones ── */
  const shell = (g: THREE.BufferGeometry, mat: THREE.Material, classify: (c: THREE.Vector3, n: THREE.Vector3) => [CarZone, THREE.Color]) => {
    const pos = g.getAttribute("position");
    const tri = pos.count / 3;
    const zones: CarZone[] = [];
    const base: THREE.Color[] = [];
    const colors = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < tri; i++) {
      a.fromBufferAttribute(pos, i * 3);
      b.fromBufferAttribute(pos, i * 3 + 1);
      c.fromBufferAttribute(pos, i * 3 + 2);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      if (n.lengthSq() < 1e-14) n.set(0, 1, 0);
      n.normalize();
      const [z, col] = classify(a.add(b).add(c).divideScalar(3), n);
      zones.push(z);
      base.push(col);
      for (let k = 0; k < 3; k++) colors.setXYZ(i * 3 + k, col.r, col.g, col.b);
    }
    g.setAttribute("color", colors);
    const mesh = addMesh(g, mat);
    mesh.userData.shell = true;
    shells.push({ mesh, zones, base, colors });
    return mesh;
  };

  /* body */
  shell(loft(body, s.xr, s.xf, 170, 64), paintMat, (c, n) => {
    const lower = c.y < y0(c.x) + s.clad || n.y < -0.35;
    const col = lower ? TRIM : paint;
    if (c.x > s.xf - 0.3 && n.y < 0.6) return ["front", col];
    if (c.x < s.xr + 0.28 && n.y < 0.6) return ["rear", col];
    if (n.y > 0.5 && c.x > s.gh.x1 - 0.06) return ["bonnet", col];
    if (n.y > 0.45 && c.x < s.gh.x0 + 0.08) return ["boot", col];
    return [c.z < 0 ? "left" : "right", col];
  });

  /* glasshouse — glass with black pillars */
  const bX = s.doors[1] ?? 0;
  shell(loft(glassS, s.gh.x0, s.gh.x1, 110, 48), glassMat, (c, n) => {
    const az = Math.abs(n.z);
    const pillar = (az > 0.3 && az < 0.62) || (az > 0.45 && Math.abs(c.x - bX) < 0.045) || c.y < Y1(c.x) + 0.035;
    const col = pillar ? PILLAR : GLASS;
    if (az > 0.45) return [c.z < 0 ? "left" : "right", col];
    return [c.x > gxc ? "glass" : "boot", col];
  });

  /* roof skin */
  shell(loft(glassS, s.gh.roof[0], s.gh.roof[1], 60, 18, Math.PI / 2 - 0.78, Math.PI / 2 + 0.78, 0.006), paintMat, () => ["roof", s.gh.blackRoof ? PILLAR : paint]);

  /* ── interior (seen through glass) ── */
  const xMid = gxc;
  // fit seats under the roofline (low coupé roofs included)
  const seat = (x: number, w: number, z: number, lean: number) => {
    const top = Math.min(Y1(x) + 0.4, GT(x) - 0.1);
    const bottom = Y1(x) - 0.25;
    const h = Math.max(0.2, top - bottom);
    const back = addMesh(rbox(0.13, h, w, 0.06), interior);
    back.position.set(x, bottom + h / 2, z);
    back.rotation.z = lean;
    return top;
  };
  for (const z of [-0.36, 0.36]) {
    const top = seat(xMid + 0.05, 0.46, z, 0.18);
    if (GT(xMid) - top > 0.2) {
      const hr = addMesh(rbox(0.1, 0.13, 0.26, 0.05), interior);
      hr.position.set(xMid + 0.0, top + 0.08, z);
    }
  }
  seat(xMid - 0.8, s.gh.w * 1.55, 0, 0.2);
  const dash = addMesh(rbox(0.34, 0.14, s.gh.w * 1.8, 0.05), interior);
  dash.position.set(s.gh.x1 - 0.3, Y1(s.gh.x1 - 0.3) + 0.05, 0);
  const steer = addMesh(new THREE.TorusGeometry(0.15, 0.022, 10, 36), trim);
  steer.position.set(s.gh.x1 - 0.5, Y1(s.gh.x1 - 0.5) + 0.15, 0.36); // right-hand drive
  steer.rotation.set(0, Math.PI / 2, 0.4);

  /* ── surface details ── */
  const P = (x: number, y: number, side: number, out = 1.004) => new THREE.Vector3(x, y, side * sideZ(body, x, y) * out);
  // door shut lines
  for (const dx of s.doors)
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      const ya = y0(dx) + 0.05, yb = Y1(dx) - 0.035;
      for (let k = 0; k <= 10; k++) pts.push(P(dx, ya + ((yb - ya) * k) / 10, side, 1.002));
      tube(pts, 0.0055, trim, 16);
    }
  // handles
  for (const hx of s.handles)
    for (const side of [-1, 1]) {
      const y = Y1(hx) - 0.13;
      const m = addMesh(rbox(0.17, 0.032, 0.03, 0.014), s.extras.rails ? trim : chrome);
      m.position.copy(P(hx, y, side, 1.0)).add(new THREE.Vector3(0, 0, side * 0.012));
    }
  // window chrome line
  if (!s.gh.blackRoof)
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 24; k++) {
        const x = s.gh.x0 + 0.22 + ((s.gh.x1 - 0.18 - (s.gh.x0 + 0.22)) * k) / 24;
        const y = Y1(x) + 0.012;
        pts.push(new THREE.Vector3(x, y, side * sideZ(glassS, x, y) * 1.01));
      }
      tube(pts, 0.009, chrome, 40);
    }

  // headlights: wrap-around lamp units following the nose
  const nose = (z: number, y: number, front: boolean) => {
    const zmax = sideZ({ ...body, w: () => s.W }, front ? s.xf - 0.4 : s.xr + 0.4, y);
    const g = Math.min(0.999, Math.abs(z) / Math.max(zmax, 0.01));
    const u = Math.pow(1 - Math.pow(g, s.plan), 1 / s.plan);
    return bxc + (front ? 1 : -1) * bhl * u;
  };
  const lampPts = (y: number, front: boolean, side: number, z0: number, z1: number, n = 14) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const z = z0 + ((z1 - z0) * k) / n;
      pts.push(new THREE.Vector3(nose(z, y, front) + (front ? 0.006 : -0.006), y, side * z));
    }
    return pts;
  };
  const zEdge = (y: number) => sideZ({ ...body, w: () => s.W }, s.xf - 0.4, y) * 0.96;
  for (const side of [-1, 1]) {
    const yh = s.lights.head;
    tube(lampPts(yh - 0.012, true, side, s.lights.bar ? 0.05 : 0.3, zEdge(yh)), 0.05, lens, 30);
    tube(lampPts(yh + 0.012, true, side, s.lights.bar ? 0.05 : 0.34, zEdge(yh) * 0.99), 0.016, head, 30);
    if (s.lights.drl) tube(lampPts(yh - 0.09, true, side, 0.4, zEdge(yh - 0.09) * 0.97), 0.012, head, 24);
    if (!s.lights.tailBar) {
      tube(lampPts(s.lights.tail, false, side, 0.42, zEdge(s.lights.tail) * 0.98), 0.042, lens, 24);
      tube(lampPts(s.lights.tail + 0.01, false, side, 0.44, zEdge(s.lights.tail) * 0.97), 0.02, tail, 24);
    }
  }
  if (s.lights.bar) tube(lampPts(s.lights.head + 0.012, true, 1, -0.3, 0.3, 12), 0.01, head, 24);
  if (s.lights.tailBar) {
    const ze = zEdge(s.lights.tail) * 0.97;
    tube(lampPts(s.lights.tail, false, 1, -ze, ze, 30), 0.034, lens, 60);
    tube(lampPts(s.lights.tail + 0.008, false, 1, -ze * 0.99, ze * 0.99, 30), 0.014, tail, 60);
  }

  // grille / intakes
  const gx = nose(0, s.grille.y, true);
  const grille = addMesh(new THREE.SphereGeometry(1, 32, 16), trim);
  grille.scale.set(0.06, s.grille.h, s.grille.w);
  grille.position.set(gx - 0.035, s.grille.y, 0);
  const intake = addMesh(new THREE.SphereGeometry(1, 32, 16), trim);
  const iy = y0(s.xf - 0.2) + 0.12;
  intake.scale.set(0.05, 0.06, s.W * 0.62);
  intake.position.set(nose(0, iy, true) - 0.03, iy, 0);
  // grille slats
  for (let k = -2; k <= 2; k++) {
    const sl = addMesh(rbox(0.02, 0.012, s.grille.w * 1.5, 0.005), s.extras.rails ? chrome : trim);
    sl.position.set(gx + 0.02, s.grille.y + k * s.grille.h * 0.32, 0);
  }

  // plates
  for (const front of [true, false]) {
    const t = plateTexture(front);
    texs.push(t);
    const m = addMesh(new THREE.PlaneGeometry(0.52, 0.114), keep(new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 })));
    const y = front ? s.plate.f : s.plate.r;
    m.position.set(nose(0, y, front) + (front ? 0.012 : -0.012), y, 0);
    m.rotation.y = front ? Math.PI / 2 : -Math.PI / 2;
  }

  // mirrors (side zones; follow paint)
  for (const side of [-1, 1]) {
    const mx = s.gh.x1 - 0.14;
    const my = Y1(mx) + 0.075;
    const mz = side * (sideZ(body, mx, Y1(mx) - 0.02) + 0.11);
    const mm = keep(new THREE.MeshPhysicalMaterial({ color: paint.clone(), metalness: 0.62, roughness: 0.3, clearcoat: 1, emissive: "#000000", emissiveIntensity: 0 }));
    const head = addMesh(new THREE.SphereGeometry(1, 24, 16), mm);
    head.scale.set(0.085, 0.062, 0.12);
    head.rotation.y = side * 0.25;
    head.position.set(mx, my, mz);
    head.userData.zone = side < 0 ? "left" : "right";
    head.userData.base = paint;
    meshZones.push(head);
    const stalk = addMesh(rbox(0.06, 0.03, 0.12, 0.012), trim);
    stalk.position.set(mx + 0.02, my - 0.04, mz - side * 0.07);
    stalk.userData.zone = head.userData.zone;
  }

  // extras
  if (s.extras.lip) {
    const x = s.gh.x0 + 0.24;
    const lw = 2 * sideZ(glassS, x, GT(x) - 0.04) * 0.92;
    const m = addMesh(rbox(0.2, 0.035, lw, 0.016), keep(new THREE.MeshPhysicalMaterial({ color: paint.clone(), metalness: 0.62, roughness: 0.3, clearcoat: 1, emissive: "#000000", emissiveIntensity: 0 })));
    m.position.set(x - 0.05, GT(x) + 0.01, 0);
    m.rotation.z = 0.22;
    m.userData.zone = "roof";
    m.userData.base = paint;
    meshZones.push(m);
  }
  if (s.extras.duck) {
    const x = s.xr + 0.24;
    const m = addMesh(rbox(0.16, 0.045, s.W * 1.55, 0.02), keep(new THREE.MeshPhysicalMaterial({ color: paint.clone(), metalness: 0.62, roughness: 0.3, clearcoat: 1, emissive: "#000000", emissiveIntensity: 0 })));
    m.position.set(x, Y1(x) + 0.02, 0);
    m.rotation.z = -0.2;
    m.userData.zone = "boot";
    m.userData.base = paint;
    meshZones.push(m);
  }
  if (s.extras.rails)
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const x = s.gh.roof[0] + 0.05 + ((s.gh.roof[1] - s.gh.roof[0] - 0.1) * k) / 12;
        pts.push(new THREE.Vector3(x, GT(x) + 0.07, side * s.gh.w * 0.6));
      }
      tube(pts, 0.018, chrome, 24);
      for (const t of [0, 1]) {
        const p = pts[t ? pts.length - 1 : 0];
        const leg = addMesh(rbox(0.08, 0.07, 0.04, 0.015), trim);
        leg.position.set(p.x, p.y - 0.035, p.z);
      }
    }
  if (s.extras.skid)
    for (const front of [true, false]) {
      const y = y0(front ? s.xf - 0.15 : s.xr + 0.15) + 0.05;
      const m = addMesh(rbox(0.05, 0.08, s.W * 0.9, 0.02), chrome);
      m.position.set(nose(0, y, front) + (front ? -0.02 : 0.02), y, 0);
    }
  if (s.extras.exhaust)
    for (let k = 0; k < s.extras.exhaust; k++) {
      const z = (k < s.extras.exhaust / 2 ? -1 : 1) * (0.42 + (k % 2) * 0.13);
      const y = y0(s.xr + 0.1) + 0.03;
      const tip = addMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 24, 1, true), chrome);
      tip.rotation.z = Math.PI / 2;
      tip.position.set(nose(Math.abs(z), y, false) + 0.02, y, z);
      const inner = addMesh(new THREE.CircleGeometry(0.04, 20), keep(new THREE.MeshBasicMaterial({ color: "#050505" })));
      inner.rotation.y = -Math.PI / 2;
      inner.position.set(tip.position.x - 0.05, y, z);
    }
  // shark-fin antenna
  const fin = addMesh(new THREE.ConeGeometry(0.05, 0.09, 16), trim);
  fin.scale.set(1.8, 1, 0.5);
  fin.position.set(s.gh.roof[0] + 0.12, GT(s.gh.roof[0] + 0.12) + 0.04, 0);

  /* ── wheels ── */
  const { r, rim, width } = s.wheels;
  const prof = [
    [rim * 0.98, -width / 2],
    [r - 0.05, -width / 2],
    [r - 0.014, -width / 2 + 0.022],
    [r, -width / 2 + 0.06],
    [r, width / 2 - 0.06],
    [r - 0.014, width / 2 - 0.022],
    [r - 0.05, width / 2],
    [rim * 0.98, width / 2],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const tyreGeo = new THREE.LatheGeometry(prof, 72);
  const treadGeo = new THREE.BoxGeometry(0.03, 0.014, width * 0.36);
  const barrelGeo = new THREE.CylinderGeometry(rim, rim * 0.92, width * 0.9, 48, 1, true);
  const lipGeo = new THREE.TorusGeometry(rim, 0.013, 8, 64);
  const discGeo = new THREE.CylinderGeometry(rim * 0.8, rim * 0.8, 0.022, 40);
  const caliperGeo = new THREE.TorusGeometry(rim * 0.72, 0.034, 10, 16, 0.95);
  const capGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.04, 28);
  const spokeGeo =
    s.wheels.spokes === "chunky" ? rbox(0.075, rim * 0.86, 0.045, 0.02) : s.wheels.spokes === "fine" ? rbox(0.03, rim * 0.9, 0.035, 0.012) : rbox(0.036, rim * 0.88, 0.04, 0.014);
  geos.push(tyreGeo, treadGeo, barrelGeo, lipGeo, discGeo, caliperGeo, capGeo, spokeGeo);
  const spokeAngles: number[] = [];
  if (s.wheels.spokes === "twin") for (let k = 0; k < 5; k++) spokeAngles.push((k / 5) * Math.PI * 2 - 0.1, (k / 5) * Math.PI * 2 + 0.1);
  else if (s.wheels.spokes === "fine") for (let k = 0; k < 10; k++) spokeAngles.push((k / 10) * Math.PI * 2);
  else for (let k = 0; k < 6; k++) spokeAngles.push((k / 6) * Math.PI * 2);
  const capMat = keep(new THREE.MeshStandardMaterial({ color: "#10B981", metalness: 0.6, roughness: 0.3 }));
  const tz = s.W - width / 2 - 0.035;
  for (const wx of s.wheels.x)
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(wx, r, side * tz);
      if (side < 0) w.rotation.y = Math.PI;
      group.add(w);
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.x = Math.PI / 2;
      w.add(tyre);
      const tread = new THREE.InstancedMesh(treadGeo, tyreMat, 120);
      const o = new THREE.Object3D();
      for (let k = 0; k < 60; k++) {
        const a = (k / 60) * Math.PI * 2;
        for (const half of [-1, 1]) {
          o.position.set(Math.cos(a) * (r + 0.003), Math.sin(a) * (r + 0.003), half * width * 0.2);
          o.rotation.set(0, half * 0.35, a);
          o.updateMatrix();
          tread.setMatrixAt(k * 2 + (half > 0 ? 1 : 0), o.matrix);
        }
      }
      w.add(tread);
      const barrel = new THREE.Mesh(barrelGeo, discMat);
      barrel.rotation.x = Math.PI / 2;
      w.add(barrel);
      const lip = new THREE.Mesh(lipGeo, rimMat);
      lip.position.z = width * 0.43;
      w.add(lip);
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.z = width * 0.05;
      w.add(disc);
      const cal = new THREE.Mesh(caliperGeo, caliperMat);
      cal.position.z = width * 0.17;
      cal.rotation.z = Math.PI * 0.42;
      w.add(cal);
      for (const a of spokeAngles) {
        const sp = new THREE.Mesh(spokeGeo, rimMat);
        sp.position.set(-Math.sin(a) * rim * 0.47, Math.cos(a) * rim * 0.47, width * 0.36);
        sp.rotation.set(-0.12 * Math.cos(a), 0.12 * Math.sin(a), a);
        w.add(sp);
      }
      const hub = new THREE.Mesh(capGeo, rimMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = width * 0.4;
      w.add(hub);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), capMat);
      geos.push(cap.geometry);
      cap.position.z = width * 0.425;
      w.add(cap);
      w.traverse((ob) => (ob.userData.zone = "wheels"));
    }

  /* ── badge anchors ── */
  const bonX = (s.gh.x1 + s.xf) / 2;
  const glX = s.gh.x1 - 0.3;
  const roofX = (s.gh.roof[0] + s.gh.roof[1]) / 2;
  const bootX = Math.max(s.xr + 0.2, s.gh.x0 + 0.12);
  const mid0 = (y0(0) + Y1(0)) / 2;
  const anchors: BuiltCar["anchors"] = {
    front: { p: [s.xf + 0.06, (y0(s.xf - 0.15) + Y1(s.xf - 0.15)) / 2, 0], n: [1, 0, 0] },
    rear: { p: [s.xr - 0.06, (y0(s.xr + 0.15) + Y1(s.xr + 0.15)) / 2, 0], n: [-1, 0, 0] },
    bonnet: { p: [bonX, Y1(bonX) + 0.04, 0], n: [0.3, 1, 0] },
    glass: { p: [glX, GT(glX) + 0.03, 0], n: [0.7, 0.7, 0] },
    roof: { p: [roofX, GT(roofX) + 0.06, 0], n: [0, 1, 0] },
    boot: { p: [bootX, Math.max(Y1(bootX), GT(bootX)) + 0.05, 0], n: [-0.6, 0.8, 0] },
    left: { p: [0.05, mid0, -(s.W + 0.06)], n: [0, 0, -1] },
    right: { p: [0.05, mid0, s.W + 0.06], n: [0, 0, 1] },
    wheels: { p: [s.wheels.x[0], r, -(s.W + 0.06)], n: [0, 0, -1] },
  };

  return {
    group,
    shells,
    meshZones,
    tyreMat,
    anchors,
    height: Math.max(...s.gh.top.map((p) => p[1])),
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}
