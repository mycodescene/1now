"use client";

/**
 * Car3D — interactive 360° vehicle for return-inspection damage logging.
 * Three lofted, fully detailed body styles (see carModels.ts) with live paint.
 * Drag to orbit, scroll / pinch to zoom, click a panel to log damage. Logged
 * panels turn amber and carry a count badge that tracks the panel in 3D.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCar, MODELS, PAINTS, type BuiltCar, type CarZone, type ModelKey } from "./carModels";

export type { CarZone } from "./carModels";

export const CAR_ZONES: { id: CarZone; label: string; icon: string }[] = [
  { id: "front", label: "Front bumper", icon: "directions_car" },
  { id: "bonnet", label: "Bonnet", icon: "garage" },
  { id: "glass", label: "Windscreen", icon: "window" },
  { id: "roof", label: "Roof", icon: "roofing" },
  { id: "left", label: "Nearside (left)", icon: "arrow_back" },
  { id: "right", label: "Offside (right)", icon: "arrow_forward" },
  { id: "boot", label: "Boot / rear glass", icon: "luggage" },
  { id: "rear", label: "Rear bumper", icon: "u_turn_left" },
  { id: "wheels", label: "Wheels / tyres", icon: "tire_repair" },
];
const LABEL = Object.fromEntries(CAR_ZONES.map((z) => [z.id, z.label])) as Record<CarZone, string>;
const ZONE_IDS = CAR_ZONES.map((z) => z.id);

const MODEL_ICONS: Record<ModelKey, string> = { hatch: "directions_car", suv: "airport_shuttle", coupe: "sports_motorsports" };

type View = { az: number; el: number };
const VIEWS: Record<string, View & { label: string; icon: string }> = {
  iso: { az: 35, el: 18, label: "3/4", icon: "view_in_ar" },
  front: { az: 0, el: 10, label: "Front", icon: "north" },
  left: { az: -90, el: 8, label: "Left", icon: "west" },
  rear: { az: 180, el: 12, label: "Rear", icon: "south" },
  right: { az: 90, el: 8, label: "Right", icon: "east" },
  top: { az: 30, el: 78, label: "Top", icon: "vertical_align_bottom" },
};
const ZONE_VIEW: Record<CarZone, View> = {
  front: { az: 20, el: 12 },
  bonnet: { az: 25, el: 32 },
  glass: { az: 30, el: 24 },
  roof: { az: 30, el: 66 },
  boot: { az: 205, el: 26 },
  rear: { az: 195, el: 10 },
  left: { az: -90, el: 10 },
  right: { az: 90, el: 10 },
  wheels: { az: -60, el: 4 },
};

const TARGET = new THREE.Vector3(0, 0.62, 0);
const DAMAGE = new THREE.Color("#F59E0B");
const HOVER = new THREE.Color("#FFFFFF");
const SELECT = new THREE.Color("#22D3EE");

type Props = {
  counts: Record<string, number>;
  selected: CarZone | null;
  onPick: (z: CarZone) => void;
  disabled?: boolean;
};

export default function Car3D({ counts, selected, onPick, disabled }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const badgeRefs = useRef<Partial<Record<CarZone, HTMLSpanElement | null>>>({});
  const tipRef = useRef<HTMLDivElement>(null);
  const live = useRef({ counts, selected, onPick, disabled });
  const api = useRef<{ fly: (v: View) => void; setAuto: (on: boolean) => void; setModel: (k: ModelKey) => void; setPaint: (hex: string) => void } | null>(null);
  const [auto, setAuto] = useState(true);
  const [touched, setTouched] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [model, setModel] = useState<ModelKey>("hatch");
  const [paint, setPaint] = useState(PAINTS[0].hex);

  useEffect(() => {
    live.current = { counts, selected, onPick, disabled };
  }, [counts, selected, onPick, disabled]);
  useEffect(() => {
    api.current?.setModel(model);
  }, [model]);
  useEffect(() => {
    api.current?.setPaint(paint);
  }, [paint]);

  useEffect(() => {
    const host = canvasHost.current;
    const wrap = wrapRef.current;
    if (!host || !wrap) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      requestAnimationFrame(() => setFailed(true));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(TARGET);
    Object.assign(controls, {
      enableDamping: true,
      dampingFactor: 0.08,
      enablePan: false,
      minDistance: 5.6,
      maxDistance: 14,
      minPolarAngle: 0.12,
      maxPolarAngle: Math.PI / 2 - 0.03,
      autoRotate: true,
      autoRotateSpeed: 0.9,
      rotateSpeed: 0.75,
    });

    /* studio lighting */
    scene.add(new THREE.HemisphereLight("#ffffff", "#20262b", 0.7));
    const key = new THREE.DirectionalLight("#ffffff", 2.0);
    key.position.set(4, 7, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#cfe3ff", 0.7);
    fill.position.set(-6, 3, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#8ff0c8", 0.9);
    rim.position.set(-3, 4, -6);
    scene.add(rim);

    /* floor: contact shadow + turntable */
    const sc = document.createElement("canvas");
    sc.width = sc.height = 256;
    const sx = sc.getContext("2d")!;
    const grd = sx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(0,0,0,0.75)");
    grd.addColorStop(0.45, "rgba(0,0,0,0.38)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    sx.fillStyle = grd;
    sx.fillRect(0, 0, 256, 256);
    const shadowTex = new THREE.CanvasTexture(sc);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    const shadowGeo = new THREE.PlaneGeometry(6, 2.9);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    scene.add(shadow);
    const discGeo = new THREE.CircleGeometry(3.1, 96);
    const discMat = new THREE.MeshBasicMaterial({ color: "#0A0E11", transparent: true, opacity: 0.75 });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.002;
    scene.add(disc);
    const ringGeo = new THREE.RingGeometry(3.08, 3.12, 160);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#10B981", transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    scene.add(ring);

    /* car */
    const PAINT = new THREE.Color(PAINTS[0].hex);
    let car: BuiltCar = buildCar("hatch", PAINT);
    scene.add(car.group);
    let lastSig = "";

    /* camera helpers */
    let fit = 1;
    const tmpV = new THREE.Vector3();
    const viewPos = (v: View, dist = 9.4 * fit) => {
      const az = (v.az * Math.PI) / 180;
      const el = (v.el * Math.PI) / 180;
      return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(dist).add(TARGET);
    };
    type Fly = { a0: number; e0: number; a1: number; e1: number; d: number; t0: number };
    let fly: Fly | null = null;
    const startFly = (v: View) => {
      tmpV.copy(camera.position).sub(TARGET);
      const a0 = Math.atan2(tmpV.z, tmpV.x);
      const e0 = Math.asin(tmpV.y / tmpV.length());
      let a1 = (v.az * Math.PI) / 180;
      while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
      while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
      fly = { a0, e0, a1, e1: (v.el * Math.PI) / 180, d: tmpV.length(), t0: performance.now() };
    };
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      fit = Math.max(1, 1.6 / (w / h));
      controls.maxDistance = 14 * fit;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    camera.position.copy(viewPos(VIEWS.iso));

    /* picking */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hover: CarZone | null = null;
    let down: { x: number; y: number } | null = null;
    const pick = (e: PointerEvent): CarZone | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(car.group, true).find((h) => h.object.userData.shell || h.object.userData.zone);
      if (!hit) return null;
      if (hit.object.userData.shell) {
        const sh = car.shells.find((x) => x.mesh === hit.object);
        return sh && hit.faceIndex != null ? sh.zones[hit.faceIndex] : null;
      }
      return hit.object.userData.zone as CarZone;
    };
    const el = renderer.domElement;
    const onMove = (e: PointerEvent) => {
      hover = live.current.disabled ? null : pick(e);
      el.style.cursor = hover ? "pointer" : down ? "grabbing" : "grab";
      const tip = tipRef.current;
      if (tip) {
        const r = wrap.getBoundingClientRect();
        tip.style.opacity = hover && !down ? "1" : "0";
        tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
        if (hover) tip.textContent = `${LABEL[hover]}${live.current.counts[hover] ? ` · ${live.current.counts[hover]} logged` : " · click to log"}`;
      }
    };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && !live.current.disabled) {
        const z = pick(e);
        if (z) live.current.onPick(z);
      }
      down = null;
    };
    const onLeave = () => {
      hover = null;
      if (tipRef.current) tipRef.current.style.opacity = "0";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);
    const stopAuto = () => {
      controls.autoRotate = false;
      fly = null;
      setAuto(false);
      setTouched(true);
    };
    controls.addEventListener("start", stopAuto);

    /* model swap with a little drop-in */
    let swapT = 1;
    api.current = {
      fly: (v) => {
        controls.autoRotate = false;
        setAuto(false);
        startFly(v);
      },
      setAuto: (on) => {
        controls.autoRotate = on;
        fly = null;
      },
      setModel: (k) => {
        scene.remove(car.group);
        car.dispose();
        car = buildCar(k, PAINT);
        scene.add(car.group);
        lastSig = "";
        swapT = 0;
      },
      setPaint: (hex) => {
        PAINT.set(hex);
        lastSig = "";
      },
    };

    /* loop */
    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(wrap);
    const tmp = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    const col = new THREE.Color();
    let raf = 0;
    let t = 0;
    const tint = (z: CarZone, base: THREE.Color, out: THREE.Color, pulse: number) => {
      out.copy(base);
      const { counts: cs, selected: sel } = live.current;
      if (cs[z]) out.lerp(DAMAGE, 0.82);
      if (z === sel) out.lerp(SELECT, pulse);
      else if (z === hover) out.lerp(HOVER, 0.3);
      return out;
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      t += 0.016;
      if (fly) {
        const k = Math.min(1, (performance.now() - fly.t0) / 900);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const az = fly.a0 + (fly.a1 - fly.a0) * e;
        const el = fly.e0 + (fly.e1 - fly.e0) * e;
        camera.position.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(fly.d).add(TARGET);
        if (k >= 1) fly = null;
      }
      controls.update();

      if (swapT < 1) {
        swapT = Math.min(1, swapT + 0.035);
        const e = 1 - Math.pow(1 - swapT, 3);
        car.group.position.y = (1 - e) * 0.6;
        car.group.rotation.y = (1 - e) * -0.5;
      }

      const { counts: cs, selected: sel } = live.current;
      const pulse = 0.4 + Math.sin(t * 5) * 0.2;
      const sig = `${ZONE_IDS.map((z) => cs[z] ?? 0).join(",")}|${sel}|${hover}|${PAINT.getHexString()}`;
      if (sig !== lastSig || sel) {
        lastSig = sig;
        for (const sh of car.shells) {
          const arr = sh.colors.array as Float32Array;
          for (let i = 0; i < sh.zones.length; i++) {
            tint(sh.zones[i], sh.base[i], col, pulse);
            const o = i * 9;
            arr[o] = arr[o + 3] = arr[o + 6] = col.r;
            arr[o + 1] = arr[o + 4] = arr[o + 7] = col.g;
            arr[o + 2] = arr[o + 5] = arr[o + 8] = col.b;
          }
          sh.colors.needsUpdate = true;
        }
        for (const m of car.meshZones) (m.material as THREE.MeshStandardMaterial).color.copy(tint(m.userData.zone, m.userData.base, col, pulse));
        const tm = car.tyreMat;
        tm.color.copy(cs.wheels ? col.set("#6b4407") : (tm.userData.base as THREE.Color));
        tm.emissive.copy(sel === "wheels" ? SELECT : HOVER);
        tm.emissiveIntensity = sel === "wheels" ? pulse * 0.45 : hover === "wheels" ? 0.12 : 0;
      }
      ringMat.opacity = 0.28 + Math.sin(t * 1.6) * 0.12;

      camera.getWorldDirection(camDir);
      const r = host.getBoundingClientRect();
      for (const z of ZONE_IDS) {
        const b = badgeRefs.current[z];
        if (!b) continue;
        const a = car.anchors[z];
        tmp.set(...a.p).project(camera);
        const facing = -(a.n[0] * camDir.x + a.n[1] * camDir.y + a.n[2] * camDir.z);
        b.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2) * r.width}px, ${((1 - tmp.y) / 2) * r.height}px)`;
        b.style.opacity = facing > -0.1 ? "1" : "0.25";
      }
      renderer.render(scene, camera);
    };
    loop();
    requestAnimationFrame(() => setReady(true));

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.removeEventListener("start", stopAuto);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      car.dispose();
      [shadowGeo, discGeo, ringGeo].forEach((g) => g.dispose());
      [shadowMat, discMat, ringMat].forEach((m) => m.dispose());
      shadowTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      el.remove();
      api.current = null;
    };
  }, []);

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    api.current?.setAuto(next);
  };

  if (failed) return <div className="car3d-fallback">3D view isn&apos;t available on this device — use the panel list below.</div>;

  return (
    <div className="car3d">
      <div className="car3d-bar">
        <div className="car3d-models" role="radiogroup" aria-label="Body style">
          {(Object.keys(MODELS) as ModelKey[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={model === k} className={model === k ? "on" : ""} onClick={() => setModel(k)}>
              <span className="msr" style={{ fontSize: 17 }}>{MODEL_ICONS[k]}</span>
              {MODELS[k].label}
            </button>
          ))}
        </div>
        <div className="car3d-paints" role="radiogroup" aria-label="Paint colour">
          {PAINTS.map((p) => (
            <button
              key={p.hex}
              type="button"
              role="radio"
              aria-checked={paint === p.hex}
              aria-label={p.name}
              title={p.name}
              className={paint === p.hex ? "on" : ""}
              style={{ ["--sw" as string]: p.hex }}
              onClick={() => setPaint(p.hex)}
            />
          ))}
        </div>
      </div>

      <div ref={wrapRef} className={`car3d-stage ${ready ? "ready" : ""}`}>
        <div ref={canvasHost} className="car3d-canvas" aria-label="Interactive 3D vehicle. Drag to rotate, click a panel to log damage." role="img" />
        {ZONE_IDS.map((z) =>
          counts[z] ? (
            <span
              key={z}
              ref={(n) => {
                badgeRefs.current[z] = n;
              }}
              className="car3d-badge"
            >
              {counts[z]}
            </span>
          ) : null
        )}
        <div ref={tipRef} className="car3d-tip" />
        <div className="car3d-hint" data-hide={touched}>
          <span className="msr" style={{ fontSize: 16 }}>3d_rotation</span> Drag to rotate · click a panel
        </div>
        <div className="car3d-views" role="toolbar" aria-label="Camera views">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} type="button" title={`${v.label} view`} aria-label={`${v.label} view`} onClick={() => api.current?.fly(v)}>
              <span className="msr" style={{ fontSize: 16 }}>{v.icon}</span>
              <span className="lbl">{v.label}</span>
            </button>
          ))}
          <button type="button" className={auto ? "on" : ""} title="Auto-rotate" aria-pressed={auto} aria-label="Auto-rotate" onClick={toggleAuto}>
            <span className="msr" style={{ fontSize: 16 }}>360</span>
          </button>
        </div>
        {!ready && <div className="car3d-loading">Loading 3D view…</div>}
      </div>

      <div className="car3d-zones" role="group" aria-label="Vehicle panels">
        {CAR_ZONES.map((z) => (
          <button
            key={z.id}
            type="button"
            disabled={disabled}
            className={`${selected === z.id ? "sel" : ""} ${counts[z.id] ? "hit" : ""}`}
            onClick={() => {
              onPick(z.id);
              api.current?.fly(ZONE_VIEW[z.id]);
            }}
          >
            <span className="msr" style={{ fontSize: 15 }}>{z.icon}</span>
            {z.label}
            {counts[z.id] ? <b>{counts[z.id]}</b> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export const CAR3D_CSS = `
