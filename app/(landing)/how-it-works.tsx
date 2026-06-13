"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

const STAGES = [
  { id: 0, label: "Build Template", icon: "📋" },
  { id: 1, label: "Connect Groups", icon: "💬" },
  { id: 2, label: "AI Extracts Data", icon: "🤖" },
  { id: 3, label: "Projects Advance", icon: "🚀" },
  { id: 4, label: "Smart Reminders", icon: "⏰" },
];

const STAGE_DESCRIPTIONS = [
  "Define your sales workflow once. Create stages with required fields — names, dates, budgets, preferences. No coding needed.",
  "Connect your LINE Official Account to group chats. Each group becomes its own pipeline with real-time AI monitoring.",
  "Customers chat naturally. LeadMighty's AI reads every message and automatically extracts the data into your workflow fields.",
  "When all fields in a stage are filled, the project advances automatically. Your dashboard shows every deal's exact status.",
  "Configure intelligent reminders per field and stage. The right team member gets notified at exactly the right time.",
];

const AUTO_ADVANCE_MS = 7000;
const INTERACTION_PAUSE_MS = 10000;

// ─── Sub-components ────────────────────────────────────────────────────────────

const templateStages = [
  {
    name: "Initial Contact",
    color: "indigo",
    description: "Capture lead details, budget, and unit preference from the first conversation.",
    fields: ["Client Name", "Phone", "Budget (SGD)", "Unit Type", "Source"],
  },
  {
    name: "Site Visit",
    color: "violet",
    description: "Schedule and confirm the property viewing, assign the right agent.",
    fields: ["Visit Date", "Unit Number", "Agent Assigned", "Visit Notes"],
  },
  {
    name: "Offer Made",
    color: "purple",
    description: "Record the formal offer, payment structure, and decision timeline.",
    fields: ["Offer Price", "Payment Terms", "Decision Date", "Special Requests"],
  },
  {
    name: "Closing",
    color: "fuchsia",
    description: "Finalize the deal — signing date, lawyer, commission, and handover.",
    fields: ["Sign Date", "Commission %", "Lawyer Assigned", "Handover Date"],
  },
];

