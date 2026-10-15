"use client";

/**
 * 1Now Fleet Ops — Return Inspection & Deposit Settlement
 * Single-file Next.js (App Router) page. Tailwind CSS + lucide-react.
 *
 *   npx create-next-app@latest  (TypeScript + Tailwind + App Router)
 *   npm i lucide-react
 *   drop this file at app/page.tsx  ->  npm run dev
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Fuel,
  Gauge,
  Lock,
  Minus,
  Moon,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Undo2,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   Business constants (UK)
──────────────────────────────────────────────────────────── */
const PLATE = "BD71 KLO";
const TANK_L = 50;
const PUMP_PRICE = 1.45; // £/L UK average petrol
const ADMIN_FEE = 15;
const RATE_PER_MILE = 0.35;
const DEPOSIT = 300;
const CHECKIN_ODO = 42100;
const DAYS = 3;
const PER_DAY = 150;
const ALLOWANCE = DAYS * PER_DAY; // 450
const VAT_RATE = 0.2;
const DEFAULT_EIGHTHS = 3;
const DEFAULT_ODO = 42620;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const money = (n: number) => gbp.format(r2(n));
const fmt = (n: number) => n.toLocaleString("en-GB");
const trimNum = (n: number) => Number(n.toFixed(2)).toString();

function compute(eighths: number, odo: number | null, waive: boolean) {
  const driven = odo == null ? 0 : Math.max(0, odo - CHECKIN_ODO);
  const missing = 8 - eighths;
  const litres = (missing / 8) * TANK_L;
  const fuel = r2(litres * PUMP_PRICE);
  const feeApplies = missing > 0;
  const fee = feeApplies && !waive ? ADMIN_FEE : 0;
  const excess = Math.max(0, driven - ALLOWANCE);
  const mileage = r2(excess * RATE_PER_MILE);
  const total = r2(fuel + fee + mileage);
  const retained = r2(Math.min(DEPOSIT, total));
  const release = r2(Math.max(0, DEPOSIT - total));
  const due = r2(Math.max(0, total - DEPOSIT));
  return { driven, missing, litres, fuel, feeApplies, fee, excess, mileage, total, retained, release, due };
}

/* ────────────────────────────────────────────────────────────
   Hooks
──────────────────────────────────────────────────────────── */
function useInView<T extends Element>(
  { threshold = 0.15, rootMargin = "0px 0px -8% 0px", once = true } = {}
) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, once]);
  return [ref, inView] as const;
}

function useTween(target: number, duration = 520) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setV(target);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * eased;
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

