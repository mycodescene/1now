"use client";

/**
 * 1Now Fleet Ops — Return Inspection & Deposit Settlement
 * Operator workflow: readings → return time → condition → evidence → settle.
 * Carisma copilot runs live checks, scores dispute risk and drafts the renter message.
 */

import Car3D, { CAR3D_CSS } from "./Car3D";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

/* ────────────────────────────────────────────────────────────
   Booking & business rules (UK)
──────────────────────────────────────────────────────────── */
const BOOKING = "1N-48213";
const PLATE = "BD71 KLO";
const VEHICLE = "2023 Volkswagen Golf";
const VEHICLE_SUB = "1.5 TSI Life · 50 L tank";
const RENTER = "Liam Davies";
const RENTER_FIRST = "Liam";
const CARD = "Visa •••• 4417";
const TANK_L = 50;
const DEFAULT_PUMP = 1.45; // £/L UK average petrol
const ADMIN_FEE = 15;
const RATE_PER_MILE = 0.35;
const DEPOSIT = 300;
const CHECKIN_ODO = 42100;
const DAYS = 3;
const PER_DAY = 150;
const ALLOWANCE = DAYS * PER_DAY; // 450
const VAT_RATE = 0.2;
const CHECKOUT_AT = "2026-10-06T09:12";
const DUE_AT = "2026-10-09T09:12";
const GRACE_MIN = 59;
const LATE_HOURLY = 12;
const LATE_CAP = 55; // never more than one extra day
const MILE_TOLERANCE = 15;
const SMALL_CHARGE = 10;
const STORE_KEY = `1now:return-inspection:${BOOKING}`;

const CLEANING = {
  none: { icon: "sentiment_satisfied", label: "Clean", fee: 0, hint: "Ready to re-rent" },
  light: { icon: "cleaning_services", label: "Light valet", fee: 25, hint: "Crumbs, sand, marks" },
  heavy: { icon: "mop", label: "Heavy valet", fee: 80, hint: "Stains, mud, soiling" },
  smoke: { icon: "smoking_rooms", label: "Smoke / pets", fee: 150, hint: "Odour or pet hair" },
} as const;
type CleanKey = keyof typeof CLEANING;

const ITEMS = {
  keys: { icon: "key", label: "Both key fobs", fee: 220 },
  nut: { icon: "tire_repair", label: "Locking wheel nut key", fee: 30 },
  shelf: { icon: "shelves", label: "Parcel shelf", fee: 60 },
} as const;
type ItemKey = keyof typeof ITEMS;

const DAMAGE_TYPES = {
  scratch: { icon: "draw", label: "Scratch / scuff", cost: 60 },
  dent: { icon: "compress", label: "Dent", cost: 150 },
  chip: { icon: "grain", label: "Stone chip", cost: 75 },
  alloy: { icon: "trip_origin", label: "Kerbed alloy", cost: 85 },
  crack: { icon: "broken_image", label: "Crack / break", cost: 250 },
} as const;
type DamageType = keyof typeof DAMAGE_TYPES;

/* Vehicle panels (see Car3D.tsx for the 3D model). Nearside = UK passenger side. */
const ZONES = [
  { id: "rear", label: "Rear bumper", x: 22, y: 32, w: 20, h: 106 },
  { id: "boot", label: "Boot / rear glass", x: 44, y: 32, w: 56, h: 106 },
  { id: "roof", label: "Roof", x: 102, y: 36, w: 96, h: 98 },
  { id: "glass", label: "Windscreen", x: 200, y: 36, w: 28, h: 98 },
  { id: "bonnet", label: "Bonnet", x: 230, y: 32, w: 46, h: 106 },
  { id: "front", label: "Front bumper", x: 278, y: 32, w: 20, h: 106 },
  { id: "left", label: "Nearside (left)", x: 50, y: 16, w: 220, h: 13 },
  { id: "right", label: "Offside (right)", x: 50, y: 141, w: 220, h: 13 },
] as const;
type ZoneId = (typeof ZONES)[number]["id"] | "wheels";
const ZONE_LABEL: Record<ZoneId, string> = {
  ...(Object.fromEntries(ZONES.map((z) => [z.id, z.label])) as Record<(typeof ZONES)[number]["id"], string>),
  wheels: "Wheels / tyres",
};

type Damage = { id: string; zone: ZoneId; type: DamageType; cost: number; note: string };
type LogEntry = { t: string; m: string };
type Slot = "dash" | "ext" | "int";
type Photo = { id: string; url: string; name: string };
type Draft = {
  eighths: number;
  odo: number | null;
  pumpPrice: number;
  waive: boolean;
  returnedAt: string;
  cleaning: CleanKey | null;
  noDamage: boolean;
  damages: Damage[];
  items: Record<ItemKey, boolean>;
  goodwill: number;
  goodwillReason: string;
  notes: string;
  settled: boolean;
  meta: { no: string; date: string; link: string };
  log: LogEntry[];
};

const DEFAULT_DRAFT: Draft = {
  eighths: 3,
  odo: 42620,
  pumpPrice: DEFAULT_PUMP,
  waive: false,
  returnedAt: "2026-10-09T09:40",
  cleaning: null,
  noDamage: false,
  damages: [],
  items: { keys: true, nut: true, shelf: true },
  goodwill: 0,
  goodwillReason: "",
  notes: "",
  settled: false,
  meta: { no: "", date: "", link: "" },
  log: [],
};

const GOODWILL_REASONS = ["Within tolerance", "First-time renter", "Service recovery", "Operator discretion"];

/* ────────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────────── */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const money = (n: number) => gbp.format(r2(n));
const fmt = (n: number) => n.toLocaleString("en-GB");
const trimNum = (n: number) => Number(n.toFixed(2)).toString();
const uid = () => Math.random().toString(36).slice(2, 9);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse "YYYY-MM-DDTHH:MM" as wall-clock minutes (timezone-free, SSR-safe). */
function wallMinutes(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}
function fmtWall(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return "—";
  return `${m[3]} ${MONTHS[+m[2] - 1]} · ${m[4]}:${m[5]}`;
}
function toWall(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const hhmm = (d = new Date()) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

type Line = { k: string; name: string; sub: string; amt: number; icon: string };

function compute(d: Draft) {
  const driven = d.odo == null ? 0 : Math.max(0, d.odo - CHECKIN_ODO);
  const missing = 8 - d.eighths;
  const litres = (missing / 8) * TANK_L;
  const fuel = r2(litres * d.pumpPrice);
  const feeApplies = missing > 0;
  const fee = feeApplies && !d.waive ? ADMIN_FEE : 0;
  const excess = Math.max(0, driven - ALLOWANCE);
  const mileage = r2(excess * RATE_PER_MILE);

  const ret = wallMinutes(d.returnedAt);
  const due = wallMinutes(DUE_AT)!;
  const lateMin = ret == null ? 0 : Math.max(0, ret - due);
  const lateHours = lateMin > GRACE_MIN ? Math.ceil(lateMin / 60) : 0;
  const late = r2(Math.min(lateHours * LATE_HOURLY, LATE_CAP));

  const cleaning = d.cleaning ? CLEANING[d.cleaning].fee : 0;
  const damage = r2(d.damages.reduce((a, x) => a + (Number.isFinite(x.cost) ? x.cost : 0), 0));
  const missingItems = (Object.keys(ITEMS) as ItemKey[]).filter((k) => !d.items[k]);
  const items = missingItems.reduce((a, k) => a + ITEMS[k].fee, 0);

  const charges = r2(fuel + fee + mileage + late + cleaning + damage + items);
  const goodwill = r2(Math.min(Math.max(0, d.goodwill || 0), charges));
  const total = r2(charges - goodwill);
  const retained = r2(Math.min(DEPOSIT, total));
  const release = r2(Math.max(0, DEPOSIT - total));
  const balance = r2(Math.max(0, total - DEPOSIT));

  const lines: Line[] = [];
  if (fuel > 0)
    lines.push({ k: "fuel", icon: "local_gas_station", name: "Fuel shortfall", sub: `${missing}/8 × ${TANK_L} L = ${trimNum(litres)} L × ${money(d.pumpPrice)}/L`, amt: fuel });
  if (feeApplies)
    lines.push({ k: "fee", icon: "receipt_long", name: "Refuelling admin fee", sub: d.waive ? "Waived by operator" : "Flat fee when tank returns below full", amt: fee });
  if (mileage > 0)
    lines.push({ k: "mi", icon: "speed", name: "Excess mileage", sub: `${fmt(driven)} − ${ALLOWANCE} allowed = ${excess} mi × ${money(RATE_PER_MILE)}`, amt: mileage });
  if (late > 0)
    lines.push({ k: "late", icon: "schedule", name: "Late return", sub: `${fmtDuration(lateMin)} late → ${lateHours} h × ${money(LATE_HOURLY)} (cap ${money(LATE_CAP)})`, amt: late });
  if (cleaning > 0 && d.cleaning)
    lines.push({ k: "clean", icon: "cleaning_services", name: `Cleaning · ${CLEANING[d.cleaning].label}`, sub: CLEANING[d.cleaning].hint, amt: cleaning });
  d.damages.forEach((x) =>
    lines.push({ k: `dmg-${x.id}`, icon: "car_repair", name: `Damage · ${ZONE_LABEL[x.zone]}`, sub: `${DAMAGE_TYPES[x.type].label}${x.note ? ` — ${x.note}` : ""}`, amt: r2(x.cost || 0) })
  );
  missingItems.forEach((k) => lines.push({ k: `item-${k}`, icon: "key", name: `Not returned · ${ITEMS[k].label}`, sub: "Replacement cost", amt: ITEMS[k].fee }));

  return { driven, missing, litres, fuel, feeApplies, fee, excess, mileage, lateMin, lateHours, late, cleaning, damage, items, missingItems, charges, goodwill, total, retained, release, balance, lines };
}

/* ────────────────────────────────────────────────────────────
   Small building blocks
──────────────────────────────────────────────────────────── */
function useTween(target: number, duration = 480) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      const id = requestAnimationFrame(() => setV(target));
      return () => cancelAnimationFrame(id);
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const cur = a + (target - a) * (1 - Math.pow(1 - p, 3));
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

/** Google Material Symbols (Rounded), loaded from Google Fonts in layout.tsx */
function Icon({ name, size = 18, fill = false, weight = 450, className = "", style }: { name: string; size?: number; fill?: boolean; weight?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={`msr ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${Math.max(20, Math.min(48, size))}`, ...style }}
    >
      {name}
    </span>
  );
}

function Money({ value, className = "" }: { value: number; className?: string }) {
  const v = useTween(value);
  return <span className={`tabular-nums ${className}`}>{money(v)}</span>;
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="sw" data-on={checked}>
        <span />
      </span>
      <span className="text-xs font-medium c-mute">{label}</span>
    </button>
  );
}

function Plate() {
  return (
    <div className="plate" aria-label={`UK number plate ${PLATE}`}>
      <span className="plate-gb">
        <span className="text-[7px]">★</span>GB
      </span>
      <span className="plate-txt">{PLATE}</span>
    </div>
  );
}

function Pill({ tone, children }: { tone: "em" | "amber" | "mute"; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function Section({ id, n, icon, title, sub, done, right, children }: { id: string; n: number; icon: string; title: string; sub: string; done: boolean; right?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="rise scroll-mt-20" style={{ ["--i" as string]: n }}>
      <div className="sec-hd">
        <span className={`sec-n ${done ? "done" : ""}`} aria-label={done ? `Step ${n} complete` : `Step ${n}`}>
          {done ? <Icon name="check" weight={700} size={15} /> : String(n).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[18px] font-semibold leading-tight tracking-tight"><Icon name={icon} size={20} className="sec-ico" />{title}</h2>
          <p className="mt-0.5 text-[13px] c-mute">{sub}</p>
        </div>
        {right && <div className="sec-right shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/* Dashboard cluster illustration — doubles as the "photo" and a live preview */
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  // round so server (Node) and browser floats match exactly — avoids hydration mismatch
  return [Math.round((cx + r * Math.sin(a)) * 100) / 100, Math.round((cy - r * Math.cos(a)) * 100) / 100] as const;
}

function Cluster({ fuel, odo, label, badge }: { fuel: number; odo: number | null; label: string; badge: ReactNode }) {
  const cx = 236, cy = 104, R = 52, A0 = -60, A1 = 60;
  const ang = A0 + (fuel / 8) * (A1 - A0);
  const [sx, sy] = polar(cx, cy, R, A0);
  const [ex, ey] = polar(cx, cy, R, A1);
  const [px, py] = polar(cx, cy, R, ang);
  const ticks = Array.from({ length: 9 }, (_, i) => {
    const deg = A0 + (i * (A1 - A0)) / 8;
    const major = i % 4 === 0;
    const [x1, y1] = polar(cx, cy, R - 5, deg);
    const [x2, y2] = polar(cx, cy, R + (major ? 9 : 5), deg);
    return { x1, y1, x2, y2, major };
  });
  const speedTicks = Array.from({ length: 28 }, (_, i) => {
    const deg = -135 + (i * 270) / 27;
    const major = i % 3 === 0;
    const [x1, y1] = polar(84, 88, major ? 40 : 44, deg);
    const [x2, y2] = polar(84, 88, 50, deg);
    return { x1, y1, x2, y2, major };
  });
  const [nx, ny] = polar(84, 88, 38, -135);
  const low = fuel <= 2;
  const odoText = odo == null ? "------" : String(Math.max(0, odo)).padStart(6, "0").slice(-6);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <svg viewBox="0 0 320 176" role="img" aria-label={label} className="block h-auto w-full">
        <rect width="320" height="176" rx="14" fill="#090B0D" />
        <rect x="0.5" y="0.5" width="319" height="175" rx="13.5" fill="none" stroke="#242B31" />
        <circle cx="84" cy="88" r="54" fill="#0E1215" stroke="#222A30" strokeWidth="2" />
        {speedTicks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.major ? "#C9D1D7" : "#4A545C"} strokeWidth={t.major ? 1.8 : 1} />
        ))}
        <line x1="84" y1="88" x2={nx} y2={ny} stroke="#FF6A3D" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="84" cy="88" r="5" fill="#161B1F" stroke="#39434B" />
        <text x="84" y="122" textAnchor="middle" fontSize="8" fill="#6C7780" fontFamily="monospace" letterSpacing="1.5">MPH</text>

        <path d={`M${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}`} fill="none" stroke="#2A3238" strokeWidth="5" strokeLinecap="round" />
        {fuel > 0 && (
          <path d={`M${sx} ${sy} A ${R} ${R} 0 0 1 ${px} ${py}`} fill="none" stroke={fuel === 8 ? "#34D399" : "#F59E0B"} strokeWidth="5" strokeLinecap="round" />
        )}
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.major ? "#C9D1D7" : "#5A656E"} strokeWidth={t.major ? 1.8 : 1} />
        ))}
        <text x={sx - 14} y={sy + 4} fontSize="10" fill="#9AA5AE" fontFamily="monospace" fontWeight="700">E</text>
        <text x={ex + 7} y={ey + 4} fontSize="10" fill="#9AA5AE" fontFamily="monospace" fontWeight="700">F</text>
        <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "transform .7s cubic-bezier(.3,1.3,.5,1)" }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - R + 7} stroke="#FF6A3D" strokeWidth="2.6" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="5.5" fill="#161B1F" stroke="#39434B" />
        <g opacity={low ? 1 : 0.15} style={{ transition: "opacity .3s" }}>
          <circle cx={cx - 10} cy={cy + 22} r="3.2" fill="#F59E0B" />
          <text x={cx - 3} y={cy + 25} fontSize="8" fill="#F59E0B" fontFamily="monospace">LOW</text>
        </g>

        <rect x="96" y="140" width="128" height="26" rx="5" fill="#0D1114" stroke="#222A30" />
        <text x="152" y="158" textAnchor="middle" fontSize="14" fill="#A7F3D0" fontFamily="monospace" letterSpacing="2.5">{odoText}</text>
        <text x="212" y="157" textAnchor="middle" fontSize="7" fill="#6C7780" fontFamily="monospace">MI</text>
      </svg>
      <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 font-mono text-[10px] text-white/90 backdrop-blur">
        {badge}
      </span>
    </div>
  );
}