const colorMap: Record<string, { ring: string; bg: string; text: string; chip: string }> = {
  indigo: {
    ring: "ring-indigo-500",
    bg: "bg-indigo-600",
    text: "text-white",
    chip: "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  },
  violet: {
    ring: "ring-violet-500",
    bg: "bg-violet-600",
    text: "text-white",
    chip: "bg-violet-50 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300",
  },
  purple: {
    ring: "ring-purple-500",
    bg: "bg-purple-600",
    text: "text-white",
    chip: "bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300",
  },
  fuchsia: {
    ring: "ring-fuchsia-500",
    bg: "bg-fuchsia-600",
    text: "text-white",
    chip: "bg-fuchsia-50 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300",
  },
};

function TemplateBuilderDemo({ onInteract }: { onInteract: () => void }) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActiveIdx((i) => (i + 1) % templateStages.length);
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const handleClick = (i: number) => {
    setActiveIdx(i);
    onInteract();
  };

  const active = templateStages[activeIdx];
  const colors = colorMap[active.color];

  return (
    <div className="p-6 md:p-8">
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Template</p>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Property Sale Workflow</h3>
        </div>
        <span className="rounded-full bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
          4 stages
        </span>
      </div>

      {/* Stage cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {templateStages.map((stage, i) => {
          const isActive = i === activeIdx;
          const c = colorMap[stage.color];
          return (
            <button
              key={stage.name}
              onClick={() => handleClick(i)}
              className={`rounded-xl border p-4 text-left transition-all duration-200 ${
                isActive
                  ? `ring-2 ${c.ring} border-transparent bg-white dark:bg-slate-800 shadow-lg`
                  : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? `${c.bg} text-white` : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{stage.fields.length} fields</span>
              </div>
              <p className={`text-sm font-semibold mb-1 ${isActive ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>
                {stage.name}
              </p>
              <p className={`text-[10px] leading-relaxed mb-2.5 ${isActive ? "text-slate-500 dark:text-slate-400" : "text-slate-400 dark:text-slate-600"}`}>
                {stage.description}
              </p>
              <div className="flex flex-wrap gap-1">
                {stage.fields.slice(0, 3).map((f) => (
                  <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded ${isActive ? c.chip : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-500"}`}>
                    {f}
                  </span>
                ))}
                {stage.fields.length > 3 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400">
                    +{stage.fields.length - 3}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <div className={`mt-4 rounded-xl p-4 ring-1 ${colors.ring} bg-white dark:bg-slate-800/60`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              {active.name} — Required Fields
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">
              {active.description}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {active.fields.map((f) => (
            <span key={f} className={`text-xs px-2.5 py-1 rounded-full font-medium ${colors.chip}`}>
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const groups = [
  {
    name: "River Modern Sales",
    emoji: "🏙️",
    avatarBg: "linear-gradient(135deg,#6366f1,#8b5cf6)",
    members: 8,
    template: "Property Sale",
    projects: 12,
    status: "active" as const,
    lastMsg: "AI processed 3 fields · 2 min ago",
    participants: [
      { initials: "ST", bg: "#6366f1" },
      { initials: "NR", bg: "#8b5cf6" },
      { initials: "RL", bg: "#7c3aed" },
      { initials: "JW", bg: "#0ea5e9" },
      { initials: "+4", bg: "#94a3b8" },
    ],
  },
  {
    name: "District 9 Closing",
    emoji: "🏢",
    avatarBg: "linear-gradient(135deg,#7c3aed,#a855f7)",
    members: 5,
    template: "Property Sale",
    projects: 7,
    status: "active" as const,
    lastMsg: "Stage 3 fields complete · 15 min ago",
    participants: [
      { initials: "AK", bg: "#7c3aed" },
      { initials: "WP", bg: "#f59e0b" },
      { initials: "RL", bg: "#ec4899" },
      { initials: "+2", bg: "#94a3b8" },
    ],
  },
  {
    name: "New Development",
    emoji: "🏗️",
    avatarBg: "linear-gradient(135deg,#94a3b8,#64748b)",
    members: 3,
    template: "Property Sale",
    projects: 2,
    status: "pending" as const,
    lastMsg: "Ready to connect",
    participants: [
      { initials: "BK", bg: "#0ea5e9" },
      { initials: "PL", bg: "#f59e0b" },
      { initials: "SR", bg: "#8b5cf6" },
    ],
  },
];

type ConnectState = "idle" | "connecting" | "connected";

function GroupChatsDemo({ onInteract }: { onInteract: () => void }) {
  const [selected, setSelected] = useState<number | null>(0);
  const [connectState, setConnectState] = useState<ConnectState>("idle");

  const handleConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (connectState !== "idle") return;
    setConnectState("connecting");
    onInteract();
    setTimeout(() => setConnectState("connected"), 2200);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">LINE Groups</p>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Connected Group Chats</h3>
      </div>

      <div className="space-y-3">
        {groups.map((g, i) => {
          const isSelected = selected === i;
          const isPending = g.status === "pending";
          return (
            <div
              key={g.name}
              role="button"
              tabIndex={0}
              onClick={() => { setSelected(i === selected ? null : i); onInteract(); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelected(i === selected ? null : i); onInteract(); } }}
              className={`w-full rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "ring-2 ring-indigo-500 border-transparent bg-white dark:bg-slate-800 shadow-md"
                  : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-300 dark:hover:border-indigo-500/50"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Group picture */}
                <div
                  className="size-11 shrink-0 rounded-xl flex items-center justify-center text-xl shadow-sm"
                  style={{ background: g.avatarBg }}
                >
                  {g.emoji}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{g.name}</p>
                    {/* Status / Connect button */}
                    {isPending ? (
                      <button
                        onClick={handleConnect}
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-300 ${
                          connectState === "idle"
                            ? "bg-indigo-600 text-white hover:bg-indigo-700"
                            : connectState === "connecting"
                            ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center gap-1.5"
                            : "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 flex items-center gap-1"
                        }`}
                      >
                        {connectState === "idle" && "Connect"}
                        {connectState === "connecting" && (
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
                            Connecting…
                          </span>
                        )}
                        {connectState === "connected" && (
                          <span className="flex items-center gap-1">
                            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                            Connected
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="shrink-0 flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                        <span className="size-1.5 rounded-full bg-green-500" />
                        Active
                      </span>
                    )}
                  </div>

                  {/* Participant avatars + meta */}
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      {g.participants.map((p, pi) => (
                        <div
                          key={pi}
                          className="size-5 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ background: p.bg }}
                        >
                          {p.initials}
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {g.members} members · <span className="text-indigo-600 dark:text-indigo-400 font-medium">{g.template}</span> · {g.projects} projects
                    </span>
                  </div>
                </div>
              </div>

              {isSelected && !isPending && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="size-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                  <span>AI monitoring active — {g.lastMsg}</span>
                </div>
              )}
              {isSelected && isPending && connectState === "connected" && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                  <span className="size-1.5 rounded-full bg-green-500 shrink-0" />
                  <span>AI monitoring started — listening for new messages</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const GROUP_COLORS: Record<string, { bg: string; initials: string }> = {
  "Somchai T.": { bg: "#6366f1", initials: "ST" },
  "Nida R.":    { bg: "#8b5cf6", initials: "NR" },
};

const chatMessages = [
  { from: "user" as const, name: "Somchai T.", text: "Hi, I'm interested in a 3-bedroom unit" },
  { from: "user" as const, name: "Nida R.", text: "Same here! Any 2BR units available?" },
  { from: "ai" as const, text: "Great! I've noted Somchai (3BR) and Nida (2BR). What's your budget, Somchai?" },
  { from: "user" as const, name: "Somchai T.", text: "Around 3 million SGD, looking to move in Q3" },
  { from: "ai" as const, text: "Budget and timeline saved! Can I get your phone number, Somchai?" },
  { from: "user" as const, name: "Somchai T.", text: "Sure, it's +66 81 234 5678" },
];

const extractedFields = [
  { key: "Unit Type", value: "3-Bedroom", triggerAt: 1 },
  { key: "Budget", value: "S$3,000,000", triggerAt: 4 },
  { key: "Move-in", value: "Q3 2025", triggerAt: 4 },
  { key: "Phone", value: "+66 81 234 5678", triggerAt: 6 },
  { key: "Client Name", value: "Somchai T.", triggerAt: 1 },
  { key: "Source", value: "—", triggerAt: 0 },
];

function AIChatDemo({ onInteract }: { onInteract: () => void }) {
  const [visible, setVisible] = useState(0);
  const [justFilled, setJustFilled] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setVisible(0);
    setJustFilled(new Set());
    let idx = 0;
    let scanTimer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (idx < chatMessages.length) {
        idx++;
        const newVis = idx;
        setVisible(newVis);
        setScanning(true);
        scanTimer = setTimeout(() => {
          setScanning(false);
          const newFields = extractedFields.filter(
            (f) => f.triggerAt > 0 && newVis >= f.triggerAt && newVis - 1 < f.triggerAt
          );
          if (newFields.length > 0) {
            setJustFilled(new Set(newFields.map((f) => f.key)));
            setTimeout(() => setJustFilled(new Set()), 900);
          }
        }, 600);
        setTimeout(next, idx % 2 === 0 ? 1400 : 900);
      } else {
        setTimeout(() => {
          setVisible(0);
          setJustFilled(new Set());
          idx = 0;
          setTimeout(next, 600);
        }, 3000);
      }
    };
    const t = setTimeout(next, 600);
    return () => { clearTimeout(t); clearTimeout(scanTimer); };
  }, []);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Live Extraction</p>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">AI reads conversations in real time</h3>
      </div>

      <div className="flex gap-4 flex-col md:flex-row" onMouseMove={onInteract}>
        {/* Chat panel */}
        <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2">
            <div className="flex -space-x-1.5 mr-1">
              {["#6366f1","#8b5cf6"].map((c, i) => (
                <div key={i} className="size-4 rounded-full border-2 border-slate-50 dark:border-slate-800" style={{ background: c }} />
              ))}
            </div>
            <span className="text-xs font-semibold text-green-600 dark:text-green-400">LINE</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">River Modern Sales · 8 members</span>
          </div>
          <div className="p-3 space-y-2 min-h-[220px] bg-white dark:bg-[#0f1329]">
            {chatMessages.slice(0, visible).map((msg, i) => {
              const participant = msg.name ? GROUP_COLORS[msg.name] : null;
              return (
                <div key={i} className="lb-msg-fade-in flex gap-2">
                  {msg.from === "ai" ? (
                    <div className="size-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-xs shrink-0 mt-auto">🤖</div>
                  ) : (
                    <div
                      className="size-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-auto"
                      style={{ background: participant?.bg ?? "#6366f1" }}
                    >
                      {participant?.initials ?? "?"}
                    </div>
                  )}
                  <div className="max-w-[75%]">
                    {msg.from === "user" && msg.name && (
                      <p className="text-[10px] font-semibold mb-0.5" style={{ color: participant?.bg ?? "#6366f1" }}>{msg.name}</p>
                    )}
                    <div
                      className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        msg.from === "user"
                          ? "bg-indigo-50 dark:bg-[#1e2448] text-slate-800 dark:text-slate-200 border border-indigo-100 dark:border-indigo-500/20"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                      }`}
                      style={{ borderBottomLeftRadius: 4 }}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Extracted fields panel */}
        <div className="w-full md:w-60 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2">
            {scanning ? (
              <>
                <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Scanning…</span>
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Extracted Fields</span>
              </>
            )}
          </div>
          <div className="p-3 space-y-1.5 bg-white dark:bg-[#0f1329]">
            {extractedFields.map((f) => {
              const filled = f.triggerAt > 0 && visible >= f.triggerAt;
              const isNew = justFilled.has(f.key);
              return (
                <div
                  key={f.key}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all duration-300 ${
                    filled
                      ? isNew
                        ? "bg-green-100 dark:bg-green-500/20 ring-1 ring-green-400 dark:ring-green-500 scale-[1.02]"
                        : "bg-green-50 dark:bg-green-500/10"
                      : "bg-slate-50 dark:bg-slate-800/60"
                  }`}
                >
                  <span className={`truncate mr-2 ${filled ? "text-green-700 dark:text-green-400 font-medium" : "text-slate-400 dark:text-slate-500"}`}>
                    {f.key}
                  </span>
                  <span className={`shrink-0 font-medium ${filled ? "text-green-700 dark:text-green-300" : "text-slate-300 dark:text-slate-600"}`}>
                    {filled ? (
                      <span className={`text-[10px] ${isNew ? "font-bold" : ""}`}>{f.value}</span>
                    ) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const pipelineColumns = [
  {
    name: "Initial Contact",
    color: "indigo",
    headerBg: "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
    cards: [
      { project: "River Modern #8", desc: "3BR unit, S$3M budget, Q3 move-in", progress: 5, total: 5, complete: true, dot: "#6366f1", advancing: false },
      { project: "Lakewood Unit 2A", desc: "2BR resale, investor buyer", progress: 3, total: 5, complete: false, dot: "#8b5cf6", advancing: false },
    ],
  },
  {
    name: "Site Visit",
    color: "violet",
    headerBg: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300",
    cards: [
      { project: "District 9 #12B", desc: "High-end unit, all fields complete", progress: 4, total: 4, complete: true, dot: "#7c3aed", advancing: true },
    ],
  },
  {
    name: "Offer Made",
    color: "purple",
    headerBg: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300",
    cards: [
      { project: "Bayview Condo #5C", desc: "Offer submitted, awaiting decision", progress: 2, total: 4, complete: false, dot: "#a855f7", advancing: false },
    ],
  },
  {
    name: "Closing",
    color: "fuchsia",
    headerBg: "bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300",
    cards: [
      { project: "One Pearl Bank #31A", desc: "Signing date confirmed, lawyer assigned", progress: 4, total: 4, complete: true, dot: "#d946ef", advancing: false },
    ],
  },
];

function ProjectPipelineDemo({ onInteract }: { onInteract: () => void }) {
  const [advanced, setAdvanced] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  // Auto-advance after 2.5s, then reset after 3s more (loop)
  useEffect(() => {
    const t1 = setTimeout(() => {
      setAdvancing(true);
      onInteract();
    }, 2500);
    return () => clearTimeout(t1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanced]);

  useEffect(() => {
    if (!advancing) return;
    const t = setTimeout(() => {
      setAdvancing(false);
      setAdvanced(true);
    }, 900);
    return () => clearTimeout(t);
  }, [advancing]);

  useEffect(() => {
    if (!advanced) return;
    const t = setTimeout(() => setAdvanced(false), 3500);
    return () => clearTimeout(t);
  }, [advanced]);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Pipeline</p>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Projects auto-advance through stages</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {pipelineColumns.map((col, ci) => (
          <div key={col.name} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className={`px-3 py-2 text-xs font-semibold ${col.headerBg}`}>
              {col.name}
            </div>
            <div className="p-2 space-y-2 bg-slate-50 dark:bg-slate-800/40 min-h-[150px]">
              {col.cards.map((card, ki) => {
                const isAdvancing = card.advancing && advancing;
                const wasAdvanced = card.advancing && advanced;
                if (wasAdvanced && ci === 1) return null;
                const pct = Math.round((card.progress / card.total) * 100);
                return (
                  <div
                    key={`${ci}-${ki}`}
                    className={`rounded-lg border p-2.5 transition-all duration-500 bg-white dark:bg-slate-800 ${
                      isAdvancing
                        ? "border-violet-400 dark:border-violet-500 shadow-lg shadow-violet-500/20 scale-[1.02]"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {/* Project header */}
                    <div className="flex items-start gap-2 mb-2">
                      <div
                        className="size-2 rounded-full shrink-0 mt-1.5"
                        style={{ background: card.dot }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">
                          {card.project}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed mt-0.5">
                          {card.desc}
                        </p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: card.dot }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                        {card.progress}/{card.total}
                      </span>
                      {card.complete && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold shrink-0">✓</span>
                      )}
                    </div>
                    {isAdvancing && (
                      <div className="mt-1.5 text-[10px] text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1">
                        <span className="size-1 rounded-full bg-violet-500 animate-ping" />
                        Advancing…
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Card appearing in next column after advance */}
              {advanced && ci === 2 && (
                <div className="lb-msg-fade-in rounded-lg border border-violet-300 dark:border-violet-500/60 p-2.5 bg-violet-50 dark:bg-violet-500/10">
                  <div className="flex items-start gap-2 mb-1.5">
                    <div className="size-2 rounded-full shrink-0 mt-1.5 bg-violet-500" />
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      District 9 #12B
                    </p>
                  </div>
                  <p className="text-[10px] text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1 pl-3.5">
                    <svg className="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    Just advanced to Offer Made
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const reminders = [
  {
    field: "Visit Date confirmation",
    project: "Somchai T. — River Modern",
    role: "Agent",
    time: "Today, 2:00 PM",
    status: "pending" as const,
    message: "@Somchai T. Hi! Please confirm your site visit scheduled for today at 2:00 PM. Reply YES to confirm or let us know another time. 🏠",
  },
  {
    field: "Offer price follow-up",
    project: "Rachel L. — District 9",
    role: "Sales Lead",
    time: "Tomorrow, 10:00 AM",
    status: "scheduled" as const,
    message: "@Rachel L. Following up on your offer for District 9 Unit #12B. Please provide your final offer price so we can proceed. Thank you!",
  },
  {
    field: "Sign date reminder",
    project: "Aom K. — River Modern",
    role: "Agent",
    time: "Sent 1h ago",
    status: "sent" as const,
    message: "@Aom K. Reminder: Your signing date for River Modern is approaching. Please confirm the date with your lawyer so we can finalise the paperwork. 📋",
  },
];

const reminderStatusConfig = {
  pending: {
    dot: "bg-amber-500 animate-pulse",
    badge: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
    label: "Pending",
  },
  scheduled: {
    dot: "bg-indigo-500",
    badge: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    label: "Scheduled",
  },
  sent: {
    dot: "bg-green-500",
    badge: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400",
    label: "Sent ✓",
  },
};

function RemindersDemo({ onInteract }: { onInteract: () => void }) {
  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Reminders</p>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Smart reminders for every field and stage</h3>
      </div>

      <div className="space-y-3" onMouseMove={onInteract}>
        {reminders.map((r, i) => {
          const cfg = reminderStatusConfig[r.status];
          return (
            <div
              key={i}
              className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`size-2.5 shrink-0 rounded-full mt-1.5 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.field}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.project}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                    <span>👤 {r.role}</span>
                    <span>·</span>
                    <span>🕐 {r.time}</span>
                  </div>
                  {/* LINE message preview */}
                  <div className={`mt-3 rounded-lg border p-2.5 ${
                    r.status === "sent"
                      ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-[10px] font-bold ${r.status === "sent" ? "text-green-600 dark:text-green-400" : "text-slate-500 dark:text-slate-400"}`}>
                        LINE
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {r.status === "sent" ? "message sent" : r.status === "scheduled" ? "will send" : "ready to send"}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{r.message}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            + Reminders fire automatically when fields become due
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default function HowItWorksDemo() {
  const [activeStage, setActiveStage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUserInteraction = useCallback(() => {
    setIsPaused(true);
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(() => {
      setIsPaused(false);
    }, INTERACTION_PAUSE_MS);
  }, []);

  // Smooth progress bar via requestAnimationFrame — no React state updates per frame
  useEffect(() => {
    if (isPaused) {
      if (progressBarRef.current) progressBarRef.current.style.width = "0%";
      return;
    }
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min((elapsed / AUTO_ADVANCE_MS) * 100, 100);
      if (progressBarRef.current) progressBarRef.current.style.width = `${pct}%`;
      if (pct < 100) {
        raf = requestAnimationFrame(tick);
      } else {
        setActiveStage((s) => (s + 1) % STAGES.length);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeStage, isPaused]);

  return (
    <section id="how-it-works" className="lm-section-alt py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section heading */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest lm-label">How It Works</p>
          <h2 className="text-3xl font-extrabold lm-h1 sm:text-4xl">See LeadMighty in action</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg lm-body">
            A guided walkthrough of the entire workflow — from setup to closed deal.
          </p>
        </div>

        {/* Stage tabs */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {STAGES.map((stage) => (
            <button
              key={stage.id}
              onClick={() => {
                setActiveStage(stage.id);
                handleUserInteraction();
              }}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeStage === stage.id
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>{stage.icon}</span>
              <span className="hidden sm:inline">{stage.label}</span>
              <span className="sm:hidden">{stage.id + 1}</span>
            </button>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          {!isPaused ? (
            <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div ref={progressBarRef} className="h-full rounded-full bg-indigo-600" style={{ width: "0%" }} />
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 h-1">
              <span>⏸</span> Paused — auto-resumes after inactivity
            </div>
          )}
        </div>

        {/* Demo panel */}
        <div className="overflow-hidden rounded-2xl lm-card shadow-xl">
          {activeStage === 0 && <TemplateBuilderDemo onInteract={handleUserInteraction} />}
          {activeStage === 1 && <GroupChatsDemo onInteract={handleUserInteraction} />}
          {activeStage === 2 && <AIChatDemo onInteract={handleUserInteraction} />}
          {activeStage === 3 && <ProjectPipelineDemo onInteract={handleUserInteraction} />}
          {activeStage === 4 && <RemindersDemo onInteract={handleUserInteraction} />}
        </div>

        {/* Stage description */}
        <div className="mt-6 text-center">
          <p className="text-sm lm-body">{STAGE_DESCRIPTIONS[activeStage]}</p>
        </div>
      </div>
    </section>
  );
}