.ui .car3d{display:flex;flex-direction:column;gap:12px}
.ui .car3d-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.ui .car3d-models{display:inline-flex;gap:3px;padding:3px;border-radius:12px;background:var(--sunk);border:1px solid var(--line)}
.ui .car3d-models button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:9px;font-size:12.5px;font-weight:600;color:var(--mute);transition:all .2s}
.ui .car3d-models button:hover{color:var(--ink)}
.ui .car3d-models button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.2),inset 0 0 0 1px var(--line-strong)}
.ui .car3d-models button.on .msr{color:var(--em-ink)}
.ui .car3d-paints{display:inline-flex;gap:7px;align-items:center}
.ui .car3d-paints button{width:22px;height:22px;border-radius:999px;background:radial-gradient(circle at 30% 30%,color-mix(in srgb,var(--sw) 55%,#fff),var(--sw) 55%,color-mix(in srgb,var(--sw) 70%,#000));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 1px 3px rgba(0,0,0,.4);transition:transform .15s,box-shadow .15s}
.ui .car3d-paints button:hover{transform:scale(1.12)}
.ui .car3d-paints button.on{box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--em)}
.ui .car3d-stage{position:relative;height:clamp(300px,40vw,440px);border-radius:16px;overflow:hidden;
  background:radial-gradient(70% 60% at 50% 66%,color-mix(in srgb,var(--em) 12%,transparent),transparent 70%),
    radial-gradient(120% 90% at 50% -20%,color-mix(in srgb,#6366F1 10%,transparent),transparent 60%),#0B0F12;
  border:1px solid var(--line)}
.ui .car3d-stage::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.6;
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:28px 28px;
  -webkit-mask-image:radial-gradient(ellipse at 50% 70%,transparent 30%,#000 90%);mask-image:radial-gradient(ellipse at 50% 70%,transparent 30%,#000 90%)}
.ui .car3d-canvas{position:absolute;inset:0;z-index:1;opacity:0;transition:opacity .8s ease;touch-action:pan-y}
.ui .car3d-stage.ready .car3d-canvas{opacity:1}
.ui .car3d-loading{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:#8A939A}
.ui .car3d-badge{position:absolute;left:0;top:0;z-index:3;display:grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;
  background:var(--amber);color:#1a1205;font-size:11px;font-weight:800;pointer-events:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--amber) 30%,transparent),0 6px 14px -4px rgba(0,0,0,.5);transition:opacity .2s}
.ui .car3d-tip{position:absolute;left:0;top:0;z-index:4;pointer-events:none;opacity:0;white-space:nowrap;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;
  background:#EEF1F3;color:#0A0C0D;box-shadow:0 8px 20px -8px rgba(0,0,0,.5);transition:opacity .15s}
.ui .car3d-hint{position:absolute;left:12px;top:12px;z-index:3;display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:500;
  background:rgba(10,12,14,.7);border:1px solid rgba(255,255,255,.08);color:#9AA3AA;backdrop-filter:blur(8px);transition:opacity .4s,transform .4s;pointer-events:none}
.ui .car3d-hint[data-hide=true]{opacity:0;transform:translateY(-6px)}
.ui .car3d-views{position:absolute;right:10px;bottom:10px;z-index:3;display:flex;gap:3px;padding:4px;border-radius:12px;background:rgba(10,12,14,.72);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(10px)}
.ui .car3d-views button{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border-radius:8px;font-size:11.5px;font-weight:600;color:#9AA3AA;transition:background .15s,color .15s}
.ui .car3d-views button:hover{background:rgba(255,255,255,.08);color:#fff}
.ui .car3d-views button.on{background:var(--em);color:#04251A}
.ui .car3d-views .lbl{display:none}
@media (min-width:1280px){.ui .car3d-views .lbl{display:inline}}
.ui .car3d-zones{display:flex;flex-wrap:wrap;gap:6px}
.ui .car3d-zones button{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border-radius:9px;border:1px solid var(--line-strong);background:var(--surface);font-size:12px;font-weight:600;transition:all .15s}
.ui .car3d-zones button:hover:not(:disabled){border-color:var(--mute);background:var(--sunk)}
.ui .car3d-zones button.hit{border-color:color-mix(in srgb,var(--amber) 55%,transparent);background:var(--amber-soft);color:var(--amber-ink)}
.ui .car3d-zones button.sel{border-color:var(--info);box-shadow:0 0 0 2px color-mix(in srgb,var(--info) 30%,transparent)}
.ui .car3d-zones button b{display:grid;place-items:center;min-width:18px;height:18px;border-radius:999px;background:var(--amber);color:#1a1205;font-size:10px}
.ui .car3d-zones button:disabled{opacity:.5}
.ui .car3d-fallback{display:grid;place-items:center;height:200px;border-radius:16px;border:1px dashed var(--line-strong);font-size:13px;color:var(--mute)}
`;