function FuelPicker({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const full = value === 8;
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: value + 1, ArrowUp: value + 1, ArrowLeft: value - 1, ArrowDown: value - 1, Home: 0, End: 8 };
    if (e.key in map) {
      e.preventDefault();
      const v = Math.max(0, Math.min(8, map[e.key]));
      onChange(v);
      refs.current[v]?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label="Fuel level at return, in eighths" onKeyDown={onKey} className="fuelpick">
      {Array.from({ length: 9 }, (_, i) => {
        const filled = i > 0 && i <= value;
        const selected = i === value;
        return (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={i === 0 ? "Empty" : i === 8 ? "Full" : `${i} eighths`}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(i)}
            className={`seg ${i === 0 ? "seg-e" : ""} ${selected ? "sel" : ""}`}
            data-fill={filled ? (full ? "em" : "amber") : undefined}
          >
            <span className="seg-fill" />
            <span className="seg-lbl">{i === 0 ? "E" : i === 8 ? "F" : i}</span>
          </button>
        );
      })}
    </div>
  );
}

function MileageBar({ driven, excess }: { driven: number; excess: number }) {
  const scale = Math.max(ALLOWANCE * 1.35, driven * 1.1);
  const within = Math.min(driven, ALLOWANCE) / scale;
  const over = excess / scale;
  const mark = ALLOWANCE / scale;
  return (
    <div className="pt-6">
      <div className="relative h-2 rounded-full bg-sunk">
        <div className="absolute left-0 top-0 h-full" style={{ width: `${within * 100}%`, background: "var(--em)", borderRadius: over > 0 ? "9999px 0 0 9999px" : "9999px", transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
        <div className="absolute top-0 h-full rounded-r-full" style={{ left: `${within * 100}%`, width: `${over * 100}%`, background: "var(--amber)", transition: "width .6s cubic-bezier(.2,.8,.2,1), left .6s" }} />
        <div className="absolute -top-1.5 h-5 w-px" style={{ left: `${mark * 100}%`, background: "var(--ink)" }} />
        <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider c-mute" style={{ left: `${mark * 100}%` }}>
          {ALLOWANCE} mi allowance
        </span>
      </div>
    </div>
  );
}

function Timeline({ returnedAt }: { returnedAt: string }) {
  const due = wallMinutes(DUE_AT)!;
  const ret = wallMinutes(returnedAt);
  const start = due - 180;
  const span = 480;
  const pos = (m: number) => Math.max(0, Math.min(100, ((m - start) / span) * 100));
  const graceEnd = due + GRACE_MIN;
  const early = ret != null && ret < start;
  const beyond = ret != null && ret > start + span;
  return (
    <div className="tl mt-9" aria-label="Return timeline">
      <div className="tl-track">
        <div className="tl-zone" style={{ left: 0, width: `${pos(due)}%`, background: "var(--em-soft)" }} />
        <div className="tl-zone tl-grace" style={{ left: `${pos(due)}%`, width: `${pos(graceEnd) - pos(due)}%` }} />
        <div className="tl-zone" style={{ left: `${pos(graceEnd)}%`, right: 0, background: "var(--amber-soft)" }} />
        {[1, 2, 3, 4].map((h) => (
          <span key={h} className="tl-tick" style={{ left: `${pos(due + h * 60)}%` }}>
            <span>+{h}h<b>{money(Math.min(h * LATE_HOURLY, LATE_CAP))}</b></span>
          </span>
        ))}
        <span className="tl-hire">← On hire since {fmtWall(CHECKOUT_AT)}</span>
        <span className="tl-due" style={{ left: `${pos(due)}%` }}>
          <span>Due {DUE_AT.slice(11)}</span>
        </span>
        {ret != null && (
          <span className="tl-pin" style={{ left: `${pos(ret)}%` }} data-late={ret > graceEnd}>
            <span>
              {early ? "← " : ""}Returned {returnedAt.slice(11, 16)}
              {beyond ? " →" : ""}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Page
──────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────
   Preloader — tachometer "engine start" sweep, then slides up
──────────────────────────────────────────────────────────── */
const PL = { cx: 120, cy: 120, r: 92, a0: -125, a1: 125 };
function plArc(a0: number, a1: number, r = PL.r) {
  const [x0, y0] = polar(PL.cx, PL.cy, r, a0);
  const [x1, y1] = polar(PL.cx, PL.cy, r, a1);
  return `M${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}
const PL_TICKS = Array.from({ length: 41 }, (_, i) => {
  const deg = PL.a0 + (i * (PL.a1 - PL.a0)) / 40;
  const major = i % 5 === 0;
  const [x1, y1] = polar(PL.cx, PL.cy, PL.r - 12, deg);
  const [x2, y2] = polar(PL.cx, PL.cy, PL.r - (major ? 24 : 18), deg);
  const [lx, ly] = polar(PL.cx, PL.cy, PL.r - 40, deg);
  return { x1, y1, x2, y2, major, lx, ly, n: i / 5 };
});

function Preloader({ exiting }: { exiting: boolean }) {
  const [odo, setOdo] = useState(0);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const target = DEFAULT_DRAFT.odo ?? 0;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      setOn(true);
      const p = Math.max(0, Math.min(1, (t - t0 - 250) / 1750));
      setOdo(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className={`pl ${on ? "on" : ""} ${exiting ? "pl-exit" : ""}`} role="status" aria-label="Loading return inspection">
      <div className="pl-inner">
        <div className="pl-brand">
          <span className="pl-logo">1</span>1Now <span>Fleet Ops</span>
        </div>
        <svg viewBox="0 0 240 196" className="pl-gauge" aria-hidden="true">
          <defs>
            <linearGradient id="pl-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#059669" />
              <stop offset=".65" stopColor="#34D399" />
              <stop offset="1" stopColor="#FBBF24" />
            </linearGradient>
          </defs>
          <path d={plArc(PL.a0, PL.a1)} className="pl-track" />
          <path d={plArc(93.75, PL.a1)} className="pl-red" />
          <path d={plArc(PL.a0, PL.a1)} pathLength={100} className="pl-arc" stroke="url(#pl-grad)" />
          {PL_TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={`pl-tick ${t.major ? "major" : ""} ${t.n >= 7 ? "red" : ""}`} />
          ))}
          {PL_TICKS.filter((t) => t.major).map((t) => (
            <text key={t.n} x={t.lx} y={t.ly + 4} className="pl-num">
              {t.n}
            </text>
          ))}
          <text x={PL.cx} y={PL.cy + 44} className="pl-unit">×1000 r/min</text>
          <g className="pl-needle">
            <line x1={PL.cx} y1={PL.cy + 14} x2={PL.cx} y2={PL.cy - PL.r + 16} />
          </g>
          <circle cx={PL.cx} cy={PL.cy} r="9" className="pl-hub" />
          <circle cx={PL.cx} cy={PL.cy} r="3" fill="#FF6A3D" />
        </svg>
        <div className="pl-odo" aria-hidden="true">
          {String(odo).padStart(6, "0").split("").map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          <em>mi</em>
        </div>
        <p className="pl-sub">Preparing inspection · {PLATE}</p>
        <div className="pl-bar">
          <i />
        </div>
      </div>
    </div>
  );
}

type Tone = "ok" | "warn" | "info";
type CopilotCheck = { id: string; tone: Tone; title: string; detail: string; action?: { label: string; run?: () => void; photo?: Slot; note?: boolean } };

export default function Page() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [d, setD] = useState<Draft>(DEFAULT_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [boot, setBoot] = useState<"run" | "exit" | "done">("run");

  /* ── preloader: sweep the gauge, then slide the curtain up slowly ── */
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setBoot("exit"), reduce ? 250 : 2450);
    const t2 = setTimeout(() => setBoot("done"), reduce ? 600 : 3800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  useEffect(() => {
    document.documentElement.style.overflow = boot === "run" ? "hidden" : "";
  }, [boot]);
  const [photos, setPhotos] = useState<Record<Slot, Photo[]>>({ dash: [], ext: [], int: [] });
  const [zone, setZone] = useState<ZoneId | null>(null);
  const [dmgType, setDmgType] = useState<DamageType>("scratch");
  const [dmgCost, setDmgCost] = useState<string>(String(DAMAGE_TYPES.scratch.cost));
  const [dmgNote, setDmgNote] = useState("");
  const [gwOpen, setGwOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [msgCopied, setMsgCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [toastOn, setToastOn] = useState(false);

  const fileRefs = useRef<Record<Slot, HTMLInputElement | null>>({ dash: null, ext: null, int: null });
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── draft persistence: an inspection survives a refresh or a dropped tablet ── */
  useEffect(() => {
    let restored: Draft | null = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Draft>;
        restored = { ...DEFAULT_DRAFT, ...p, items: { ...DEFAULT_DRAFT.items, ...(p.items ?? {}) }, meta: { ...DEFAULT_DRAFT.meta, ...(p.meta ?? {}) } };
      }
    } catch {
      /* storage unavailable — start fresh */
    }
    const id = requestAnimationFrame(() => {
      if (restored) setD(restored);
      setHydrated(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(d));
        setSavedAt(hhmm());
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [d, hydrated]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastOn(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 2400);
  }, []);

  const up = useCallback((patch: Partial<Draft>, logMsg?: string) => {
    setD((s) => ({ ...s, ...patch, log: logMsg ? [{ t: hhmm(), m: logMsg }, ...s.log].slice(0, 40) : s.log }));
  }, []);

  /* ── derived ── */
  const c = useMemo(() => compute(d), [d]);
  const locked = d.settled;
  const odoValid = d.odo !== null && d.odo >= CHECKIN_ODO;
  const retMin = wallMinutes(d.returnedAt);
  const returnValid = retMin !== null && retMin > wallMinutes(CHECKOUT_AT)!;
  const exteriorDone = d.noDamage || d.damages.length > 0;
  const conditionDone = exteriorDone && d.cleaning !== null;
  const reasonMissing = c.goodwill > 0 && !d.goodwillReason;
  const needs: Record<Slot, boolean> = { dash: c.fuel > 0 || c.mileage > 0, ext: d.damages.length > 0, int: c.cleaning > 0 };
  const missingEvidence = (Object.keys(needs) as Slot[]).filter((k) => needs[k] && photos[k].length === 0);
  const evidenceDone = missingEvidence.length === 0;

  const blockers: { msg: string; href: string }[] = [];
  if (!odoValid) blockers.push({ msg: "Enter a valid return odometer", href: "#sec-readings" });
  if (!returnValid) blockers.push({ msg: "Set the return date & time", href: "#sec-time" });
  if (!exteriorDone) blockers.push({ msg: "Confirm exterior — no new damage, or log it", href: "#sec-condition" });
  if (d.cleaning === null) blockers.push({ msg: "Choose the interior condition", href: "#sec-condition" });
  if (reasonMissing) blockers.push({ msg: "Pick a reason for the goodwill credit", href: "#sec-decision" });
  const canApprove = blockers.length === 0 && !locked;

  const steps = [
    { id: "sec-readings", label: "Readings", done: odoValid },
    { id: "sec-time", label: "Return time", done: returnValid },
    { id: "sec-condition", label: "Condition", done: conditionDone },
    { id: "sec-evidence", label: "Evidence", done: evidenceDone },
    { id: "sec-decision", label: "Settle", done: d.settled },
  ];
  const stepsDone = steps.filter((s) => s.done).length;

  /* ── actions ── */
  const setFuel = (n: number) => !locked && up({ eighths: Math.max(0, Math.min(8, n)) });
  const bumpOdo = (delta: number) => !locked && up({ odo: Math.min(999999, Math.max(0, (d.odo ?? CHECKIN_ODO) + delta)) });

  const addDamage = () => {
    if (!zone || locked) return;
    const cost = Math.max(0, Number(dmgCost) || 0);
    const item: Damage = { id: uid(), zone, type: dmgType, cost, note: dmgNote.trim() };
    setD((s) => ({
      ...s,
      noDamage: false,
      damages: [...s.damages, item],
      log: [{ t: hhmm(), m: `Damage logged — ${ZONE_LABEL[zone]}, ${DAMAGE_TYPES[dmgType].label} (${money(cost)})` }, ...s.log],
    }));
    setDmgNote("");
    showToast(`${DAMAGE_TYPES[dmgType].label} added on ${ZONE_LABEL[zone].toLowerCase()}`);
  };
  const removeDamage = (id: string) => {
    if (locked) return;
    setD((s) => {
      const x = s.damages.find((y) => y.id === id);
      return { ...s, damages: s.damages.filter((y) => y.id !== id), log: x ? [{ t: hhmm(), m: `Damage removed — ${ZONE_LABEL[x.zone]}` }, ...s.log] : s.log };
    });
  };

  const addPhotos = (slot: Slot, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).map((f) => ({ id: uid(), url: URL.createObjectURL(f), name: f.name }));
    setPhotos((p) => ({ ...p, [slot]: [...p[slot], ...list] }));
    up({}, `${list.length} photo${list.length > 1 ? "s" : ""} added — ${SLOT_META[slot].label}`);
  };
  const removePhoto = (slot: Slot, id: string) => {
    setPhotos((p) => {
      const ph = p[slot].find((x) => x.id === id);
      if (ph) URL.revokeObjectURL(ph.url);
      return { ...p, [slot]: p[slot].filter((x) => x.id !== id) };
    });
  };

  const approve = () => {
    if (locked) return;
    if (!canApprove) {
      showToast(blockers[0]?.msg ?? "Complete the inspection first");
      document.querySelector(blockers[0]?.href ?? "#sec-readings")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const now = new Date();
    const no = `INV-1N-${String(now.getTime()).slice(-6)}`;
    setD((s) => ({
      ...s,
      settled: true,
      meta: { no, date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), link: `https://receipts.1now.example/r/${no.toLowerCase()}` },
      log: [{ t: hhmm(now), m: `Settled — ${money(c.retained)} retained, ${money(c.release)} released${c.balance > 0 ? `, ${money(c.balance)} invoiced` : ""}` }, ...s.log],
    }));
    setZone(null);
    setGwOpen(false);
    setTimeout(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
  };

  const undo = () => {
    up({ settled: false }, "Settlement reopened for editing");
    showToast("Settlement reopened for editing");
  };

  const reset = () => {
    photos.dash.concat(photos.ext, photos.int).forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos({ dash: [], ext: [], int: [] });
    setD({ ...DEFAULT_DRAFT, log: [{ t: hhmm(), m: "Inspection reset to defaults" }] });
    setZone(null);
    setGwOpen(false);
    showToast("Inspection reset");
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        approve();
        return;
      }
      if (e.key === "Escape") {
        setHelp(false);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") setHelp((h) => !h);
      else if (/^[0-8]$/.test(e.key) && !locked) up({ eighths: Number(e.key) });
      else if (e.key === "]" && !locked) bumpOdo(10);
      else if (e.key === "[" && !locked) bumpOdo(-10);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── Carisma copilot: live checks, dispute risk, suggested actions ── */
  const pickPhoto = (slot: Slot) => fileRefs.current[slot]?.click();
  const focusNotes = () => notesRef.current?.focus();

  const checks: CopilotCheck[] = (() => {
    const out: CopilotCheck[] = [];
    if (d.odo === null) out.push({ id: "odo", tone: "warn", title: "Return odometer missing", detail: "Read it off the dashboard and type it in." });
    else if (d.odo < CHECKIN_ODO) out.push({ id: "odo", tone: "warn", title: "Reading is below check-in", detail: `Check-in was ${fmt(CHECKIN_ODO)} mi. Odometers don't run backwards — re-read the dash.` });
    else {
      const perDay = c.driven / DAYS;
      const candidate = Math.floor(d.odo / 10);
      if (perDay > 600) {
        out.push({
          id: "odo",
          tone: "warn",
          title: "Odometer looks like a typo",
          detail: `${fmt(c.driven)} mi in ${DAYS} days is ~${fmt(Math.round(perDay))} mi/day — very unlikely.`,
          action: candidate >= CHECKIN_ODO ? { label: `Use ${fmt(candidate)}`, run: () => up({ odo: candidate }, `Odometer corrected ${fmt(d.odo!)} → ${fmt(candidate)} (Carisma)`) } : undefined,
        });
      } else out.push({ id: "odo", tone: "ok", title: "Mileage is plausible", detail: `${fmt(c.driven)} mi over ${DAYS} days · ~${fmt(Math.round(perDay))} mi/day.` });
    }

    if (c.excess > 0 && c.excess <= MILE_TOLERANCE && c.goodwill === 0)
      out.push({
        id: "tol",
        tone: "info",
        title: `Only ${c.excess} mi over the allowance`,
        detail: `Inside the usual ${MILE_TOLERANCE}-mile tolerance. Crediting it back heads off a small dispute.`,
        action: { label: `Credit ${money(c.mileage)}`, run: () => up({ goodwill: c.mileage, goodwillReason: "Within tolerance" }, `Goodwill ${money(c.mileage)} — mileage tolerance (Carisma)`) },
      });

    if (returnValid) {
      if (c.lateMin === 0) out.push({ id: "late", tone: "ok", title: "Returned on time", detail: `Due ${fmtWall(DUE_AT)}.` });
      else if (c.late === 0) out.push({ id: "late", tone: "ok", title: `${fmtDuration(c.lateMin)} late — inside grace`, detail: `No charge within the ${GRACE_MIN}-minute grace period.` });
      else out.push({ id: "late", tone: "info", title: `Late by ${fmtDuration(c.lateMin)}`, detail: `${c.lateHours} h charged at ${money(LATE_HOURLY)}/h, capped at ${money(LATE_CAP)}.` });
    }

    const evidenceCopy: Record<Slot, [string, string]> = {
      dash: ["Add a dashboard photo", "Fuel and mileage charges without a dashboard photo are the most-disputed charge type."],
      ext: ["Photograph the damage", "Card issuers side with renters when damage charges have no photo."],
      int: ["Photograph the interior", "A valet charge needs a photo to stand up to a chargeback."],
    };
    missingEvidence.forEach((slot) =>
      out.push({ id: `ev-${slot}`, tone: "warn", title: evidenceCopy[slot][0], detail: evidenceCopy[slot][1], action: locked ? undefined : { label: "Add photo", photo: slot } })
    );
    if (missingEvidence.length === 0 && (needs.dash || needs.ext || needs.int))
      out.push({ id: "ev", tone: "ok", title: "Evidence covers every charge", detail: "Photos are attached for each charged category." });

    if (d.damages.length > 0 && !d.notes.trim())
      out.push({ id: "note", tone: "info", title: "Add a short damage note", detail: "One line on how it was found helps if the renter disputes it.", action: { label: "Write note", note: true } });

    c.missingItems.forEach((k) =>
      out.push({
        id: `item-${k}`,
        tone: "info",
        title: `${ITEMS[k].label} not returned`,
        detail: `Call ${RENTER_FIRST} before charging ${money(ITEMS[k].fee)} — missing items usually turn up within a day.`,
        action: locked ? undefined : { label: "Found it", run: () => up({ items: { ...d.items, [k]: true } }, `${ITEMS[k].label} marked returned`) },
      })
    );

    if (c.total > 0 && c.total < SMALL_CHARGE && c.goodwill === 0)
      out.push({
        id: "small",
        tone: "info",
        title: `Charge is only ${money(c.total)}`,
        detail: "Deductions this small often cost more in support time than they recover.",
        action: locked ? undefined : { label: "Waive it", run: () => up({ goodwill: c.charges, goodwillReason: "Operator discretion" }, `Small charge waived ${money(c.charges)} (Carisma)`) },
      });

    if (c.balance > 0) out.push({ id: "bal", tone: "warn", title: `Charges exceed the deposit by ${money(c.balance)}`, detail: `The full deposit is kept and ${RENTER_FIRST} receives a payment link for the balance.` });
    if (reasonMissing) out.push({ id: "gw", tone: "warn", title: "Goodwill credit needs a reason", detail: "Reasons keep the audit trail clean for finance." });

    const rank: Record<Tone, number> = { warn: 0, info: 1, ok: 2 };
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
  })();

  const risk = (() => {
    if (c.total === 0) return { level: 0, label: "None", note: "Nothing to dispute — full release." };
    let pts = 0;
    if (needs.dash && photos.dash.length === 0) pts += (c.fuel > 0 ? 3 : 0) + (c.mileage > 0 ? 2 : 0);
    if (needs.ext && photos.ext.length === 0) pts += 4;
    if (needs.int && photos.int.length === 0) pts += 3;
    if (d.damages.length > 0 && !d.notes.trim()) pts += 1;
    if (c.balance > 0) pts += 1;
    if (pts === 0) return { level: 1, label: "Low", note: "Every charge is backed by evidence." };
    if (pts <= 3) return { level: 2, label: "Medium", note: "Add the suggested photos to bring this down." };
    return { level: 3, label: "High", note: "Likely to be challenged — attach evidence before approving." };
  })();

  const recommendation =
    c.total === 0
      ? `Release the full ${money(DEPOSIT)} deposit.`
      : c.balance > 0
      ? `Keep the full ${money(DEPOSIT)} deposit and request ${money(c.balance)} from ${RENTER_FIRST}.`
      : `Retain ${money(c.total)} and release ${money(c.release)} to ${RENTER_FIRST}.`;

  /* ── renter message ── */
  const message = (() => {
    const L: string[] = [`Hi ${RENTER_FIRST},`, "", `Thanks for returning the ${VEHICLE.replace(/^\d+ /, "")} (${PLATE}). We've completed the return inspection.`, ""];
    if (c.total === 0) {
      L.push(`Everything checked out, so your full ${money(DEPOSIT)} deposit has been released. Refunds usually reach your card in 3–5 working days.`);
    } else {
      L.push("Here's what we found:");
      c.lines.filter((l) => l.amt > 0).forEach((l) => L.push(`• ${l.name}: ${money(l.amt)}`));
      if (c.goodwill > 0) L.push(`• Goodwill credit: −${money(c.goodwill)}`);
      L.push("", `Total: ${money(c.total)} (incl. VAT)`, "");
      if (c.balance > 0) L.push(`Your ${money(DEPOSIT)} deposit covers part of this. We'll send a secure payment link for the remaining ${money(c.balance)}.`);
      else L.push(`We've kept ${money(c.retained)} from your ${money(DEPOSIT)} deposit and released ${money(c.release)}. Refunds usually reach your card in 3–5 working days.`);
      L.push("Photos from the inspection are available on request.");
    }
    L.push("", d.settled && d.meta.link ? `Your VAT invoice: ${d.meta.link}` : "Your VAT invoice will follow shortly.", "", "Any questions, just reply to this message.", "— 1Now Fleet Ops");
    return L.join("\n");
  })();

  const net = r2(c.total / (1 + VAT_RATE));
  const vat = r2(c.total - net);
  const zoneCounts: Record<string, number> = {};
  d.damages.forEach((x) => {
    zoneCounts[x.zone] = (zoneCounts[x.zone] ?? 0) + 1;
  });

  const ctaLabel = !canApprove
    ? blockers[0]?.msg ?? "Complete the inspection"
    : c.total === 0
    ? `Release full ${money(DEPOSIT)} deposit`
    : c.balance > 0
    ? `Approve ${money(c.total)} · request ${money(c.balance)}`
    : `Approve ${money(c.total)} · release ${money(c.release)}`;

  const cycleTheme = () => {
    const sysDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = theme === "system" ? (sysDark ? "dark" : "light") : theme;
    setTheme(effective === "dark" ? "light" : "dark");
  };

  return (
    <div data-theme={theme} data-ready={boot !== "run"} className="ui">
      <style dangerouslySetInnerHTML={{ __html: CSS + CAR3D_CSS }} />
      {boot !== "done" && <Preloader exiting={boot === "exit"} />}

      {/* ───────── header ───────── */}
      <header className="hdr sticky top-0 z-40">
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-bold" style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
              1
            </span>
            <span className="truncate text-[14px] font-semibold tracking-tight">
              1Now <span className="c-mute font-normal">Fleet Ops</span>
            </span>
            <span className="hidden text-[13px] c-mute md:inline">/</span>
            <span className="hidden font-mono text-[12px] c-mute md:inline">Return desk · {BOOKING}</span>
          </div>

          <nav className="mx-auto hidden items-center gap-1 xl:flex" aria-label="Inspection progress">
            {steps.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className={`navstep ${s.done ? "done" : ""}`}>
                <span className="navdot">{s.done ? <Icon name="check" weight={700} size={10} /> : i + 1}</span>
                {s.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 xl:ml-0">
            <span className="hidden items-center gap-1.5 font-mono text-[11px] c-mute lg:inline-flex" title="Draft is saved on this device">
              <Icon name="cloud_done" size={12} /> {savedAt ? `Saved ${savedAt}` : "Draft"}
            </span>
            <Pill tone={locked ? "em" : "amber"}>
              <span className="relative flex h-1.5 w-1.5">
                {!locked && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--amber)" }} />}
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: locked ? "var(--em)" : "var(--amber)" }} />
              </span>
              <span className="hidden sm:inline">{locked ? "Settled" : `In progress · ${stepsDone}/5`}</span>
              <span className="sm:hidden">{locked ? "Settled" : `${stepsDone}/5`}</span>
            </Pill>
            <button type="button" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts" className="iconbtn hidden sm:grid">
              <Icon name="keyboard" size={15} />
            </button>
            <button type="button" onClick={cycleTheme} aria-label="Toggle colour theme" className="iconbtn">
              {theme === "system" ? <Icon name="contrast" size={15} /> : theme === "dark" ? <Icon name="light_mode" size={15} /> : <Icon name="dark_mode" size={15} />}
            </button>
          </div>
        </div>
        <div className="h-[2px] w-full" style={{ background: "var(--line)" }}>
          <div className="h-full transition-all duration-500" style={{ width: `${(stepsDone / steps.length) * 100}%`, background: locked ? "var(--em)" : "var(--ink)" }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-4 pb-40 pt-6 sm:px-6 sm:pt-8">
        {/* ───────── page head ───────── */}
        <div className="hero rise" style={{ ["--i" as string]: 0 }}>
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="mono-label">Booking {BOOKING} · returned {fmtWall(d.returnedAt)}</p>
              <h1 className="h1 mt-1.5 text-[30px] font-semibold leading-tight tracking-tight sm:text-[38px]">Return inspection</h1>
              <p className="mt-1 max-w-xl text-[14px] c-mute">Five steps, top to bottom. Charges, the deposit split and {RENTER_FIRST}&apos;s message update as you go.</p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <Plate />
              <div className="flex items-center gap-2 text-[12px] c-mute">
                <span className="ring" style={{ ["--p" as string]: `${(stepsDone / steps.length) * 100}` }} aria-hidden="true" />
                {locked ? "Settled" : `${stepsDone} of ${steps.length} steps complete`}
              </div>
            </div>
          </div>
          <div className="facts mt-6">
            {[
              { i: "directions_car", l: "Vehicle", v: VEHICLE, s: VEHICLE_SUB },
              { i: "badge", l: "Renter", v: RENTER, s: `3 previous rentals · ${CARD}` },
              { i: "event_upcoming", l: "Out → due", v: `${fmtWall(CHECKOUT_AT).split(" · ")[0]} → ${fmtWall(DUE_AT).split(" · ")[0]}`, s: `${fmtWall(CHECKOUT_AT).split(" · ")[1]} · ${DAYS} days` },
              { i: "route", l: "Allowance", v: `${ALLOWANCE} mi`, s: `${PER_DAY} mi/day · ${money(RATE_PER_MILE)}/mi over` },
              { i: "account_balance_wallet", l: "Deposit held", v: money(DEPOSIT), s: "Pre-authorised" },
            ].map((f) => (
              <div key={f.l} className="fact">
                <div className="flex items-center gap-1.5 mono-label"><span className="ico-chip"><Icon name={f.i} size={13} /></span>{f.l}</div>
                <div className="mt-1 truncate text-[15px] font-semibold tabular-nums">{f.v}</div>
                <div className="truncate text-[12px] c-mute">{f.s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-12">
          {/* 01 · readings */}
          <Section
            id="sec-readings"
            icon="speed"
            n={1}
            title="Odometer & fuel"
            sub="Baseline is locked from handover. Enter what's on the dash now."
            done={odoValid}
            right={<span className="mono-label hidden sm:inline">{locked ? "Locked · undo to edit" : "Live"}</span>}
          >
            <div className={`card readings ${locked ? "is-locked" : ""}`}>
              {/* check-in */}
              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                    <Icon name="lock" size={13} className="c-mute" /> Check-in
                  </span>
                  <span className="mono-label">Baseline</span>
                </div>
                <Cluster fuel={8} odo={CHECKIN_ODO} label="Dashboard at check-in: 42,100 miles, tank full" badge={<><Icon name="photo_camera" fill size={11} /> {fmtWall(CHECKOUT_AT)}</>} />
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <div className="readout">
                    <dt className="mono-label">Odometer</dt>
                    <dd className="mt-0.5 text-[19px] font-semibold tabular-nums">{fmt(CHECKIN_ODO)}</dd>
                  </div>
                  <div className="readout">
                    <dt className="mono-label">Fuel</dt>
                    <dd className="mt-0.5 text-[19px] font-semibold tabular-nums">8/8 <span className="text-[12px] c-em">Full</span></dd>
                  </div>
                </dl>
              </div>

              {/* delta */}
              <div className="delta">
                <div className="delta-item">
                  <div className="flex items-center gap-1.5 mono-label"><Icon name="route" size={14} />Driven</div>
                  <div className="text-[30px] font-semibold leading-none tabular-nums tracking-tight">
                    +{fmt(c.driven)}
                    <span className="ml-1 text-[13px] font-medium c-mute">mi</span>
                  </div>
                  <Pill tone={c.excess > 0 ? "amber" : "em"}>{c.excess > 0 ? `${c.excess} over · ${money(c.mileage)}` : "Within allowance"}</Pill>
                </div>
                <Icon name="trending_flat" size={18} className="delta-arrow c-mute" />
                <div className="delta-item">
                  <div className="flex items-center gap-1.5 mono-label"><Icon name="local_gas_station" size={14} />Fuel used</div>
                  <div className="text-[30px] font-semibold leading-none tabular-nums tracking-tight">
                    {c.missing > 0 ? `−${c.missing}/8` : "0"}
                  </div>
                  <Pill tone={c.missing > 0 ? "amber" : "em"}>{c.missing > 0 ? `${trimNum(c.litres)} L · ${money(c.fuel)}` : "Returned full"}</Pill>
                </div>
              </div>

              {/* return */}
              <div className="return p-4 sm:p-5">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
                      <span className="h-2 w-2 rounded-full" style={{ background: locked ? "var(--em)" : "var(--amber)" }} /> Return
                    </span>
                    <span className="mono-label">Mirrors your inputs</span>
                  </div>
                  <Cluster fuel={d.eighths} odo={d.odo} label={`Live dashboard preview: ${d.odo ?? "unknown"} miles, fuel ${d.eighths} of 8`} badge={<><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live preview</>} />
                </div>

                <fieldset disabled={locked} className="min-w-0">
                  <label htmlFor="odo" className="mono-label">Odometer at return</label>
                  <div className={`field mt-1.5 ${odoValid ? "" : "invalid"}`}>
                    <input
                      id="odo"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-invalid={!odoValid}
                      value={d.odo === null ? "" : d.odo.toLocaleString("en-GB")}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                        up({ odo: v === "" ? null : Number(v) });
                      }}
                      className="w-full min-w-0 bg-transparent text-[24px] font-semibold tabular-nums tracking-tight outline-none"
                    />
                    <span className="text-[13px] font-medium c-mute">mi</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[-10, 10, 50].map((delta) => (
                      <button key={delta} type="button" onClick={() => bumpOdo(delta)} className="chip">
                        {delta < 0 ? <Icon name="remove" size={11} /> : <Icon name="add" size={11} />}
                        {Math.abs(delta)}
                      </button>
                    ))}
                  </div>
                  {odoValid ? (
                    <MileageBar driven={c.driven} excess={c.excess} />
                  ) : (
                    <p className="mt-2 flex items-start gap-1.5 text-[12px] c-amber" role="alert">
                      <Icon name="warning" fill size={13} className="mt-px shrink-0" />
                      Must be at least the check-in reading of {fmt(CHECKIN_ODO)} mi.
                    </p>
                  )}

                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <div className="mono-label">Fuel at return</div>
                      <div className="mt-0.5 text-[20px] font-semibold tabular-nums">{d.eighths}/8</div>
                    </div>
                    <label className="flex items-center gap-1.5 text-[12px] c-mute">
                      Pump
                      <span className="field-sm">
                        £
                        <input
                          type="number"
                          step="0.01"
                          min="0.5"
                          max="3"
                          aria-label="Pump price per litre"
                          value={d.pumpPrice}
                          onChange={(e) => up({ pumpPrice: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-12 bg-transparent tabular-nums outline-none"
                        />
                      </span>
                      /L
                    </label>
                  </div>
                  <div className="mt-2">
                    <FuelPicker value={d.eighths} onChange={setFuel} disabled={locked} />
                  </div>
                </fieldset>
              </div>
            </div>
          </Section>

          {/* 02 · return time + items */}
          <Section
            id="sec-time"
            icon="more_time"
            n={2}
            title="Return time & items"
            sub={`Due back ${fmtWall(DUE_AT)} · ${GRACE_MIN}-minute grace, then ${money(LATE_HOURLY)}/h capped at ${money(LATE_CAP)}`}
            done={returnValid}
            right={
              !returnValid ? (
                <Pill tone="amber">Invalid time</Pill>
              ) : c.lateMin === 0 ? (
                <Pill tone="em">On time</Pill>
              ) : c.late === 0 ? (
                <Pill tone="em">{fmtDuration(c.lateMin)} late · in grace</Pill>
              ) : (
                <Pill tone="amber">{fmtDuration(c.lateMin)} late · {money(c.late)}</Pill>
              )
            }
          >
            <div className={`card split ${locked ? "is-locked" : ""}`}>
              <fieldset disabled={locked} className="min-w-0 p-4 sm:p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[230px] flex-1">
                    <label htmlFor="ret" className="mono-label">Returned at</label>
                    <div className={`field mt-1.5 ${returnValid ? "" : "invalid"}`}>
                      <Icon name="schedule" size={16} className="shrink-0 c-mute" />
                      <input
                        id="ret"
                        type="datetime-local"
                        value={d.returnedAt}
                        min={CHECKOUT_AT}
                        onChange={(e) => up({ returnedAt: e.target.value })}
                        className="w-full min-w-0 bg-transparent py-1.5 text-[15px] font-semibold tabular-nums outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5 pb-1">
                    <button type="button" className="chip" onClick={() => up({ returnedAt: toWall(new Date()) })}>Now</button>
                    <button type="button" className="chip" onClick={() => up({ returnedAt: DUE_AT })}>On time</button>
                  </div>
                </div>
                <Timeline returnedAt={d.returnedAt} />
              </fieldset>

              <fieldset disabled={locked} className="min-w-0 p-4 sm:p-5">
                <div className="mono-label">Items handed back</div>
                <ul className="mt-2 space-y-0.5">
                  {(Object.keys(ITEMS) as ItemKey[]).map((k) => (
                    <li key={k}>
                      <label className="checkrow">
                        <input
                          type="checkbox"
                          checked={d.items[k]}
                          onChange={(e) => up({ items: { ...d.items, [k]: e.target.checked } }, `${ITEMS[k].label} marked ${e.target.checked ? "returned" : "missing"}`)}
                        />
                        <span className="box">
                          <Icon name="check" weight={700} size={12} />
                        </span>
                        <Icon name={ITEMS[k].icon} size={18} className="c-mute" /><span className="flex-1 text-[14px]">{ITEMS[k].label}</span>
                        <span className={`text-[12px] tabular-nums ${d.items[k] ? "c-mute" : "c-amber font-semibold"}`}>{d.items[k] ? "Returned" : money(ITEMS[k].fee)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </div>
          </Section>

          {/* 03 · condition */}
          <Section
            id="sec-condition"
            icon="car_crash"
            n={3}
            title="Condition"
            sub="Tap a panel to log new damage, then rate the interior."
            done={conditionDone}
            right={
              !locked && (
                <button
                  type="button"
                  disabled={d.damages.length > 0}
                  onClick={() => up({ noDamage: !d.noDamage }, d.noDamage ? "Exterior check cleared" : "Exterior checked — no new damage")}
                  className={`chip ${d.noDamage ? "chip-on" : ""}`}
                  title={d.damages.length > 0 ? "Remove logged damage first" : undefined}
                >
                  <Icon name="verified_user" fill size={13} /> No new damage
                </button>
              )
            }
          >
            <div className={`card split ${locked ? "is-locked" : ""}`}>
              <fieldset disabled={locked} className="min-w-0 p-4 sm:p-5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="mono-label">Exterior</span>
                  <span className="mono-label">
                    {d.damages.length ? `${d.damages.length} logged · ${money(c.damage)}` : d.noDamage ? "No new damage" : "Not checked"}
                  </span>
                </div>
                <Car3D counts={zoneCounts} selected={zone} onPick={setZone} disabled={locked} />

                {zone && (
                  <div className="fade-in mt-3 rounded-xl border bd bg-sunk p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold">New damage · {ZONE_LABEL[zone]}</span>
                      <button type="button" className="iconbtn h-7 w-7" aria-label="Close" onClick={() => setZone(null)}>
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {(Object.keys(DAMAGE_TYPES) as DamageType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`chip ${dmgType === t ? "chip-on" : ""}`}
                          onClick={() => {
                            setDmgType(t);
                            setDmgCost(String(DAMAGE_TYPES[t].cost));
                          }}
                        >
                          <Icon name={DAMAGE_TYPES[t].icon} size={14} />
                          {DAMAGE_TYPES[t].label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-[110px_1fr_auto]">
                      <span className="field-sm h-10">
                        £
                        <input type="number" min="0" step="5" aria-label="Repair estimate" value={dmgCost} onChange={(e) => setDmgCost(e.target.value)} className="w-full bg-transparent tabular-nums outline-none" />
                      </span>
                      <input
                        type="text"
                        placeholder="Note — e.g. 4 cm scuff, lower corner"
                        value={dmgNote}
                        onChange={(e) => setDmgNote(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addDamage()}
                        className="field-sm h-10 w-full"
                      />
                      <button type="button" onClick={addDamage} className="btn-primary h-10 px-4 text-[13px]">
                        <Icon name="add" size={14} /> Add
                      </button>
                    </div>
                  </div>
                )}

                {d.damages.length > 0 && (
                  <ul className="divide-line mt-3 rounded-xl border bd">
                    {d.damages.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: "var(--amber-soft)", color: "var(--amber-ink)" }}>
                          <Icon name={DAMAGE_TYPES[x.type].icon} size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold">
                            {ZONE_LABEL[x.zone]} · {DAMAGE_TYPES[x.type].label}
                          </div>
                          {x.note && <div className="truncate text-[12px] c-mute">{x.note}</div>}
                        </div>
                        <span className="text-[13px] font-semibold tabular-nums">{money(x.cost)}</span>
                        {!locked && (
                          <button type="button" className="iconbtn h-7 w-7" aria-label="Remove damage" onClick={() => removeDamage(x.id)}>
                            <Icon name="delete" size={13} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <fieldset disabled={locked} className="min-w-0 p-4 sm:p-5">
                <div className="mono-label">Interior</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(CLEANING) as CleanKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={d.cleaning === k}
                      onClick={() => up({ cleaning: k }, `Interior rated: ${CLEANING[k].label}`)}
                      className={`opt ${d.cleaning === k ? "sel" : ""}`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold"><Icon name={CLEANING[k].icon} size={17} fill={d.cleaning === k} />{CLEANING[k].label}</span>
                        <span className={`text-[12px] font-semibold tabular-nums ${CLEANING[k].fee ? "c-amber" : "c-em"}`}>{CLEANING[k].fee ? money(CLEANING[k].fee) : "£0"}</span>
                      </span>
                      <span className="text-[11px] c-mute">{CLEANING[k].hint}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 text-[12px] c-mute">
                  <Icon name="info" fill size={13} className="mt-px shrink-0" /> Check seats, footwells and the boot. Valet fees cover the real cost of turning the car round.
                </p>
              </fieldset>
            </div>
          </Section>

          {/* 04 · evidence */}
          <Section id="sec-evidence" icon="photo_camera" n={4} title="Evidence & notes" sub="Photos are required for every category you charge — they win disputes." done={evidenceDone}>
            <div className="card split split-wide">
              <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-3 sm:p-5">
                {(Object.keys(SLOT_META) as Slot[]).map((slot) => {
                  const req = needs[slot];
                  const has = photos[slot].length > 0;
                  return (
                    <div key={slot} className={`slot ${req && !has ? "need" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold"><Icon name={SLOT_META[slot].icon} size={17} />{SLOT_META[slot].label}</span>
                        {req ? <Pill tone={has ? "em" : "amber"}>{has ? "Done" : "Required"}</Pill> : <Pill tone="mute">Optional</Pill>}
                      </div>
                      <p className="mt-0.5 text-[11px] c-mute">{SLOT_META[slot].hint}</p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {photos[slot].map((p) => (
                          <span key={p.id} className="thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={p.name} />
                            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => removePhoto(slot, p.id)}>
                              <Icon name="close" size={10} />
                            </button>
                          </span>
                        ))}
                        <button type="button" className="addthumb" onClick={() => fileRefs.current[slot]?.click()} aria-label={`Add ${SLOT_META[slot].label} photo`}>
                          <Icon name="add_a_photo" size={16} />
                        </button>
                        <input
                          ref={(el) => {
                            fileRefs.current[slot] = el;
                          }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          hidden
                          onChange={(e) => {
                            addPhotos(slot, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex min-w-0 flex-col p-4 sm:p-5">
                <label htmlFor="notes" className="mono-label flex items-center gap-1.5">
                  <Icon name="sticky_note_2" size={12} /> Internal notes
                </label>
                <textarea
                  id="notes"
                  ref={notesRef}
                  rows={4}
                  value={d.notes}
                  onChange={(e) => up({ notes: e.target.value })}
                  placeholder="For the next shift or finance — never shown to the renter."
                  className="field-area mt-1.5 flex-1"
                />
              </div>
            </div>
          </Section>

          {/* 05 · settlement */}
          <Section id="sec-decision" icon="payments" n={5} title="Settlement" sub="Review the split, act on Carisma's checks, then approve from the bar below." done={d.settled}>
            <div className="card settle">
              {/* amount */}
              <div className="p-5 sm:p-6">
                <span className="mono-label">{c.balance > 0 ? "Still due from renter" : "Release to renter"}</span>
                <Money value={c.balance > 0 ? c.balance : c.release} className={`mt-1 block text-[52px] font-semibold leading-none tracking-tight ${c.balance > 0 ? "c-amber" : c.release > 0 ? "c-em" : "c-ink"}`} />
                <p className="mt-2 text-[13px] c-mute">
                  of {money(DEPOSIT)} held · <span className="font-semibold tabular-nums c-ink">{money(c.retained)}</span> retained
                </p>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
                  <div style={{ width: `${(c.release / DEPOSIT) * 100}%`, background: "var(--em)", transition: "width .5s cubic-bezier(.2,.8,.2,1)" }} />
                  <div style={{ width: `${(c.retained / DEPOSIT) * 100}%`, background: "var(--amber)", transition: "width .5s cubic-bezier(.2,.8,.2,1)" }} />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider c-mute">
                  <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--em)" }} />Released</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--amber)" }} />Retained</span>
                </div>
                <dl className="mt-5 space-y-1.5 border-t bd pt-4 text-[13px]">
                  <div className="flex justify-between c-mute"><dt>Charges</dt><dd className="tabular-nums">{money(c.charges)}</dd></div>
                  {c.goodwill > 0 && <div className="flex justify-between c-em"><dt>Goodwill</dt><dd className="tabular-nums">−{money(c.goodwill)}</dd></div>}
                  <div className="flex justify-between font-semibold"><dt>Total (incl. VAT)</dt><dd className="tabular-nums"><Money value={c.total} /></dd></div>
                </dl>
              </div>

              {/* lines */}
              <div className="min-w-0">
                <div className="flex items-center justify-between px-5 pb-2 pt-5 sm:px-6">
                  <span className="mono-label">Charges</span>
                  <span className="mono-label">{c.lines.length} item{c.lines.length === 1 ? "" : "s"}</span>
                </div>
                {c.lines.length === 0 ? (
                  <p className="flex items-center gap-2 px-5 pb-5 text-[13px] c-mute sm:px-6">
                    <Icon name="check_circle" fill size={15} className="c-em" /> No charges — full tank, within allowance, no damage.
                  </p>
                ) : (
                  <ul className="divide-line">
                    {c.lines.map((l) => (
                      <li key={l.k} className="flex items-start gap-3 px-5 py-2.5 sm:px-6">
                        <Icon name={l.icon} size={15} className="mt-0.5 shrink-0 c-mute" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold leading-snug">{l.name}</div>
                          <div className="break-words font-mono text-[10.5px] leading-relaxed c-mute">{l.sub}</div>
                          {l.k === "fee" && (
                            <div className="mt-1">
                              <Switch checked={d.waive} onChange={(v) => up({ waive: v }, v ? "Refuelling fee waived" : "Refuelling fee reinstated")} label="Waive fee" disabled={locked} />
                            </div>
                          )}
                        </div>
                        <span className={`text-[13px] font-semibold tabular-nums ${l.amt > 0 ? "" : "c-mute line-through"}`}>{money(l.k === "fee" && d.waive ? ADMIN_FEE : l.amt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {!locked && c.charges > 0 && (
                  <div className="border-t bd px-5 py-3 sm:px-6">
                    {!gwOpen && c.goodwill === 0 ? (
                      <button type="button" className="inline-flex items-center gap-1.5 text-[12px] font-semibold c-mute hover:c-ink" onClick={() => setGwOpen(true)}>
                        <Icon name="volunteer_activism" size={13} /> Add goodwill credit
                      </button>
                    ) : (
                      <div className="fade-in grid grid-cols-[100px_1fr_auto] items-center gap-2">
                        <span className="field-sm h-9">
                          £
                          <input
                            type="number"
                            min="0"
                            step="1"
                            aria-label="Goodwill credit amount"
                            value={d.goodwill || ""}
                            placeholder="0"
                            onChange={(e) => up({ goodwill: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full bg-transparent tabular-nums outline-none"
                          />
                        </span>
                        <select aria-label="Goodwill reason" value={d.goodwillReason} onChange={(e) => up({ goodwillReason: e.target.value })} className={`field-sm h-9 w-full ${reasonMissing ? "invalid" : ""}`}>
                          <option value="">Reason…</option>
                          {GOODWILL_REASONS.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="iconbtn h-8 w-8"
                          aria-label="Remove goodwill"
                          onClick={() => {
                            up({ goodwill: 0, goodwillReason: "" });
                            setGwOpen(false);
                          }}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* copilot */}
              <div className="copilot min-w-0">
                <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
                  <div className="flex items-center gap-2">
                    <span className="spark grid h-7 w-7 place-items-center rounded-lg">
                      <Icon name="auto_awesome" fill size={14} />
                    </span>
                    <div>
                      <div className="text-[14px] font-semibold leading-tight">Carisma copilot</div>
                      <div className="text-[11px] c-mute">Live checks on this return</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono-label">Dispute risk</div>
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      <span className="risk" data-level={risk.level}>
                        <i /> <i /> <i />
                      </span>
                      <span className="text-[12px] font-semibold">{risk.label}</span>
                    </div>
                  </div>
                </div>
                <div className="mx-5 mb-3 rounded-lg bg-sunk px-3 py-2.5 sm:mx-6">
                  <p key={recommendation} className="swap text-[13px] leading-relaxed">
                    <span className="font-semibold">Recommend: </span>
                    {recommendation}
                  </p>
                  <p className="mt-1 text-[11px] c-mute">{risk.note}</p>
                </div>
                <ul className="divide-line border-t bd">
                  {checks.map((ch) => (
                    <li key={ch.id} className="flex items-start gap-2.5 px-5 py-2.5 sm:px-6">
                      {ch.tone === "ok" ? (
                        <Icon name="check_circle" fill size={15} className="mt-0.5 shrink-0 c-em" />
                      ) : ch.tone === "warn" ? (
                        <Icon name="gpp_maybe" fill size={15} className="mt-0.5 shrink-0 c-amber" />
                      ) : (
                        <Icon name="info" fill size={15} className="mt-0.5 shrink-0 c-info" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold leading-snug">{ch.title}</div>
                        <div className="text-[12px] leading-snug c-mute">{ch.detail}</div>
                      </div>
                      {ch.action && !locked && (
                        <button type="button" onClick={() => (ch.action?.photo ? pickPhoto(ch.action.photo) : ch.action?.note ? focusNotes() : ch.action?.run?.())} className="chip shrink-0 whitespace-nowrap">
                          {ch.action.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* message + activity */}
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="card min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-5 pb-2.5 pt-4">
                  <span className="inline-flex items-center gap-2 text-[14px] font-semibold">
                    <Icon name="forum" size={15} /> Message to {RENTER_FIRST}
                    <span className="font-normal c-mute">· auto-drafted</span>
                  </span>
                  <button
                    type="button"
                    className="chip"
                    onClick={async () => {
                      const ok = await copyText(message);
                      if (ok) {
                        setMsgCopied(true);
                        showToast("Message copied");
                        setTimeout(() => setMsgCopied(false), 1800);
                      } else showToast("Couldn't copy — select the text manually");
                    }}
                  >
                    {msgCopied ? <Icon name="check" weight={700} size={12} /> : <Icon name="content_copy" size={12} />} {msgCopied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="msg mx-5 mb-5">{message}</pre>
              </div>
              <div className="card min-w-0 px-5 pb-5 pt-4">
                <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
                  <Icon name="history" size={15} /> Activity
                </div>
                <ActivityLog log={d.log} bare />
              </div>
            </div>
          </Section>
        </div>

        {/* ───────── receipt ───────── */}
        <div ref={receiptRef} className={`rcpt-wrap scroll-mt-20 ${locked ? "open" : ""}`} aria-hidden={!locked}>
          <div className="rcpt-inner">
            <div className="mx-auto mt-12 max-w-2xl">
              <h2 className="mb-3 text-[18px] font-semibold tracking-tight">VAT invoice</h2>
                <article id="receipt" className="paper" aria-label="VAT invoice">
                  <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-8">
                    <div className="no-print mb-5 flex flex-wrap gap-x-4 gap-y-1.5">
                      {["Deposit adjusted", "Invoice issued", `${RENTER_FIRST} notified`].map((t, i) => (
                        <span key={t} className="tick inline-flex items-center gap-1.5 text-xs font-semibold" style={{ animationDelay: `${450 + i * 200}ms`, color: "#047857" }}>
                          <Icon name="check" weight={700} size={14} /> {t}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-semibold tracking-tight">VAT Invoice</h3>
                        <p className="mt-1 text-xs text-neutral-500">1Now Fleet Ops Ltd · VAT No. GB 000 0000 00 (sample)</p>
                      </div>
                      <div className="text-right font-mono text-xs text-neutral-600">
                        <div className="font-semibold text-neutral-900">{d.meta.no}</div>
                        <div>{d.meta.date}</div>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-4 border-y border-dashed border-neutral-300 py-4 text-sm">
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Billed to</div>
                        <div className="mt-1 font-semibold">{RENTER}</div>
                        <div className="text-neutral-600">Booking {BOOKING} · {DAYS}-day rental</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Vehicle</div>
                        <div className="mt-1 font-semibold">{PLATE}</div>
                        <div className="text-neutral-600">VW Golf 1.5 TSI Life</div>
                      </div>
                    </div>
                    <ul className="mt-4 space-y-3">
                      {c.lines.filter((l) => l.amt > 0).length === 0 && <li className="text-sm text-neutral-600">No surcharges applied — full deposit released.</li>}
                      {c.lines
                        .filter((l) => l.amt > 0)
                        .map((l) => (
                          <li key={l.k} className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-sm font-semibold">{l.name}</div>
                              <div className="font-mono text-xs text-neutral-500">{l.sub}</div>
                            </div>
                            <div className="text-sm font-semibold tabular-nums">{money(l.amt)}</div>
                          </li>
                        ))}
                      {c.goodwill > 0 && (
                        <li className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold">Goodwill credit</div>
                            <div className="font-mono text-xs text-neutral-500">{d.goodwillReason}</div>
                          </div>
                          <div className="text-sm font-semibold tabular-nums" style={{ color: "#047857" }}>−{money(c.goodwill)}</div>
                        </li>
                      )}
                    </ul>
                    <dl className="mt-5 space-y-1.5 border-t border-neutral-200 pt-4 text-sm tabular-nums">
                      <div className="flex justify-between text-neutral-600"><dt>Subtotal (ex. VAT)</dt><dd>{money(net)}</dd></div>
                      <div className="flex justify-between text-neutral-600"><dt>VAT @ 20%</dt><dd>{money(vat)}</dd></div>
                      <div className="flex justify-between text-base font-semibold"><dt>Total charged</dt><dd>{money(c.total)}</dd></div>
                    </dl>
                    <dl className="mt-4 space-y-1.5 rounded-xl bg-neutral-100 p-4 text-sm tabular-nums">
                      <div className="flex justify-between text-neutral-600"><dt>Deposit held</dt><dd>{money(DEPOSIT)}</dd></div>
                      <div className="flex justify-between text-neutral-600"><dt>Retained for charges</dt><dd>−{money(c.retained)}</dd></div>
                      <div className="flex justify-between text-base font-semibold" style={{ color: "#047857" }}><dt>Released to {RENTER_FIRST}</dt><dd>{money(c.release)}</dd></div>
                      {c.balance > 0 && (
                        <div className="flex justify-between font-semibold" style={{ color: "#B45309" }}><dt>Balance still due</dt><dd>{money(c.balance)}</dd></div>
                      )}
                    </dl>
                    <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">Charges are VAT-inclusive; VAT at 20% shown for reference.</p>
                    <div className="no-print mt-5">
                      <div className="break-all rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[11px] text-neutral-600">{d.meta.link}</div>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await copyText(d.meta.link);
                            if (ok) {
                              setLinkCopied(true);
                              showToast("Receipt link copied");
                              setTimeout(() => setLinkCopied(false), 1800);
                            } else showToast("Couldn't copy — select the link manually");
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50"
                        >
                          {linkCopied ? <Icon name="check" weight={700} size={16} /> : <Icon name="content_copy" size={16} />} {linkCopied ? "Copied" : "Copy link"}
                        </button>
                        <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E293B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0F172A]">
                          <Icon name="print" size={16} /> Print invoice
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
            </div>
          </div>
        </div>

        <Marquee />

        <footer className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] c-mute">
          <Icon name="verified_user" fill size={13} /> Demo data · petrol {money(d.pumpPrice)}/L · excess mileage {money(RATE_PER_MILE)}/mi · late {money(LATE_HOURLY)}/h after {GRACE_MIN} min · draft auto-saved on this device
        </footer>
      </main>

      {/* ───────── settlement dock (always in reach) ───────── */}
      <div className="dock-wrap fixed inset-x-0 bottom-0 z-40" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto max-w-[1240px] px-3 pb-3 sm:px-6">
          <div className="dock">
            <div className="hidden items-center gap-1 md:flex" aria-label="Progress">
              {steps.map((s, i) => (
                <a key={s.id} href={`#${s.id}`} className={`dockstep ${s.done ? "done" : ""}`} title={s.label}>
                  {s.done ? <Icon name="check" weight={700} size={11} /> : i + 1}
                </a>
              ))}
            </div>
            <div className="min-w-0 md:border-l md:pl-4 bd">
              <div className="mono-label">{c.balance > 0 ? "Still due" : "Release"} · of {money(DEPOSIT)}</div>
              <Money value={c.balance > 0 ? c.balance : c.release} className={`block text-[22px] font-semibold leading-tight ${c.balance > 0 ? "c-amber" : "c-em"}`} />
            </div>
            <div className="hidden min-w-0 flex-1 text-[12px] lg:block">
              {locked ? (
                <span className="c-em">Settled {d.meta.date} · {d.meta.no}</span>
              ) : blockers.length ? (
                <a href={blockers[0].href} className="inline-flex items-center gap-2 c-mute hover:c-ink">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--amber)" }} />
                  {blockers[0].msg}
                  {blockers.length > 1 && <span className="c-mute">+{blockers.length - 1} more</span>}
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 c-mute">
                  <span className="risk" data-level={risk.level}><i /> <i /> <i /></span> Dispute risk {risk.label.toLowerCase()} · <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd>
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {locked ? (
                <button type="button" onClick={undo} className="btn-ghost">
                  <Icon name="undo" size={14} /> <span className="hidden sm:inline">Undo / edit</span>
                </button>
              ) : (
                <button type="button" onClick={reset} className="iconbtn" aria-label="Reset inspection" title="Reset inspection">
                  <Icon name="restart_alt" size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={approve}
                disabled={locked}
                aria-disabled={!canApprove}
                className={`cta rounded-xl px-4 py-3 text-[13px] font-semibold sm:px-5 ${locked ? "cta-done" : ""} ${!canApprove && !locked ? "cta-blocked" : ""} ${canApprove ? "cta-go" : ""}`}
              >
                {locked ? (
                  <span className="inline-flex items-center gap-2"><Icon name="check_circle" fill size={16} className="pop" /> Settled</span>
                ) : canApprove ? (
                  <><span className="sm:hidden">Approve</span><span className="hidden sm:inline">{ctaLabel}</span></>
                ) : (
                  <><span className="sm:hidden">Next step</span><span className="hidden sm:inline">Next: {blockers[0]?.msg.toLowerCase()}</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* shortcuts */}
      {help && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setHelp(false)}>
          <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="card fade-in w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Icon name="keyboard" size={16} /> Keyboard shortcuts
              </h2>
              <button type="button" className="iconbtn h-8 w-8" aria-label="Close" onClick={() => setHelp(false)}>
                <Icon name="close" size={14} />
              </button>
            </div>
            <ul className="mt-4 space-y-2.5 text-[13px]">
              {[
                ["0 – 8", "Set fuel level in eighths"],
                ["[  ]", "Odometer −10 / +10 mi"],
                ["Ctrl + Enter", "Approve settlement"],
                ["?", "Show / hide this panel"],
                ["Esc", "Close"],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3">
                  <span className="c-mute">{v}</span>
                  <kbd className="kbd">{k}</kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* toast */}
      <div role="status" aria-live="polite" className={`pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 transition-all duration-300 bottom-24 lg:bottom-8 ${toastOn ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
        <div className="rounded-full px-4 py-2 text-[13px] font-semibold shadow-lg" style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
          {toast}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Footer marquee — three stacked rows, outline / solid / outline,
   cropped top & bottom, drifting slowly in opposite directions.
──────────────────────────────────────────────────────────── */
const MARQUEE_ROWS: { words: string[]; dir: "l" | "r"; kind: "solid" | "line"; dur: number }[] = [
  { words: ["Return inspection", "Odometer", "Fuel", "Condition"], dir: "l", kind: "line", dur: 70 },
  { words: ["1Now Fleet Ops", PLATE, "Inspect", "Settle", "Release"], dir: "r", kind: "solid", dur: 85 },
  { words: ["Zero disputes", "Deposit settled", "Evidence first"], dir: "l", kind: "line", dur: 75 },
];
const MARQUEE_ICONS = ["directions_car", "speed", "verified", "local_gas_station", "key"];

function Marquee() {
  return (
    <section className="mq" aria-label="1Now Fleet Ops — inspect, settle, release">
      {MARQUEE_ROWS.map((row, r) => {
        const seq = row.words.map((w, i) => (
          <span key={i} className="mq-item">
            {w}
            <span className="mq-sep msr" aria-hidden="true">
              {MARQUEE_ICONS[(i + r) % MARQUEE_ICONS.length]}
            </span>
          </span>
        ));
        return (
          <div key={r} className={`mq-row mq-${row.kind}`} aria-hidden="true">
            <div className={`mq-track mq-${row.dir}`} style={{ animationDuration: `${row.dur}s` }}>
              <div className="mq-group">{seq}{seq}</div>
              <div className="mq-group">{seq}{seq}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

const SLOT_META: Record<Slot, { icon: string; label: string; hint: string }> = {
  dash: { icon: "speed", label: "Dashboard", hint: "Odometer + fuel gauge in one shot" },
  ext: { icon: "directions_car", label: "Exterior", hint: "Each damaged panel, close and wide" },
  int: { icon: "airline_seat_recline_extra", label: "Interior", hint: "Seats, footwells, boot" },
};

function ActivityLog({ log, bare }: { log: LogEntry[]; bare?: boolean }) {
  if (log.length === 0) return <p className="text-[13px] c-mute">No activity yet.</p>;
  return (
    <ol className={`${bare ? "" : "card p-4 sm:p-5"} space-y-2.5`}>
      {log.slice(0, 14).map((e, i) => (
        <li key={i} className="flex gap-3 text-[13px]">
          <span className="w-11 shrink-0 font-mono text-[11px] leading-5 c-mute">{e.t}</span>
          <span className="leading-5">{e.m}</span>
        </li>
      ))}
    </ol>
  );
}

/* ────────────────────────────────────────────────────────────
   Theme tokens, components & print (scoped under .ui)
──────────────────────────────────────────────────────────── */
const LIGHT = `--bg:#F6F7F8;--surface:#FFFFFF;--sunk:#F1F3F5;--ink:#0B0D0E;--mute:#646B72;
  --line:rgba(10,12,14,.08);--line-strong:rgba(10,12,14,.16);
  --cta-bg:#111827;--cta-fg:#FFFFFF;
  --amber:#F59E0B;--amber-ink:#B45309;--amber-soft:rgba(245,158,11,.14);
  --em:#10B981;--em-ink:#047857;--em-soft:rgba(16,185,129,.13);--info:#2563EB;
  --glass:rgba(246,247,248,.9);--shadow:0 1px 2px rgba(10,12,14,.04),0 8px 24px -16px rgba(10,12,14,.18);`;
const DARK = `--bg:#0A0C0D;--surface:#111416;--sunk:#171B1E;--ink:#EEF1F3;--mute:#8A939A;
  --line:rgba(255,255,255,.075);--line-strong:rgba(255,255,255,.15);
  --cta-bg:#EEF1F3;--cta-fg:#0A0C0D;
  --amber:#F59E0B;--amber-ink:#FBBF24;--amber-soft:rgba(245,158,11,.15);
  --em:#10B981;--em-ink:#34D399;--em-soft:rgba(16,185,129,.15);--info:#60A5FA;
  --glass:rgba(10,12,14,.9);--shadow:0 1px 0 rgba(255,255,255,.025),0 16px 40px -24px rgba(0,0,0,.9);`;

const CSS = `
.ui{${LIGHT}
  font-family:var(--font-geist-sans),ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  background:var(--bg);color:var(--ink);min-height:100vh;overflow-x:clip;color-scheme:light;
  -webkit-font-smoothing:antialiased;flex:1}
.ui[data-theme=dark]{${DARK}color-scheme:dark}
@media (prefers-color-scheme:dark){.ui[data-theme=system]{${DARK}color-scheme:dark}}

.ui .font-mono,.ui .mono-label,.ui .kbd,.ui .msg{font-family:var(--font-geist-mono),ui-monospace,SFMono-Regular,Menlo,monospace}
.ui .mono-label{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.ui .bg-surf{background:var(--surface)}
.ui .bg-sunk{background:var(--sunk)}
.ui .bd{border-color:var(--line)}
.ui .c-ink{color:var(--ink)}
.ui .c-mute{color:var(--mute)}
.ui .c-amber{color:var(--amber-ink)}
.ui .c-em{color:var(--em-ink)}
.ui .c-info{color:var(--info)}
.ui .hover\\:c-ink:hover{color:var(--ink)}
.ui .divide-line>*+*{border-top:1px solid var(--line)}
.ui .card{background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}
.ui .is-locked{opacity:.7}
.ui .hdr{background:var(--glass);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.ui .bar{background:var(--glass);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:var(--shadow)}
.ui button{cursor:pointer;-webkit-tap-highlight-color:transparent}
.ui button:disabled{cursor:not-allowed}
.ui :focus-visible{outline:2px solid var(--info);outline-offset:2px;border-radius:8px}
.ui input:focus-visible,.ui select:focus-visible,.ui textarea:focus-visible{outline:none}
.ui fieldset{min-width:0}

/* header progress */
.ui .navstep{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:500;color:var(--mute);transition:background .15s,color .15s}
.ui .navstep:hover{background:var(--sunk);color:var(--ink)}
.ui .navstep.done{color:var(--ink)}
.ui .navdot{display:grid;place-items:center;width:16px;height:16px;border-radius:999px;border:1px solid var(--line-strong);font-size:9.5px;font-weight:700}
.ui .navstep.done .navdot{background:var(--em);border-color:var(--em);color:#04251A}
.ui .iconbtn{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);transition:background .15s,border-color .15s}
.ui .iconbtn:hover{background:var(--sunk);border-color:var(--line-strong)}

/* facts strip */
.ui .facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.ui .facts .fact:last-child{grid-column:span 2}
@media (min-width:768px){.ui .facts{grid-template-columns:repeat(5,minmax(0,1fr))}.ui .facts .fact:last-child{grid-column:auto}}
.ui .fact{background:var(--surface);padding:12px 14px;min-width:0}

/* plate */
.ui .plate{display:inline-flex;align-items:stretch;overflow:hidden;border-radius:7px;border:2px solid rgba(0,0,0,.85);background:#FFD60A;box-shadow:0 2px 0 rgba(0,0,0,.3);user-select:none;align-self:flex-start}
@media (min-width:640px){.ui .plate{align-self:auto}}
.ui .plate-gb{display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0B3FA8;padding:0 7px;font-size:9px;font-weight:700;line-height:1;color:#fff;letter-spacing:.05em}
.ui .plate-txt{padding:4px 14px;font-family:var(--font-geist-mono),monospace;font-weight:700;font-size:24px;letter-spacing:.1em;color:#000}

/* step marker */
.ui .stepdot{display:grid;place-items:center;flex-shrink:0;width:26px;height:26px;border-radius:999px;border:1.5px solid var(--line-strong);font-size:12px;font-weight:700;color:var(--mute);margin-top:1px;transition:all .2s}
.ui .stepdot.done{background:var(--em);border-color:var(--em);color:#04251A}

/* pills & chips */
.ui .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 9px;font-size:11.5px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.ui .pill-em{background:var(--em-soft);color:var(--em-ink)}
.ui .pill-amber{background:var(--amber-soft);color:var(--amber-ink)}
.ui .pill-mute{background:var(--sunk);color:var(--mute)}
.ui .chip{display:inline-flex;align-items:center;gap:5px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);padding:5px 10px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;transition:background .15s,border-color .15s,transform .1s}
.ui .chip:hover:not(:disabled){background:var(--sunk)}
.ui .chip:active:not(:disabled){transform:scale(.97)}
.ui .chip:disabled{opacity:.45}
.ui .chip-on{background:var(--cta-bg)!important;color:var(--cta-fg);border-color:var(--cta-bg)}

/* fields */
.ui .field{display:flex;align-items:center;gap:8px;border-radius:12px;border:1px solid var(--line-strong);background:var(--sunk);padding:6px 14px;transition:border-color .15s,box-shadow .15s}
.ui .field:focus-within{border-color:var(--info);box-shadow:0 0 0 3px color-mix(in srgb,var(--info) 22%,transparent)}
.ui .field.invalid,.ui .field-sm.invalid{border-color:var(--amber)}
.ui .field-sm{display:inline-flex;align-items:center;gap:4px;border-radius:9px;border:1px solid var(--line-strong);background:var(--sunk);padding:4px 10px;font-size:13px;color:var(--ink);transition:border-color .15s}
.ui .field-sm:focus-within,.ui .field-sm:focus{border-color:var(--info)}
.ui .field-area{width:100%;border-radius:12px;border:1px solid var(--line-strong);background:var(--sunk);padding:10px 14px;font-size:14px;resize:vertical;color:var(--ink)}
.ui .field-area:focus{border-color:var(--info)}
.ui input[type=number]::-webkit-inner-spin-button{opacity:.4}
.ui .readout{border-radius:12px;background:var(--sunk);padding:10px 12px}

/* fuel picker */
.ui .fuelpick{display:grid;grid-template-columns:34px repeat(8,minmax(0,1fr));gap:4px}
.ui .seg{position:relative;height:44px;border-radius:8px;border:1.5px dashed var(--line-strong);background:var(--surface);overflow:hidden;transition:border-color .2s,transform .1s}
.ui .seg:hover:not(:disabled){border-color:var(--mute)}
.ui .seg:active:not(:disabled){transform:scale(.96)}
.ui .seg[data-fill]{border-style:solid;border-color:transparent}
.ui .seg-fill{position:absolute;inset:0;transform:scaleY(0);transform-origin:bottom;transition:transform .35s cubic-bezier(.2,.8,.2,1),background .2s}
.ui .seg[data-fill=amber] .seg-fill{transform:scaleY(1);background:var(--amber)}
.ui .seg[data-fill=em] .seg-fill{transform:scaleY(1);background:var(--em)}
.ui .seg-lbl{position:relative;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--mute)}
.ui .seg[data-fill] .seg-lbl{color:#1a1205}
.ui .seg.sel{box-shadow:0 0 0 2px var(--ink)}
.ui .seg-e{border-style:solid}
.ui .seg-e.sel{background:var(--amber-soft)}

/* checkbox rows */
.ui .checkrow{display:flex;align-items:center;gap:10px;border-radius:10px;padding:8px 8px;cursor:pointer;transition:background .15s}
.ui .checkrow:hover{background:var(--sunk)}
.ui .checkrow input{position:absolute;opacity:0;pointer-events:none}
.ui .checkrow .box{display:grid;place-items:center;width:18px;height:18px;border-radius:5px;border:1.5px solid var(--line-strong);color:transparent;transition:all .15s;flex-shrink:0}
.ui .checkrow input:checked+.box{background:var(--em);border-color:var(--em);color:#04251A}
.ui .checkrow input:focus-visible+.box{outline:2px solid var(--info);outline-offset:2px}

/* car damage map */
.ui .zone{fill:var(--surface);stroke:var(--line-strong);stroke-width:1;cursor:pointer;transition:fill .15s}
.ui .zone:hover{fill:color-mix(in srgb,var(--info) 14%,var(--surface))}
.ui .zone.hit{fill:var(--amber-soft);stroke:var(--amber)}
.ui .zone.sel{fill:color-mix(in srgb,var(--info) 22%,var(--surface));stroke:var(--info);stroke-width:1.5}
.ui fieldset:disabled .zone{cursor:not-allowed}
.ui .zone-g:focus-visible{outline:none}
.ui .zone-g:focus-visible .zone{stroke:var(--info);stroke-width:2}

/* interior options */
.ui .opt{display:flex;flex-direction:column;align-items:flex-start;gap:1px;text-align:left;border-radius:12px;border:1px solid var(--line-strong);background:var(--surface);padding:10px 12px;transition:border-color .15s,background .15s}
.ui .opt:hover:not(:disabled){background:var(--sunk)}
.ui .opt.sel{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink);background:var(--sunk)}

/* evidence */
.ui .slot{border-radius:12px;border:1px solid var(--line);background:var(--sunk);padding:12px}
.ui .slot.need{border-color:color-mix(in srgb,var(--amber) 55%,transparent);border-style:dashed}
.ui .thumb{position:relative;width:52px;height:52px;border-radius:9px;overflow:hidden;border:1px solid var(--line-strong)}
.ui .thumb img{width:100%;height:100%;object-fit:cover}
.ui .thumb button{position:absolute;top:2px;right:2px;display:grid;place-items:center;width:16px;height:16px;border-radius:999px;background:rgba(0,0,0,.7);color:#fff}
.ui .addthumb{display:grid;place-items:center;width:52px;height:52px;border-radius:9px;border:1.5px dashed var(--line-strong);color:var(--mute);background:var(--surface);transition:all .15s}
.ui .addthumb:hover{color:var(--ink);border-color:var(--mute)}

/* buttons */
.ui .btn-primary{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:9px;background:var(--cta-bg);color:var(--cta-fg);font-weight:600;transition:opacity .15s}
.ui .btn-primary:hover{opacity:.9}
.ui .btn-ghost{display:inline-flex;align-items:center;gap:6px;border-radius:10px;border:1px solid var(--line-strong);background:var(--surface);padding:7px 12px;font-size:13px;font-weight:600}
.ui .btn-ghost:hover{background:var(--sunk)}
.ui .kbd{display:inline-block;border-radius:5px;border:1px solid var(--line-strong);border-bottom-width:2px;background:var(--sunk);padding:0 5px;font-size:10.5px;line-height:17px;color:var(--ink)}

.ui .cta{position:relative;overflow:hidden;background:var(--cta-bg);color:var(--cta-fg);transition:transform .15s,opacity .15s,background .2s}
.ui .cta:not(:disabled):not(.cta-blocked):hover{transform:translateY(-1px)}
.ui .cta:not(:disabled):active{transform:scale(.985)}
.ui .cta-blocked{background:var(--sunk);color:var(--mute);border:1px dashed var(--line-strong)}
.ui .cta-done{background:var(--em)!important;color:#04251A!important}

.ui .sw{position:relative;display:inline-block;width:30px;height:17px;border-radius:999px;background:var(--line-strong);transition:background .2s}
.ui .sw>span{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:999px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .2s}
.ui .sw[data-on=true]{background:var(--em)}
.ui .sw[data-on=true]>span{transform:translateX(13px)}

/* risk meter */
.ui .risk{display:inline-flex;gap:2px}
.ui .risk i{display:block;width:10px;height:5px;border-radius:2px;background:var(--line-strong)}
.ui .risk[data-level="1"] i:nth-child(-n+1){background:var(--em)}
.ui .risk[data-level="2"] i:nth-child(-n+2){background:var(--amber)}
.ui .risk[data-level="3"] i{background:#EF4444}

.ui .msg{white-space:pre-wrap;word-break:break-word;border-radius:10px;background:var(--sunk);padding:12px 14px;font-size:11.5px;line-height:1.6;color:var(--ink);max-height:260px;overflow:auto}


/* ── layout v2: full-width sections ── */
.ui .hero{position:relative;padding:22px;border-radius:20px;border:1px solid var(--line);overflow:hidden;
  background:radial-gradient(1200px 260px at 100% -40%,color-mix(in srgb,var(--em) 14%,transparent),transparent 60%),radial-gradient(700px 240px at -10% 120%,color-mix(in srgb,var(--info) 10%,transparent),transparent 60%),var(--surface)}
@media (min-width:640px){.ui .hero{padding:28px}}
.ui .hero::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:28px 28px;
  -webkit-mask-image:linear-gradient(90deg,transparent 30%,#000 100%);mask-image:linear-gradient(90deg,transparent 30%,#000 100%)}
.ui .hero>*{position:relative;z-index:1}
.ui .ring{width:16px;height:16px;border-radius:999px;background:conic-gradient(var(--em) calc(var(--p)*1%),var(--line-strong) 0);-webkit-mask:radial-gradient(circle,transparent 4.5px,#000 5px);mask:radial-gradient(circle,transparent 4.5px,#000 5px)}

.ui .sec-hd{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin-bottom:14px}
@media (max-width:639px){.ui .sec-hd>.sec-right{width:100%;padding-left:52px}}
.ui .sec-n{display:grid;place-items:center;flex-shrink:0;width:38px;height:38px;border-radius:12px;border:1px solid var(--line-strong);background:var(--surface);font-family:var(--font-geist-mono),monospace;font-size:13px;font-weight:700;color:var(--mute);transition:all .25s}
.ui .sec-n.done{background:var(--em);border-color:var(--em);color:#04251A;box-shadow:0 6px 18px -8px var(--em)}

.ui .readings{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}
.ui .readings>*+*{border-top:1px solid var(--line)}
@media (min-width:1024px){
  .ui .readings{grid-template-columns:minmax(0,.95fr) 190px minmax(0,1.9fr)}
  .ui .readings>*+*{border-top:0;border-left:1px solid var(--line)}
}
.ui .delta{display:flex;align-items:center;justify-content:space-around;gap:12px;padding:18px;background:var(--sunk)}
.ui .delta-item{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
@media (min-width:1024px){.ui .delta{flex-direction:column;justify-content:center;gap:22px}.ui .delta-arrow{transform:rotate(90deg)}}
.ui .return{display:grid;gap:18px;grid-template-columns:minmax(0,1fr)}
@media (min-width:640px){.ui .return{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}

.ui .split{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}
.ui .split>*+*{border-top:1px solid var(--line)}
@media (min-width:1024px){
  .ui .split{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)}
  .ui .split-wide{grid-template-columns:minmax(0,2.2fr) minmax(0,1fr)}
  .ui .split>*+*{border-top:0;border-left:1px solid var(--line)}
}

.ui .settle{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}
.ui .settle>*+*{border-top:1px solid var(--line)}
@media (min-width:1024px){
  .ui .settle{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr) minmax(0,1.15fr)}
  .ui .settle>*+*{border-top:0;border-left:1px solid var(--line)}
}
.ui .copilot{background:linear-gradient(180deg,color-mix(in srgb,var(--info) 6%,transparent),transparent 140px)}
.ui .spark{background:linear-gradient(135deg,#6366F1,#10B981);color:#fff}

/* timeline */
.ui .tl-track{position:relative;height:10px;border-radius:999px;background:var(--sunk);margin-top:28px}
.ui .tl-zone{position:absolute;top:0;bottom:0}
.ui .tl-zone:first-child{border-radius:999px 0 0 999px}
.ui .tl-zone:nth-child(3){border-radius:0 999px 999px 0}
.ui .tl-grace{background:repeating-linear-gradient(135deg,var(--em-soft) 0 5px,transparent 5px 10px)}
.ui .tl-tick{position:absolute;top:10px;width:1px;height:8px;background:var(--line-strong)}
.ui .tl-tick>span{position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;white-space:nowrap;font-family:var(--font-geist-mono),monospace;font-size:9.5px;line-height:1.3;color:var(--mute)}
.ui .tl-tick>span b{font-weight:600;color:var(--amber-ink)}
.ui .tl-hire{position:absolute;top:calc(100% + 8px);left:0;white-space:nowrap;font-family:var(--font-geist-mono),monospace;font-size:9.5px;color:var(--mute)}
@media (max-width:639px){.ui .tl-hire{display:none}}
@media (max-width:639px){.ui .tl-tick:nth-child(even)>span{display:none}}
.ui .tl-due{position:absolute;top:-6px;bottom:-6px;width:2px;margin-left:-1px;background:var(--ink);border-radius:2px}
.ui .tl-due>span{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;font-family:var(--font-geist-mono),monospace;font-size:10px;font-weight:600;color:var(--ink)}
.ui .tl-pin{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:999px;background:var(--em);border:3px solid var(--surface);box-shadow:0 0 0 1px var(--em);transition:left .4s cubic-bezier(.2,.8,.2,1)}
.ui .tl-pin[data-late=true]{background:var(--amber);box-shadow:0 0 0 1px var(--amber)}
.ui .tl-pin>span{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:600;background:var(--cta-bg);color:var(--cta-fg)}
.ui .tl{padding-bottom:30px}

/* dock */
.ui .dock{display:flex;align-items:center;gap:16px;border-radius:18px;border:1px solid var(--line-strong);padding:10px 10px 10px 16px;background:var(--glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 18px 50px -20px rgba(0,0,0,.55)}
.ui .dockstep{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;border:1px solid var(--line-strong);font-size:11px;font-weight:700;color:var(--mute);transition:all .2s}
.ui .dockstep:hover{color:var(--ink);border-color:var(--mute)}
.ui .dockstep.done{background:var(--em);border-color:var(--em);color:#04251A}

/* ══════════ preloader ══════════ */
.ui .pl{position:fixed;inset:0;z-index:100;display:grid;place-items:center;color:#E8ECEF;
  background:radial-gradient(520px 380px at 50% 46%,rgba(16,185,129,.13),transparent 70%),radial-gradient(900px 600px at 50% 120%,rgba(99,102,241,.10),transparent 70%),#05070A;
  transition:transform 1.3s cubic-bezier(.77,0,.18,1),border-radius 1.3s cubic-bezier(.77,0,.18,1);will-change:transform}
.ui .pl::before{content:"";position:absolute;inset:0;opacity:.35;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:32px 32px;
  -webkit-mask-image:radial-gradient(circle at 50% 48%,#000 0,transparent 62%);mask-image:radial-gradient(circle at 50% 48%,#000 0,transparent 62%)}
.ui .pl-exit{transform:translateY(-100%);border-radius:0 0 50% 50%/0 0 140px 140px;box-shadow:0 40px 80px -20px rgba(0,0,0,.6)}
.ui .pl-inner{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;transition:opacity .55s ease,transform .9s cubic-bezier(.77,0,.18,1);animation:plIn .6s cubic-bezier(.2,.7,.2,1) both}
.ui .pl-exit .pl-inner{opacity:0;transform:translateY(-60px) scale(.96)}
.ui .pl-brand{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.ui .pl-brand>span:last-child{color:#7C868D;font-weight:400}
.ui .pl-logo{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:#E8ECEF;color:#05070A;font-size:13px;font-weight:700;box-shadow:0 0 0 4px rgba(232,236,239,.06)}
.ui .pl-gauge{width:min(320px,74vw);height:auto;overflow:visible}
.ui .pl-track{fill:none;stroke:#151B20;stroke-width:12;stroke-linecap:round}
.ui .pl-red{fill:none;stroke:#EF4444;stroke-width:12;opacity:.28}
.ui .pl-arc{fill:none;stroke-width:12;stroke-linecap:round;stroke-dasharray:100 100;stroke-dashoffset:100;filter:drop-shadow(0 0 10px rgba(52,211,153,.45));
  }
.ui .pl.on .pl-arc{animation:plArc 1.9s cubic-bezier(.45,.05,.25,1) .25s forwards}
.ui .pl-tick{stroke:#323C44;stroke-width:1.4}
.ui .pl-tick.major{stroke:#C9D1D7;stroke-width:2.4;stroke-linecap:round}
.ui .pl-tick.red{stroke:#EF4444}
.ui .pl-num{font-family:var(--font-geist-mono),monospace;font-size:12px;font-weight:600;fill:#8A949B;text-anchor:middle}
.ui .pl-unit{font-family:var(--font-geist-mono),monospace;font-size:8.5px;letter-spacing:.14em;fill:#5B666E;text-anchor:middle;text-transform:uppercase}
.ui .pl-needle{transform-box:view-box;transform-origin:120px 120px;transform:rotate(-125deg)}
.ui .pl.on .pl-needle{animation:plNeedle 1.9s cubic-bezier(.45,.05,.25,1) .25s forwards}
.ui .pl-needle line{stroke:#FF6A3D;stroke-width:3.5;stroke-linecap:round;filter:drop-shadow(0 0 6px rgba(255,106,61,.75))}
.ui .pl-hub{fill:#10161A;stroke:#3A454D;stroke-width:2}
.ui .pl-odo{display:flex;align-items:baseline;gap:3px;font-family:var(--font-geist-mono),monospace}
.ui .pl-odo span{display:grid;place-items:center;width:25px;height:34px;border-radius:6px;background:linear-gradient(180deg,#0B1013,#121A1F 50%,#0B1013 50%,#0E1418);border:1px solid #1F282E;color:#A7F3D0;font-size:18px;font-weight:600;text-shadow:0 0 10px rgba(167,243,208,.45)}
.ui .pl-odo em{margin-left:6px;font-style:normal;font-size:11px;color:#6C7780}
.ui .pl-sub{font-family:var(--font-geist-mono),monospace;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#6C7780}
.ui .pl-bar{width:200px;height:2px;border-radius:2px;background:#151B20;overflow:hidden}
.ui .pl-bar i{display:block;height:100%;background:linear-gradient(90deg,#10B981,#34D399,#FBBF24);transform-origin:left;transform:scaleX(0)}
.ui .pl.on .pl-bar i{animation:plBar 2.2s cubic-bezier(.4,0,.2,1) .1s forwards}
@keyframes plIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@keyframes plNeedle{0%{transform:rotate(-125deg)}42%{transform:rotate(116deg)}52%{transform:rotate(108deg)}100%{transform:rotate(-58deg)}}
@keyframes plArc{0%{stroke-dashoffset:100}42%{stroke-dashoffset:3.5}52%{stroke-dashoffset:6.8}100%{stroke-dashoffset:73}}
@keyframes plBar{to{transform:scaleX(1)}}

/* ══════════ entrance choreography ══════════ */
.ui[data-ready=false] .rise{opacity:0;transform:translateY(28px)}
.ui[data-ready=true] .rise{animation:rise 1s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(.35s + var(--i,0) * .09s)}
@keyframes rise{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
.ui .hdr{transition:transform .9s cubic-bezier(.2,.7,.2,1) .25s}
.ui[data-ready=false] .hdr{transform:translateY(-100%)}
.ui .dock-wrap{transition:transform 1s cubic-bezier(.2,.7,.2,1) .7s}
.ui[data-ready=false] .dock-wrap{transform:translateY(130%)}

/* ══════════ polish ══════════ */
.ui{background:radial-gradient(1200px 520px at 50% -260px,color-mix(in srgb,var(--em) 10%,transparent),transparent 70%),var(--bg)}
.ui ::selection{background:color-mix(in srgb,var(--em) 35%,transparent)}
.ui .h1{background:linear-gradient(180deg,var(--ink) 45%,color-mix(in srgb,var(--ink) 78%,transparent));-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-.025em}
.ui .hdr{border-bottom:1px solid var(--line)}

.ui .card{position:relative;border-radius:18px;background:linear-gradient(180deg,color-mix(in srgb,var(--ink) 2.2%,var(--surface)),var(--surface) 140px)}
.ui .card::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:1;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.ui[data-theme=light] .card::before{box-shadow:inset 0 1px 0 #fff}
.ui .hero{border-radius:22px;box-shadow:var(--shadow)}

.ui .sec-hd{padding-bottom:14px;margin-bottom:16px;border-bottom:1px solid transparent;border-image:linear-gradient(90deg,var(--line-strong),transparent 75%) 1}
.ui .sec-n{width:40px;height:40px;border-radius:12px;background:linear-gradient(180deg,var(--surface),var(--sunk));box-shadow:var(--shadow)}
.ui .sec-n.done{background:linear-gradient(180deg,#34D399,#10B981);box-shadow:0 8px 22px -8px rgba(16,185,129,.8)}

.ui .facts{border-radius:16px;background:var(--line)}
.ui .fact{transition:background .2s}
.ui .fact:hover{background:color-mix(in srgb,var(--ink) 3%,var(--surface))}

.ui .pill{border:1px solid transparent}
.ui .pill-em{border-color:color-mix(in srgb,var(--em) 28%,transparent)}
.ui .pill-amber{border-color:color-mix(in srgb,var(--amber) 30%,transparent)}
.ui .chip{height:30px;border-radius:9px;box-shadow:0 1px 0 rgba(0,0,0,.04)}
.ui .chip:hover:not(:disabled){border-color:var(--mute)}

.ui .field{border-radius:12px;box-shadow:inset 0 1px 2px rgba(0,0,0,.12)}
.ui .readout{border:1px solid var(--line)}

.ui .delta{background:radial-gradient(240px 200px at 50% 50%,color-mix(in srgb,var(--amber) 7%,transparent),transparent 70%),var(--sunk)}

.ui .seg{border-radius:9px}
.ui .seg[data-fill=amber] .seg-fill{background:linear-gradient(180deg,#FCD34D,#F59E0B)}
.ui .seg[data-fill=em] .seg-fill{background:linear-gradient(180deg,#6EE7B7,#10B981)}
.ui .seg[data-fill] .seg-fill{box-shadow:inset 0 1px 0 rgba(255,255,255,.45)}
.ui .seg.sel{box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--ink)}

.ui .opt{border-radius:14px;transition:border-color .15s,background .15s,transform .15s}
.ui .opt:hover:not(:disabled){transform:translateY(-1px)}
.ui .opt.sel{background:color-mix(in srgb,var(--ink) 5%,var(--surface))}

.ui .slot{border-radius:14px;transition:border-color .2s,background .2s}
.ui .slot.need{background:color-mix(in srgb,var(--amber) 5%,var(--sunk))}
.ui .addthumb:hover{background:var(--sunk)}

.ui .zone{transition:fill .2s,stroke .2s}
.ui .zone.hit{fill:color-mix(in srgb,var(--amber) 22%,var(--surface))}

.ui .msg{border:1px solid var(--line)}
.ui .copilot{background:radial-gradient(420px 180px at 100% 0,color-mix(in srgb,#6366F1 12%,transparent),transparent 70%)}
.ui .spark{box-shadow:0 6px 16px -6px rgba(99,102,241,.7)}

.ui .dock{border-radius:20px;padding:10px 10px 10px 18px;box-shadow:0 24px 60px -24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05)}
.ui .dock::before{content:"";position:absolute;left:24px;right:24px;top:-1px;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--em) 60%,transparent),transparent)}
.ui .dock{position:relative}
.ui .cta-go{background:linear-gradient(135deg,#34D399,#059669)!important;color:#022C1D!important;box-shadow:0 12px 30px -10px rgba(16,185,129,.7)}
.ui .cta-go::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.35) 50%,transparent 65%);transform:translateX(-120%);animation:sheen 3.2s ease-in-out 1.2s infinite}
@keyframes sheen{0%,60%{transform:translateX(-120%)}100%{transform:translateX(120%)}}

.ui ::-webkit-scrollbar{width:10px;height:10px}
.ui ::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:10px;border:3px solid var(--bg)}


/* Material Symbols */
.ui .msr{font-family:"Material Symbols Rounded";font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;-webkit-font-smoothing:antialiased;font-feature-settings:"liga";width:1em;height:1em;overflow:hidden;flex-shrink:0;user-select:none;vertical-align:middle}
.ui .ico-chip{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:color-mix(in srgb,var(--em) 14%,transparent);color:var(--em-ink)}
.ui .sec-ico{color:var(--mute)}
.ui .sec-n.done+div .sec-ico{color:var(--em-ink)}
.ui .opt.sel .msr{color:var(--em-ink)}
.ui .checkrow input:not(:checked)~.msr{color:var(--amber-ink)}


/* ══════════ footer marquee ══════════ */
.ui .mq{position:relative;width:100vw;margin-left:calc(50% - 50vw);margin-top:72px;padding:6px 0;overflow:hidden;
  background:radial-gradient(60% 120% at 50% 50%,rgba(16,185,129,.08),transparent 70%),#07090B;color:#F3F5F7;
  border-block:1px solid rgba(255,255,255,.07);font-family:"Montserrat",var(--font-geist-sans),sans-serif;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.ui .mq::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:1;
  background:linear-gradient(180deg,#07090B 0%,transparent 22%,transparent 78%,#07090B 100%)}
.ui .mq-row{--fs:clamp(56px,11.5vw,176px);font-size:var(--fs);line-height:.86;font-weight:900;text-transform:uppercase;letter-spacing:-.035em;white-space:nowrap;overflow:hidden}
.ui .mq-row:first-child{height:calc(var(--fs) * .52);display:flex;align-items:flex-end}
.ui .mq-row:last-child{height:calc(var(--fs) * .5);display:flex;align-items:flex-start}
.ui .mq-row:nth-child(2){padding:.04em 0}
.ui .mq-track{display:flex;width:max-content;animation:mqL 80s linear infinite;will-change:transform}
.ui .mq-track.mq-r{animation-name:mqR}
.ui .mq-group{display:flex;flex-shrink:0}
.ui .mq-item{display:inline-flex;align-items:center;gap:.28em;padding-right:.28em}
.ui .mq-solid{color:#F3F5F7;text-shadow:0 0 40px rgba(255,255,255,.08)}
.ui .mq-line{color:transparent;-webkit-text-stroke:1.5px rgba(243,245,247,.42)}
.ui .mq-sep{font-size:.42em;width:1em;height:1em;color:#FFD60A;-webkit-text-stroke:0;font-variation-settings:'FILL' 1,'wght' 600,'opsz' 48}
.ui .mq-line .mq-sep{color:rgba(255,214,10,.55)}
.ui .mq:hover .mq-track{animation-play-state:paused}
@keyframes mqL{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes mqR{from{transform:translateX(-50%)}to{transform:translateX(0)}}
@media (prefers-reduced-motion:reduce){.ui .mq-track{animation:none!important}}

/* motion */
.ui .fade-in{animation:fade .35s ease both}
.ui .swap{animation:fade .35s ease both}
.ui .pop{animation:pop .45s cubic-bezier(.2,1.5,.4,1) both}
@keyframes fade{0%{opacity:0;transform:translateY(4px)}100%{opacity:1;transform:none}}
@keyframes pop{0%{opacity:0;transform:scale(.5)}100%{opacity:1;transform:scale(1)}}

/* receipt slide-in */
.ui .rcpt-wrap{display:grid;grid-template-rows:0fr;opacity:0;visibility:hidden;transition:grid-template-rows .6s cubic-bezier(.2,.8,.2,1),opacity .4s ease,visibility 0s linear .6s}
.ui .rcpt-wrap.open{grid-template-rows:1fr;opacity:1;visibility:visible;transition:grid-template-rows .6s cubic-bezier(.2,.8,.2,1),opacity .4s ease .1s,visibility 0s}
.ui .rcpt-inner{overflow:hidden;min-height:0}
.ui .paper{background:#fff;color:#111;border-radius:16px;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 10px 30px -18px rgba(0,0,0,.45)}
.ui .tick{opacity:0}
.ui .rcpt-wrap.open .tick{animation:pop .45s cubic-bezier(.2,1.4,.4,1) both}

@media (prefers-reduced-motion:reduce){
  .ui *,.ui *::before,.ui *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;transition-delay:0ms!important}
  .ui .tick{opacity:1}
}

@page{margin:16mm}
@media print{
  body *{visibility:hidden}
  #receipt,#receipt *{visibility:visible}
  #receipt{position:absolute;left:0;top:0;width:100%;box-shadow:none!important;border-radius:0}
  .no-print{display:none!important}
}
`;