/* ────────────────────────────────────────────────────────────
   Small building blocks
──────────────────────────────────────────────────────────── */
function Reveal({
  children,
  className = "",
  delay = 0,
  from = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  from?: "up" | "left" | "right";
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.1 });
  return (
    <div
      ref={ref}
      data-from={from}
      className={`reveal ${inView ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function Money({ value, className = "" }: { value: number; className?: string }) {
  const v = useTween(value);
  return <span className={`tabular-nums ${className}`}>{money(v)}</span>;
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 rounded-full py-1 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        className="relative h-6 w-11 rounded-full border transition-all duration-200"
        style={{
          background: checked ? "var(--cta-bg)" : "var(--sunk)",
          borderColor: checked ? "var(--cta-bg)" : "var(--line-strong)",
        }}
      >
        <span
          className="absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full shadow transition-transform duration-200"
          style={{
            background: checked ? "var(--cta-fg)" : "var(--surface)",
            transform: checked ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function Plate({ small = false }: { small?: boolean }) {
  return (
    <div
      className="inline-flex select-none items-stretch overflow-hidden rounded-lg border-2 border-black/85 bg-[#FFD60A] shadow-[0_2px_0_rgba(0,0,0,.35)]"
      aria-label={`UK number plate ${PLATE}`}
    >
      <span className="flex flex-col items-center justify-center bg-[#0B3FA8] px-2 text-[9px] font-bold leading-none tracking-wider text-white sm:px-2.5">
        <span className="mb-0.5 text-[8px]">★</span>GB
      </span>
      <span
        className={`font-mono font-bold tracking-[0.1em] text-black ${
          small ? "px-3 py-1 text-lg" : "px-4 py-1.5 text-3xl sm:px-5 sm:text-4xl"
        }`}
      >
        {PLATE}
      </span>
    </div>
  );
}

/* Dashboard cluster illustration — doubles as the "photo" and a live preview */
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
}

function Cluster({ fuel, odo, label }: { fuel: number; odo: number | null; label: string }) {
  const cx = 238, cy = 118, R = 50, A0 = -55, A1 = 55;
  const ang = A0 + (fuel / 8) * (A1 - A0);
  const [sx, sy] = polar(cx, cy, R, A0);
  const [ex, ey] = polar(cx, cy, R, A1);
  const [px, py] = polar(cx, cy, R, ang);
  const ticks = Array.from({ length: 9 }, (_, i) => {
    const d = A0 + (i * (A1 - A0)) / 8;
    const major = i % 4 === 0;
    const [x1, y1] = polar(cx, cy, R - 4, d);
    const [x2, y2] = polar(cx, cy, R + (major ? 9 : 5), d);
    return { x1, y1, x2, y2, major };
  });
  const speedTicks = Array.from({ length: 28 }, (_, i) => {
    const d = -135 + (i * 270) / 27;
    const major = i % 3 === 0;
    const [x1, y1] = polar(84, 92, major ? 40 : 44, d);
    const [x2, y2] = polar(84, 92, 50, d);
    return { x1, y1, x2, y2, major };
  });
  const [nx, ny] = polar(84, 92, 38, -135);
  const low = fuel <= 2;
  const odoText = odo == null ? "------" : String(Math.max(0, odo)).padStart(6, "0");

  return (
    <svg viewBox="0 0 320 184" role="img" aria-label={label} className="block h-auto w-full">
      <rect width="320" height="184" rx="16" fill="#090B0D" />
      <rect x="1" y="1" width="318" height="182" rx="15" fill="none" stroke="#242B31" />
      {/* speedo */}
      <circle cx="84" cy="92" r="54" fill="#0E1215" stroke="#222A30" strokeWidth="2" />
      {speedTicks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.major ? "#C9D1D7" : "#4A545C"} strokeWidth={t.major ? 1.8 : 1} />
      ))}
      <line x1="84" y1="92" x2={nx} y2={ny} stroke="#FF6A3D" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="84" cy="92" r="5" fill="#161B1F" stroke="#39434B" />
      <text x="84" y="126" textAnchor="middle" fontSize="8" fill="#6C7780" fontFamily="monospace" letterSpacing="1.5">MPH</text>
      {/* fuel */}
      <path d={`M${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}`} fill="none" stroke="#2A3238" strokeWidth="5" strokeLinecap="round" />
      {fuel > 0 && (
        <path
          d={`M${sx} ${sy} A ${R} ${R} 0 0 1 ${px} ${py}`}
          fill="none"
          stroke={fuel === 8 ? "#34D399" : "#F59E0B"}
          strokeWidth="5"
          strokeLinecap="round"
          style={{ transition: "stroke .3s" }}
        />
      )}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.major ? "#C9D1D7" : "#5A656E"} strokeWidth={t.major ? 1.8 : 1} />
      ))}
      <text x={sx - 6} y={sy + 20} fontSize="10" fill="#9AA5AE" fontFamily="monospace" fontWeight="700">E</text>
      <text x={ex - 2} y={ey + 20} fontSize="10" fill="#9AA5AE" fontFamily="monospace" fontWeight="700">F</text>
      <g
        style={{
          transform: `rotate(${ang}deg)`,
          transformOrigin: `${cx}px ${cy}px`,
          transition: "transform .8s cubic-bezier(.3,1.35,.5,1)",
        }}
      >
        <line x1={cx} y1={cy} x2={cx} y2={cy - R + 8} stroke="#FF6A3D" strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r="5.5" fill="#161B1F" stroke="#39434B" />
      <g opacity={low ? 1 : 0.18} style={{ transition: "opacity .3s" }}>
        <circle cx={cx} cy="64" r="3.5" fill="#F59E0B" />
        <text x={cx + 8} y="67" fontSize="7.5" fill="#F59E0B" fontFamily="monospace">LOW</text>
      </g>
      {/* odometer */}
      <rect x="104" y="146" width="112" height="24" rx="5" fill="#0D1114" stroke="#222A30" />
      <text x="160" y="163" textAnchor="middle" fontSize="14" fill="#A7F3D0" fontFamily="monospace" letterSpacing="2.5">
        {odoText}
      </text>
      <text x="206" y="142" fontSize="7" fill="#6C7780" fontFamily="monospace">MI</text>
    </svg>
  );
}

function FuelGauge({
  eighths,
  onSelect,
  disabled,
}: {
  eighths: number;
  onSelect: (n: number) => void;
  disabled?: boolean;
}) {
  const [ref, armed] = useInView<HTMLDivElement>({ threshold: 0.35 });
  const full = eighths === 8;
  return (
    <div ref={ref}>
      <div className="flex gap-1.5 sm:gap-2" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => {
          const on = armed && i < eighths;
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => onSelect(i + 1)}
              className="relative h-14 flex-1 overflow-hidden rounded-md border-2 transition-colors duration-200 sm:h-[72px]"
              style={{
                borderStyle: on ? "solid" : "dashed",
                borderColor: on ? (full ? "var(--em)" : "var(--amber)") : "var(--dash)",
              }}
            >
              <span
                className="absolute inset-0 origin-bottom"
                style={{
                  background: full ? "var(--em)" : "var(--amber)",
                  transform: on ? "scaleY(1)" : "scaleY(0)",
                  transition: "transform .5s cubic-bezier(.2,.8,.2,1), background .25s",
                  transitionDelay: `${on ? i * 45 : (7 - i) * 20}ms`,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider c-mute">
        <span>Empty</span>
        <span>4/8</span>
        <span>Full</span>
      </div>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5 sm:mb-7">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-1.5 max-w-xl text-sm c-mute sm:text-base">{sub}</p>
    </div>
  );
}

function LedgerRow({
  icon: Icon,
  title,
  formula,
  amount,
  tone,
  struck,
  children,
}: {
  icon: ElementType;
  title: string;
  formula: string;
  amount: number;
  tone: "amber" | "mute";
  struck?: number;
  children?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3.5 gap-y-3 p-4 sm:gap-x-4 sm:p-5">
      <span
        className="grid h-10 w-10 place-items-center rounded-xl"
        style={{
          background: tone === "amber" ? "var(--amber-soft)" : "var(--sunk)",
          color: tone === "amber" ? "var(--amber-ink)" : "var(--mute)",
        }}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-base font-semibold">{title}</div>
        <div className="mt-0.5 break-words font-mono text-xs leading-relaxed c-mute">{formula}</div>
      </div>
      <div className="text-right">
        {struck != null && struck > 0 && (
          <div className="text-xs tabular-nums c-mute line-through">{money(struck)}</div>
        )}
        <Money
          value={amount}
          className={`text-xl font-semibold sm:text-2xl ${tone === "amber" && amount > 0 ? "c-amber" : "c-mute"}`}
        />
      </div>
      {children && <div className="col-span-3 sm:col-span-2 sm:col-start-2">{children}</div>}
    </div>
  );
}

function MileageBar({ driven, excess }: { driven: number; excess: number }) {
  const [ref, armed] = useInView<HTMLDivElement>({ threshold: 0.4 });
  const scale = Math.max(ALLOWANCE * 1.4, driven * 1.12);
  const within = Math.min(driven, ALLOWANCE) / scale;
  const over = excess / scale;
  const mark = ALLOWANCE / scale;
  return (
    <div ref={ref} className="pt-5">
      <div className="relative h-2.5 rounded-full bg-sunk">
        <div
          className="absolute left-0 top-0 h-full rounded-l-full"
          style={{
            width: armed ? `${within * 100}%` : "0%",
            background: "var(--em)",
            borderRadius: over > 0 ? "9999px 0 0 9999px" : "9999px",
            transition: "width .9s cubic-bezier(.2,.8,.2,1)",
          }}
        />
        <div
          className="absolute top-0 h-full rounded-r-full"
          style={{
            left: `${within * 100}%`,
            width: armed ? `${over * 100}%` : "0%",
            background: "var(--amber)",
            transition: "width .9s cubic-bezier(.2,.8,.2,1) .25s, left .9s cubic-bezier(.2,.8,.2,1)",
          }}
        />
        <div
          className="absolute -top-1.5 h-[22px] w-px"
          style={{ left: `${mark * 100}%`, background: "var(--ink)" }}
        />
        <span
          className="absolute -top-[22px] -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider c-mute"
          style={{ left: `${mark * 100}%` }}
        >
          {ALLOWANCE} mi limit
        </span>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider c-mute">
        <span>0</span>
        <span>{fmt(driven)} mi driven</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Page
──────────────────────────────────────────────────────────── */
export default function Page() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [eighths, setEighths] = useState(DEFAULT_EIGHTHS);
  const [odo, setOdo] = useState<number | null>(DEFAULT_ODO);
  const [waive, setWaive] = useState(false);
  const [settled, setSettled] = useState(false);
  const [meta, setMeta] = useState({ no: "INV-1N-000000", date: "", link: "" });
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const receiptRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ctaRef, ctaVisible] = useInView<HTMLDivElement>({ once: false, threshold: 0.2, rootMargin: "0px" });

  const calc = useMemo(() => compute(eighths, odo, waive), [eighths, odo, waive]);
  const odoValid = odo !== null && odo >= CHECKIN_ODO;
  const dirty = eighths !== DEFAULT_EIGHTHS || odo !== DEFAULT_ODO || waive;

  /* theme: follow the OS on first paint */
  useEffect(() => {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);

  /* scroll progress + header state (no re-render per frame for the bar) */
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        const p = max > 0 ? h.scrollTop / max : 0;
        if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`;
        setScrolled(h.scrollTop > 8);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastOn(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 2200);
  }, []);

  const selectFuel = (n: number, focus = false) => {
    const v = Math.max(0, Math.min(8, n));
    setEighths(v);
    if (focus) chipRefs.current[v]?.focus();
  };

  const onChipKey = (e: React.KeyboardEvent) => {
    if (settled) return;
    const map: Record<string, number> = {
      ArrowRight: eighths + 1,
      ArrowUp: eighths + 1,
      ArrowLeft: eighths - 1,
      ArrowDown: eighths - 1,
      Home: 0,
      End: 8,
    };
    if (e.key in map) {
      e.preventDefault();
      selectFuel(map[e.key], true);
    }
  };

  const bumpOdo = (d: number) => setOdo((p) => Math.min(999999, Math.max(0, (p ?? CHECKIN_ODO) + d)));

  const approve = () => {
    if (settled || !odoValid) return;
    const now = new Date();
    const no = `INV-1N-${String(Date.now()).slice(-6)}`;
    setMeta({
      no,
      date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      link: `https://receipts.1now.example/r/${no.toLowerCase()}`,
    });
    setCopied(false);
    setSettled(true);
    setTimeout(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 450);
  };

  const undo = () => {
    setSettled(false);
    setCopied(false);
    showToast("Settlement reopened for editing");
  };

  const reset = () => {
    setEighths(DEFAULT_EIGHTHS);
    setOdo(DEFAULT_ODO);
    setWaive(false);
  };

  const copyLink = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(meta.link);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = meta.link;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      showToast("Receipt link copied");
      setTimeout(() => setCopied(false), 2000);
    } else showToast("Couldn't copy — select the link manually");
  };

  /* Carisma recommendation */
  const carisma = useMemo(() => {
    const bits: string[] = [];
    if (calc.missing > 0) bits.push(`a ${trimNum(calc.litres)}L fuel deficit`);
    if (calc.excess > 0) bits.push(`${calc.excess} excess ${calc.excess === 1 ? "mile" : "miles"}`);
    if (calc.total === 0) {
      return "Carisma found a full tank and mileage within the 450 mi allowance. Recommended action: release the full £300.00 deposit.";
    }
    const detected = `Carisma detected ${bits.join(" and ")}${waive && calc.missing > 0 ? " (refuel fee waived)" : ""}.`;
    if (calc.due > 0) {
      return `${detected} Recommended action: retain the full ${money(DEPOSIT)} deposit and invoice the remaining ${money(calc.due)}.`;
    }
    return `${detected} Recommended action: Retain ${money(calc.total)} and release remaining ${money(calc.release)}.`;
  }, [calc, waive]);

  const ctaLabel = !odoValid
    ? "Enter a valid return odometer"
    : calc.total === 0
    ? `Release full ${money(DEPOSIT)} deposit`
    : calc.due > 0
    ? `Approve ${money(calc.total)} Surcharge · ${money(calc.due)} due`
    : `Approve ${money(calc.total)} Surcharge & Release ${money(calc.release)}`;

  /* VAT (charges are VAT-inclusive; VAT at 20% extracted) */
  const net = r2(calc.total / (1 + VAT_RATE));
  const vat = r2(calc.total - net);
  const lines = [
    calc.fuel > 0 && { k: "fuel", name: "Fuel shortfall", sub: `${trimNum(calc.litres)} L × ${money(PUMP_PRICE)}/L`, amt: calc.fuel },
    calc.feeApplies && { k: "fee", name: "Refuelling admin fee", sub: waive ? "Waived by operator" : "Flat fee", amt: calc.fee },
    calc.mileage > 0 && { k: "mi", name: "Excess mileage", sub: `${calc.excess} mi × ${money(RATE_PER_MILE)}/mi`, amt: calc.mileage },
  ].filter(Boolean) as { k: string; name: string; sub: string; amt: number }[];

  const showBar = !ctaVisible && !settled;
  const locked = settled;

  return (
    <div
      data-theme={theme}
      style={{ colorScheme: theme }}
      className="ui"
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* scroll progress */}
      <div className="fixed inset-x-0 top-0 z-50 h-[3px]">
        <div ref={progressRef} className="h-full origin-left" style={{ background: "var(--ink)", transform: "scaleX(0)" }} />
      </div>

      {/* header */}
      <header className={`hdr sticky top-0 z-40 transition-all duration-200 ${scrolled ? "hdr-solid" : ""}`}>
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold" style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
              1
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              1Now<span className="hidden sm:inline"> Fleet Ops</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider sm:text-[11px]"
              style={{
                background: settled ? "var(--em-soft)" : "var(--amber-soft)",
                color: settled ? "var(--em-ink)" : "var(--amber-ink)",
                borderColor: settled ? "var(--em-soft)" : "var(--amber-soft)",
              }}
            >
              <span className="relative flex h-2 w-2">
                {!settled && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--amber)" }} />}
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: settled ? "var(--em)" : "var(--amber)" }} />
              </span>
              <span className="hidden sm:inline">{settled ? "Settled & dispatched" : "Return inspection pending"}</span>
              <span className="sm:hidden">{settled ? "Settled" : "Pending"}</span>
            </span>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              className="grid h-9 w-9 place-items-center rounded-full border bd bg-surf transition-all duration-200 hover:scale-105"
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 sm:px-6 lg:px-8 lg:pb-20">
        {/* hero */}
        <section className="pt-8 sm:pt-12">
          <Reveal>
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mono-label">Booking 1N-48213 · Return desk</p>
                <h1 className="mt-3 text-[2.6rem] font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                  Return inspection
                </h1>
                <p className="mt-4 max-w-xl text-base c-mute sm:text-lg">
                  Check the tank and the odometer. The deposit maths happens as you type, so approval takes seconds.
                </p>
              </div>
              <div className="shrink-0 md:pb-1">
                <Plate />
              </div>
            </div>
          </Reveal>

          <Reveal delay={90} className="mt-8 sm:mt-10">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bd lg:grid-cols-4" style={{ background: "var(--line)" }}>
              {[
                { l: "Vehicle", v: "2023 Volkswagen Golf", s: "1.5 TSI Life · 50 L tank" },
                { l: "Renter", v: "Liam Davies", s: "Completed 3-day booking" },
                { l: "Mileage allowance", v: `${ALLOWANCE} mi`, s: `${PER_DAY} mi/day × ${DAYS} days` },
                { l: "Security deposit held", v: money(DEPOSIT), s: "Released on settlement" },
              ].map((c) => (
                <div key={c.l} className="bg-surf p-4 sm:p-5">
                  <div className="mono-label">{c.l}</div>
                  <div className="mt-2 text-lg font-semibold leading-snug tabular-nums sm:text-xl">{c.v}</div>
                  <div className="mt-0.5 text-xs c-mute sm:text-sm">{c.s}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* check-in vs return */}
        <section className="mt-14 sm:mt-20">
          <Reveal>
            <SectionTitle title="Check-in vs. return" sub="The baseline is locked. Set what the renter actually handed back." />
          </Reveal>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            {/* baseline */}
            <Reveal from="left" className="h-full">
              <article className="card flex h-full flex-col p-4 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Lock size={16} className="c-mute" /> Check-in
                  </h3>
                  <span className="mono-label">Baseline · locked</span>
                </div>
                <div className="relative overflow-hidden rounded-2xl">
                  <Cluster fuel={8} odo={CHECKIN_ODO} label="Dashboard cluster at check-in: 42,100 miles, tank full" />
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur">
                    <Camera size={11} /> 06 Oct 2026 · 09:12
                  </span>
                </div>
                <div className="mt-5">
                  <div className="mono-label">Odometer at check-in</div>
                  <div className="mt-2 flex items-center gap-2 rounded-xl border bg-sunk px-4 py-2" style={{ borderColor: "var(--line-strong)" }}>
                    <span className="w-full text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{fmt(CHECKIN_ODO)}</span>
                    <span className="text-base font-medium c-mute">mi</span>
                  </div>
                  <div className="mt-2.5 flex min-h-[32px] items-center">
                    <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--em-soft)", color: "var(--em-ink)" }}>
                      Recorded at handover
                    </span>
                  </div>

                  <div className="mt-7 flex items-end justify-between gap-3">
                    <div>
                      <div className="mono-label">Fuel level at check-in</div>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-4xl font-semibold tabular-nums tracking-tight">8/8</span>
                        <span className="text-sm font-medium c-em">100% Full</span>
                      </div>
                    </div>
                    <div className="text-right text-xs tabular-nums c-mute">
                      <div>100% in tank</div>
                      <div>{TANK_L} L of {TANK_L} L</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <FuelGauge eighths={8} onSelect={() => {}} disabled />
                  </div>
                </div>
                <div className="mt-auto pt-5">
                  <p className="flex items-center gap-2 rounded-xl border bd bg-sunk px-3.5 py-2.5 text-xs c-mute">
                    <Lock size={13} className="shrink-0" /> Baseline readings can't be edited after handover.
                  </p>
                </div>
              </article>
            </Reveal>

            {/* return */}
            <Reveal from="right" className="h-full">
              <article className="card flex h-full flex-col p-4 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: locked ? "var(--em)" : "var(--amber)" }} />
                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: locked ? "var(--em)" : "var(--amber)" }} />
                    </span>
                    Return
                  </h3>
                  <span className="mono-label">{locked ? "Locked · undo to edit" : "Live verification"}</span>
                </div>
                <div className="relative overflow-hidden rounded-2xl">
                  <Cluster fuel={eighths} odo={odo} label={`Live dashboard preview: ${odo ?? "unknown"} miles, fuel ${eighths} of 8`} />
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur">
                    <Camera size={11} /> Live preview · mirrors inputs
                  </span>
                </div>

                <div className={`mt-5 transition-opacity duration-200 ${locked ? "pointer-events-none opacity-60" : ""}`}>
                  {/* odometer */}
                  <label htmlFor="odo" className="mono-label">Odometer at return</label>
                  <div
                    className="mt-2 flex items-center gap-2 rounded-xl border bg-sunk px-4 py-2 transition-all duration-200 focus-within:ring-2"
                    style={{ borderColor: odoValid ? "var(--line-strong)" : "var(--amber)", ["--tw-ring-color" as string]: "var(--ink)" }}
                  >
                    <input
                      id="odo"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={locked}
                      aria-invalid={!odoValid}
                      value={odo === null ? "" : odo.toLocaleString("en-GB")}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setOdo(d === "" ? null : Number(d));
                      }}
                      className="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums tracking-tight outline-none sm:text-4xl"
                    />
                    <span className="text-base font-medium c-mute">mi</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {[-10, 10, 50].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => bumpOdo(d)}
                        className="inline-flex items-center gap-1 rounded-lg border bd bg-surf px-2.5 py-1.5 text-xs font-semibold tabular-nums transition-all duration-200 hover:-translate-y-px active:scale-95"
                      >
                        {d < 0 ? <Minus size={12} /> : <Plus size={12} />}
                        {Math.abs(d)}
                      </button>
                    ))}
                    {odoValid && (
                      <span
                        className="ml-auto rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums"
                        style={{
                          background: calc.excess > 0 ? "var(--amber-soft)" : "var(--em-soft)",
                          color: calc.excess > 0 ? "var(--amber-ink)" : "var(--em-ink)",
                        }}
                      >
                        +{fmt(calc.driven)} mi driven{calc.excess > 0 ? ` · ${calc.excess} over` : ""}
                      </span>
                    )}
                  </div>
                  {!odoValid && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "var(--amber-ink)" }} role="alert">
                      <AlertTriangle size={14} className="mt-px shrink-0" />
                      Return reading can't be below the check-in reading of {fmt(CHECKIN_ODO)} mi.
                    </p>
                  )}

                  {/* fuel */}
                  <div className="mt-7 flex items-end justify-between gap-3">
                    <div>
                      <div className="mono-label">Fuel level at return</div>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-4xl font-semibold tabular-nums tracking-tight">{eighths}/8</span>
                        <span className="text-sm font-medium c-mute">{eighths === 0 ? "Empty" : eighths === 8 ? "Full" : "Below full"}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs tabular-nums c-mute">
                      <div>{trimNum((eighths / 8) * 100)}% in tank</div>
                      <div>{trimNum((eighths / 8) * TANK_L)} L of {TANK_L} L</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <FuelGauge eighths={eighths} onSelect={(n) => selectFuel(n)} disabled={locked} />
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Fuel level at return, in eighths"
                    onKeyDown={onChipKey}
                    className="mt-4 grid grid-cols-9 gap-1 sm:gap-1.5"
                  >
                    {Array.from({ length: 9 }, (_, i) => (
                      <button
                        key={i}
                        ref={(el) => {
                          chipRefs.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={eighths === i}
                        aria-label={i === 0 ? "0/8 Empty" : i === 8 ? "8/8 Full" : `${i}/8`}
                        tabIndex={eighths === i ? 0 : -1}
                        onClick={() => selectFuel(i)}
                        className="h-10 rounded-lg border text-sm font-semibold tabular-nums transition-all duration-200 active:scale-95"
                        style={{
                          background: eighths === i ? "var(--cta-bg)" : "var(--surface)",
                          color: eighths === i ? "var(--cta-fg)" : "var(--ink)",
                          borderColor: eighths === i ? "var(--cta-bg)" : "var(--line-strong)",
                        }}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            </Reveal>
          </div>
        </section>

        {/* maths + decision */}
        <section className="mt-14 grid gap-6 sm:mt-20 lg:grid-cols-12 lg:gap-8">
          {/* ledger */}
          <div className="lg:col-span-7 lg:row-start-1">
            <Reveal>
              <SectionTitle title="Settlement maths" sub="Every line recalculates the moment you change the tank or the odometer." />
            </Reveal>
            <Reveal delay={60}>
              <div className="card overflow-hidden">
                <div className="divide-y divide-line">
                  <LedgerRow
                    icon={Fuel}
                    title="Fuel shortfall"
                    tone="amber"
                    amount={calc.fuel}
                    formula={`${calc.missing}/8 missing × ${TANK_L} L = ${trimNum(calc.litres)} L × ${money(PUMP_PRICE)}/L (UK avg)`}
                  />
                  <LedgerRow
                    icon={Receipt}
                    title="Refuelling admin fee"
                    tone="amber"
                    amount={calc.fee}
                    struck={calc.feeApplies && waive ? ADMIN_FEE : undefined}
                    formula={calc.feeApplies ? `Flat ${money(ADMIN_FEE)} when the tank returns below full` : "Not applicable — tank returned full"}
                  >
                    <Switch checked={waive} onChange={setWaive} label="Waive fee" disabled={locked || !calc.feeApplies} />
                  </LedgerRow>
                  <LedgerRow
                    icon={Gauge}
                    title="Excess mileage"
                    tone="amber"
                    amount={calc.mileage}
                    formula={`${fmt(calc.driven)} driven − ${ALLOWANCE} allowed = ${calc.excess} mi × ${money(RATE_PER_MILE)}/mi`}
                  >
                    <MileageBar driven={calc.driven} excess={calc.excess} />
                  </LedgerRow>
                </div>
                <div className="space-y-2.5 border-t bd bg-sunk p-4 sm:p-5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium c-mute">Total surcharges</span>
                    <Money value={calc.total} className="text-xl font-semibold" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium c-mute">Security deposit held</span>
                    <span className="text-xl font-semibold tabular-nums">{money(DEPOSIT)}</span>
                  </div>
                  <div className="flex items-baseline justify-between border-t bd pt-2.5">
                    <span className="text-sm font-semibold">{calc.due > 0 ? "Balance due from renter" : "Net deposit release"}</span>
                    <Money value={calc.due > 0 ? calc.due : calc.release} className={`text-2xl font-semibold ${calc.due > 0 ? "c-amber" : "c-em"}`} />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* decision panel */}
          <div className="lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1">
            <Reveal from="right" delay={120} className="lg:sticky lg:top-24">
              <aside className="card p-5 sm:p-6" aria-label="Settlement decision">
                <div className="mono-label">{calc.due > 0 ? "Deposit fully retained" : "Net deposit release"}</div>
                <div className="mt-2">
                  <Money
                    value={calc.release}
                    className={`block text-[3.25rem] font-semibold leading-none tracking-tight sm:text-6xl ${calc.release > 0 ? "c-em" : "c-ink"}`}
                  />
                </div>
                <p className="mt-2.5 text-sm c-mute">
                  of {money(DEPOSIT)} held ·{" "}
                  <span className="font-semibold tabular-nums c-ink">{money(calc.retained)}</span> retained
                  {calc.due > 0 && <> · <span className="font-semibold c-amber">{money(calc.due)}</span> still due</>}
                </p>

                {/* split bar */}
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
                  <div
                    style={{ width: `${(calc.release / DEPOSIT) * 100}%`, background: "var(--em)", transition: "width .6s cubic-bezier(.2,.8,.2,1)" }}
                  />
                  <div
                    style={{ width: `${(calc.retained / DEPOSIT) * 100}%`, background: "var(--amber)", transition: "width .6s cubic-bezier(.2,.8,.2,1)" }}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider c-mute">
                  <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--em)" }} />Released</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--amber)" }} />Retained</span>
                </div>

                {/* Carisma */}
                <div className="mt-5 rounded-2xl border bd bg-sunk p-4">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
                      <Sparkles size={13} />
                    </span>
                    <span className="text-sm font-semibold">Carisma recommends</span>
                  </div>
                  <p key={carisma} className="swap mt-2.5 text-[15px] italic leading-relaxed">“{carisma}”</p>
                </div>

                {/* CTA */}
                <div ref={ctaRef} className="mt-5">
                  <button
                    type="button"
                    onClick={approve}
                    disabled={settled || !odoValid}
                    className={`cta group relative w-full overflow-hidden rounded-2xl px-5 py-4 text-center text-[15px] font-semibold leading-snug transition-all duration-200 sm:text-base ${
                      settled ? "cta-done" : ""
                    }`}
                  >
                    {settled ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <CheckCircle2 size={20} className="pop" /> Settled &amp; Dispatched
                      </span>
                    ) : (
                      ctaLabel
                    )}
                  </button>

                  <div className="mt-3 flex min-h-[40px] items-center justify-between gap-3">
                    {settled ? (
                      <button
                        type="button"
                        onClick={undo}
                        className="inline-flex items-center gap-2 rounded-xl border bd bg-surf px-3.5 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px active:scale-95"
                      >
                        <Undo2 size={15} /> Undo / Edit
                      </button>
                    ) : (
                      <p className="text-xs c-mute">Approving issues a VAT invoice to Liam Davies.</p>
                    )}
                    {!settled && dirty && (
                      <button
                        type="button"
                        onClick={reset}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold c-mute transition-colors hover:text-[var(--ink)]"
                      >
                        <RotateCcw size={13} /> Reset
                      </button>
                    )}
                  </div>
                </div>
              </aside>
            </Reveal>
          </div>

          {/* receipt */}
          <div className="lg:col-span-7 lg:row-start-2">
            <div ref={receiptRef} className={`rcpt-wrap ${settled ? "open" : ""}`} aria-hidden={!settled}>
              <div className="rcpt-inner">
                <article id="receipt" className="paper mx-auto w-full max-w-xl" aria-label="VAT invoice">
                  <div
                    className="no-print h-3"
                    style={{ background: "radial-gradient(circle at 8px -2px, transparent 8px, #fff 8.5px) repeat-x", backgroundSize: "16px 12px" }}
                  />
                  <div className="px-5 pb-6 pt-4 sm:px-8 sm:pb-8">
                    <div className="no-print mb-5 flex flex-wrap gap-x-4 gap-y-1.5">
                      {["Deposit adjusted", "Invoice issued", "Liam notified"].map((t, i) => (
                        <span key={t} className="tick inline-flex items-center gap-1.5 text-xs font-semibold" style={{ animationDelay: `${650 + i * 220}ms`, color: "#047857" }}>
                          <Check size={14} strokeWidth={3} /> {t}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-semibold tracking-tight">VAT Invoice</h3>
                        <p className="mt-1 text-xs text-neutral-500">1Now Fleet Ops Ltd · VAT No. GB 000 0000 00 (sample)</p>
                      </div>
                      <div className="text-right font-mono text-xs text-neutral-600">
                        <div className="font-semibold text-neutral-900">{meta.no}</div>
                        <div>{meta.date}</div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-4 border-y border-dashed border-neutral-300 py-4 text-sm">
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Billed to</div>
                        <div className="mt-1 font-semibold">Liam Davies</div>
                        <div className="text-neutral-600">3-day rental</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Vehicle</div>
                        <div className="mt-1 font-semibold">{PLATE}</div>
                        <div className="text-neutral-600">VW Golf 1.5 TSI Life</div>
                      </div>
                    </div>

                    <ul className="mt-4 space-y-3">
                      {lines.length === 0 && <li className="text-sm text-neutral-600">No surcharges applied — full deposit released.</li>}
                      {lines.map((l) => (
                        <li key={l.k} className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold">{l.name}</div>
                            <div className="font-mono text-xs text-neutral-500">{l.sub}</div>
                          </div>
                          <div className="text-sm font-semibold tabular-nums">{money(l.amt)}</div>
                        </li>
                      ))}
                    </ul>

                    <dl className="mt-5 space-y-1.5 border-t border-neutral-200 pt-4 text-sm tabular-nums">
                      <div className="flex justify-between text-neutral-600"><dt>Subtotal (ex. VAT)</dt><dd>{money(net)}</dd></div>
                      <div className="flex justify-between text-neutral-600"><dt>VAT @ 20%</dt><dd>{money(vat)}</dd></div>
                      <div className="flex justify-between text-base font-semibold"><dt>Total charged</dt><dd>{money(calc.total)}</dd></div>
                    </dl>

                    <dl className="mt-4 space-y-1.5 rounded-xl bg-neutral-100 p-4 text-sm tabular-nums">
                      <div className="flex justify-between text-neutral-600"><dt>Deposit held</dt><dd>{money(DEPOSIT)}</dd></div>
                      <div className="flex justify-between text-neutral-600"><dt>Retained for charges</dt><dd>−{money(calc.retained)}</dd></div>
                      <div className="flex justify-between text-base font-semibold" style={{ color: "#047857" }}>
                        <dt>Released to Liam</dt><dd>{money(calc.release)}</dd>
                      </div>
                      {calc.due > 0 && (
                        <div className="flex justify-between font-semibold" style={{ color: "#B45309" }}><dt>Balance still due</dt><dd>{money(calc.due)}</dd></div>
                      )}
                    </dl>
                    <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">Charges are VAT-inclusive; VAT at 20% shown for reference.</p>

                    <div className="no-print mt-5">
                      <div className="break-all rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[11px] text-neutral-600">{meta.link}</div>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={copyLink}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition-all duration-200 hover:-translate-y-px hover:bg-neutral-50 active:scale-[.98]"
                        >
                          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy Link"}
                        </button>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E293B] px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-[#0F172A] active:scale-[.98]"
                        >
                          <Printer size={16} /> Print VAT Invoice
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-16 flex items-center gap-2 text-xs c-mute">
          <ShieldCheck size={14} /> Demo data · UK average petrol {money(PUMP_PRICE)}/L · excess mileage {money(RATE_PER_MILE)}/mi
        </footer>
      </main>

      {/* mobile / tablet sticky action bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 lg:hidden ${showBar ? "translate-y-0" : "translate-y-[110%]"}`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-hidden={!showBar}
      >
        <div className="mx-auto max-w-6xl px-3 pb-3 sm:px-6">
          <div className="bar flex items-center gap-3 rounded-2xl border bd p-2.5 pl-4">
            <div className="min-w-0">
              <div className="mono-label">{calc.due > 0 ? "Still due" : "Release"}</div>
              <div className={`text-xl font-semibold tabular-nums leading-tight ${calc.due > 0 ? "c-amber" : "c-em"}`}>
                {money(calc.due > 0 ? calc.due : calc.release)}
              </div>
            </div>
            <button
              type="button"
              tabIndex={showBar ? 0 : -1}
              onClick={approve}
              disabled={!odoValid}
              className="cta ml-auto rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Approve &amp; release
            </button>
          </div>
        </div>
      </div>

      {/* toast */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 transition-all duration-300 bottom-24 lg:bottom-8 ${toastOn ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
      >
        <div className="rounded-full px-4 py-2 text-sm font-semibold shadow-lg" style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
          {toast}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Theme tokens, motion & print (scoped under .ui)
──────────────────────────────────────────────────────────── */
const CSS = `
.ui{
  --bg:#FAFAFA;--surface:#FFFFFF;--sunk:#F3F3F4;--ink:#0B0D0E;--mute:#6B7075;
  --line:rgba(10,12,14,.09);--line-strong:rgba(10,12,14,.18);--dash:rgba(10,12,14,.3);
  --cta-bg:#1E293B;--cta-fg:#FFFFFF;
  --amber:#F59E0B;--amber-ink:#B45309;--amber-soft:rgba(245,158,11,.14);
  --em:#10B981;--em-ink:#047857;--em-soft:rgba(16,185,129,.14);
  --glass:rgba(250,250,250,.8);--shadow:0 1px 0 rgba(10,12,14,.04),0 18px 40px -24px rgba(10,12,14,.25);
  font-family:"Inter Tight Variable","Inter Tight",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  background:var(--bg);color:var(--ink);min-height:100vh;overflow-x:clip;
  -webkit-font-smoothing:antialiased;
}
.ui[data-theme=dark]{
  --bg:#0B0D0E;--surface:#111416;--sunk:#171B1E;--ink:#F2F4F5;--mute:#8B9298;
  --line:rgba(255,255,255,.08);--line-strong:rgba(255,255,255,.16);--dash:rgba(255,255,255,.24);
  --cta-bg:#E6EAEE;--cta-fg:#0B0D0E;
  --amber-ink:#FBBF24;--amber-soft:rgba(245,158,11,.16);
  --em-ink:#34D399;--em-soft:rgba(16,185,129,.16);
  --glass:rgba(11,13,14,.78);--shadow:0 1px 0 rgba(255,255,255,.03),0 24px 48px -28px rgba(0,0,0,.9);
}
.ui .font-mono{font-family:"JetBrains Mono Variable","JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
.ui .mono-label{font-family:"JetBrains Mono Variable","JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mute)}
.ui .bg-surf{background:var(--surface)}
.ui .bg-sunk{background:var(--sunk)}
.ui .bd{border-color:var(--line)}
.ui .c-ink{color:var(--ink)}
.ui .c-mute{color:var(--mute)}
.ui .c-amber{color:var(--amber-ink)}
.ui .c-em{color:var(--em-ink)}
.ui .divide-line>*+*{border-top:1px solid var(--line)}
.ui .card{background:var(--surface);border:1px solid var(--line);border-radius:24px;box-shadow:var(--shadow)}
.ui .hdr{background:var(--glass);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid transparent}
.ui .hdr-solid{border-bottom-color:var(--line)}
.ui .bar{background:var(--glass);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:var(--shadow)}
.ui button{cursor:pointer;-webkit-tap-highlight-color:transparent}
.ui button:disabled{cursor:not-allowed}
.ui :focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:8px}
.ui input:focus-visible{outline:none}

/* primary action */
.ui .cta{background:var(--cta-bg);color:var(--cta-fg);box-shadow:0 10px 24px -12px rgba(30,41,59,.6)}
.ui .cta:not(:disabled):hover{transform:translateY(-1px)}
.ui .cta:not(:disabled):active{transform:scale(.985)}
.ui .cta:disabled:not(.cta-done){opacity:.45;box-shadow:none}
.ui .cta::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.22) 50%,transparent 65%);transform:translateX(-120%);pointer-events:none}
.ui .cta:not(:disabled):hover::after{transform:translateX(120%);transition:transform .8s ease}
.ui .cta-done{background:var(--em)!important;color:#04251A!important;opacity:1!important;box-shadow:0 10px 28px -12px rgba(16,185,129,.7)}

/* scroll reveal */
.ui .reveal{opacity:0;transform:translate3d(var(--rx,0),var(--ry,28px),0);transition:opacity .75s cubic-bezier(.2,.7,.2,1),transform .85s cubic-bezier(.2,.7,.2,1)}
.ui .reveal[data-from=left]{--rx:-36px;--ry:0px}
.ui .reveal[data-from=right]{--rx:36px;--ry:0px}
.ui .reveal.in{opacity:1;transform:none}
@media (max-width:767px){.ui .reveal[data-from]{--rx:0px;--ry:28px}}

/* receipt slide-in */
.ui .rcpt-wrap{display:grid;grid-template-rows:0fr;opacity:0;transform:translateY(18px);visibility:hidden;
  transition:grid-template-rows .7s cubic-bezier(.2,.8,.2,1),opacity .5s ease,transform .7s cubic-bezier(.2,.8,.2,1),visibility 0s linear .7s}
.ui .rcpt-wrap.open{grid-template-rows:1fr;opacity:1;transform:none;visibility:visible;
  transition:grid-template-rows .7s cubic-bezier(.2,.8,.2,1),opacity .5s ease .1s,transform .7s cubic-bezier(.2,.8,.2,1),visibility 0s}
.ui .rcpt-inner{overflow:hidden;min-height:0}
.ui .paper{background:#fff;color:#111;border-radius:0 0 22px 22px;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 4px 10px -8px rgba(0,0,0,.35);margin-top:2px}
.ui .tick{opacity:0}
.ui .rcpt-wrap.open .tick{animation:pop .45s cubic-bezier(.2,1.4,.4,1) both}
.ui .pop{animation:pop .5s cubic-bezier(.2,1.5,.4,1) both}
.ui .swap{animation:swap .45s ease both}
@keyframes pop{0%{opacity:0;transform:scale(.5)}100%{opacity:1;transform:scale(1)}}
@keyframes swap{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}

@media (prefers-reduced-motion:reduce){
  .ui *,.ui *::before,.ui *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;transition-delay:0ms!important}
  .ui .reveal{opacity:1;transform:none}
  .ui .tick{opacity:1}
}

@page{margin:16mm}
@media print{
  body *{visibility:hidden}
  #receipt,#receipt *{visibility:visible}
  #receipt{position:absolute;left:0;top:0;width:100%;max-width:none;box-shadow:none!important;border-radius:0}
  .no-print{display:none!important}
}
`;
