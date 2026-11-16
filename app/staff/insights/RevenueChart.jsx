"use client";

import { useState } from "react";

// Stacked revenue bars by channel, one bar per period bucket.
// Colours: validated categorical slots 1-2 (blue = POS, orange = Portal).
const SERIES = [
  { key: "pos", label: "POS (ERP)", color: "#2a78d6" },
  { key: "portal", label: "Portal orders", color: "#eb6834" },
];
const K = (n) => `K${Math.round(n).toLocaleString("en-ZM")}`;

function niceMax(v) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export default function RevenueChart({ data, bucket }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 240, L = 56, R = 12, T = 12, B = 30;
  const totals = data.map((d) => d.pos + d.portal);
  const max = niceMax(Math.max(0, ...totals));
  const n = data.length || 1;
  const slot = (W - L - R) / n;
  const bw = Math.max(3, Math.min(36, slot * 0.62));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const fmtLabel = (d) => {
    const dt = new Date(d);
    if (bucket === "month") return dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const every = Math.ceil(n / 8);
  const empty = totals.every((t) => t === 0);

  return (
    <div className="chart">
      <div className="legend">
        {SERIES.map((s) => (
          <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue by period and channel" style={{ width: "100%", height: "auto", display: "block" }}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e8ebf1" strokeWidth="1" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5f6a86">{K(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = L + slot * i + (slot - bw) / 2;
            const posH = y(0) - y(d.pos);
            const porH = y(0) - y(d.portal);
            const gap = d.pos > 0 && d.portal > 0 ? 2 : 0;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
                <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill={hover === i ? "#f4f6fa" : "transparent"} />
                {d.pos > 0 && <rect x={x} y={y(d.pos)} width={bw} height={Math.max(1, posH)} fill={SERIES[0].color} rx="2" />}
                {d.portal > 0 && <rect x={x} y={y(d.pos + d.portal)} width={bw} height={Math.max(1, porH - gap)} fill={SERIES[1].color} rx="2" />}
                {i % every === 0 && (
                  <text x={L + slot * i + slot / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#5f6a86">{fmtLabel(d.start)}</text>
                )}
              </g>
            );
          })}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#c9cfdb" strokeWidth="1" />
        </svg>
        {hover != null && data[hover] && (
          <div className="tip" style={{ left: `${((L + slot * hover + slot / 2) / W) * 100}%` }}>
            <b>{fmtLabel(data[hover].start)}{bucket === "week" ? " (week)" : ""}</b>
            <span><i style={{ background: SERIES[0].color }} />POS {K(data[hover].pos)}</span>
            <span><i style={{ background: SERIES[1].color }} />Portal {K(data[hover].portal)}</span>
            <span>{data[hover].tx} sale{data[hover].tx === 1 ? "" : "s"} · {K(data[hover].pos + data[hover].portal)}</span>
          </div>
        )}
        {empty && <div className="chart-empty">No sales in this period</div>}
      </div>
    </div>
  );
}
