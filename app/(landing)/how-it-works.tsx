"use client";

import React, { useState, useEffect, useCallback } from "react";

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
    fields: ["Client Name", "Phone", "Budget (SGD)", "Unit Type", "Source"],
  },
  {
    name: "Site Visit",
    color: "violet",
    fields: ["Visit Date", "Unit Number", "Agent Assigned", "Visit Notes"],
  },
  {
    name: "Offer Made",
    color: "purple",
    fields: ["Offer Price", "Payment Terms", "Decision Date", "Special Requests"],
  },
  {
    name: "Closing",
    color: "fuchsia",
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
      <div className="flex gap-3 overflow-x-auto pb-2">
        {templateStages.map((stage, i) => {
          const isActive = i === activeIdx;
          const c = colorMap[stage.color];
          return (
            <button
              key={stage.name}
              onClick={() => handleClick(i)}
              className={`min-w-[160px] flex-1 rounded-xl border p-4 text-left transition-all duration-200 ${
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
              <p className={`text-sm font-semibold mb-3 ${isActive ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>
                {stage.name}
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
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
          {active.name} — Required Fields
        </p>
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
  { name: "River Modern Sales", members: 8, template: "Property Sale", projects: 12, status: "active" as const },
  { name: "District 9 Team", members: 5, template: "Property Sale", projects: 7, status: "active" as const },
  { name: "New Development", members: 3, template: "Property Sale", projects: 2, status: "connecting" as const },
];

function GroupChatsDemo({ onInteract }: { onInteract: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">LINE Groups</p>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Connected Group Chats</h3>
      </div>

      <div className="space-y-3">
        {groups.map((g, i) => (
          <button
            key={g.name}
            onClick={() => { setSelected(i === selected ? null : i); onInteract(); }}
            className={`w-full rounded-xl border p-4 text-left transition-all duration-200 ${
              selected === i
                ? "ring-2 ring-indigo-500 border-transparent bg-white dark:bg-slate-800 shadow-md"
                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-300 dark:hover:border-indigo-500/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-500 text-white text-lg">
                💬
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{g.name}</p>
                  {g.status === "connecting" ? (
                    <span className="shrink-0 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Connecting…
                    </span>
                  ) : (
                    <span className="shrink-0 flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                      <span className="size-1.5 rounded-full bg-green-500" />
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>{g.members} members</span>
                  <span>·</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">{g.template}</span>
                  <span>·</span>
                  <span>{g.projects} projects</span>
                </div>
              </div>
            </div>
            {selected === i && g.status === "active" && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>🤖</span>
                <span>AI monitoring active — last message processed 2 minutes ago</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const chatMessages = [
  { from: "user" as const, name: "Somchai T.", text: "Hi, I'm interested in a 3-bedroom unit" },
  { from: "ai" as const, text: "Great! I'll note that. What's your target budget range?" },
  { from: "user" as const, name: "Somchai T.", text: "Around 3 million SGD, looking to move in Q3" },
  { from: "ai" as const, text: "Perfect! I've noted your budget and timeline. Can I get your phone number for follow-up?" },
  { from: "user" as const, name: "Somchai T.", text: "Sure, it's +66 81 234 5678" },
];

const extractedFields = [
  { key: "Unit Type", value: "3-Bedroom", triggerAt: 1 },
  { key: "Budget", value: "S$3,000,000", triggerAt: 3 },
  { key: "Move-in", value: "Q3 2025", triggerAt: 3 },
  { key: "Phone", value: "+66 81 234 5678", triggerAt: 5 },
  { key: "Client Name", value: "Somchai T.", triggerAt: 1 },
  { key: "Source", value: "—", triggerAt: 0 },
];

function AIChatDemo({ onInteract }: { onInteract: () => void }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    setVisible(0);
    let idx = 0;
    const next = () => {
      if (idx < chatMessages.length) {
        idx++;
        setVisible(idx);
        setTimeout(next, idx % 2 === 0 ? 1400 : 900);
      } else {
        setTimeout(() => { setVisible(0); idx = 0; setTimeout(next, 600); }, 3000);
      }
    };
    const t = setTimeout(next, 600);
    return () => clearTimeout(t);
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
            <span className="text-xs font-semibold text-green-600 dark:text-green-400">LINE</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">River Modern Sales</span>
          </div>
          <div className="p-3 space-y-2.5 min-h-[220px] bg-white dark:bg-[#0f1329]">
            {chatMessages.slice(0, visible).map((msg, i) => (
              <div key={i} className={`lb-msg-fade-in flex ${msg.from === "user" ? "justify-end" : "gap-2"}`}>
                {msg.from === "ai" && (
                  <div className="size-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-xs shrink-0 mt-auto">🤖</div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.from === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                }`}
                  style={{ borderBottomRightRadius: msg.from === "user" ? 4 : undefined, borderBottomLeftRadius: msg.from === "ai" ? 4 : undefined }}
                >
                  {msg.from === "user" && <span className="block text-[10px] text-indigo-200 mb-0.5">{msg.name}</span>}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Extracted fields panel */}
        <div className="w-full md:w-56 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Extracted Fields</span>
          </div>
          <div className="p-3 space-y-2 bg-white dark:bg-[#0f1329]">
            {extractedFields.map((f) => {
              const filled = f.triggerAt > 0 && visible >= f.triggerAt;
              return (
                <div key={f.key} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all duration-300 ${
                  filled ? "bg-green-50 dark:bg-green-500/10" : "bg-slate-50 dark:bg-slate-800/60"
                }`}>
                  <span className={filled ? "text-green-700 dark:text-green-400 font-medium" : "text-slate-400 dark:text-slate-500"}>
                    {f.key}
                  </span>
                  <span className={filled ? "text-green-600 dark:text-green-400 font-semibold" : "text-slate-300 dark:text-slate-600"}>
                    {filled ? "✓" : "—"}
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

const columns = [
  {
    name: "Initial Contact",
    cards: [
      { client: "Nida R.", progress: "5/5", complete: true, avatar: "NR", advancing: false },
      { client: "Jason W.", progress: "3/5", complete: false, avatar: "JW", advancing: false },
    ],
  },
  {
    name: "Site Visit",
    cards: [
      { client: "Somchai T.", progress: "4/4", complete: true, avatar: "ST", advancing: true },
    ],
  },
  {
    name: "Offer Made",
    cards: [
      { client: "Rachel L.", progress: "2/4", complete: false, avatar: "RL", advancing: false },
    ],
  },
  {
    name: "Closing",
    cards: [
      { client: "Aom K.", progress: "4/4", complete: true, avatar: "AK", advancing: false },
    ],
  },
];

const colColors = ["indigo", "violet", "purple", "fuchsia"];
const colBg: Record<string, string> = {
  indigo: "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  violet: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300",
  purple: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300",
  fuchsia: "bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300",
};

function ProjectPipelineDemo({ onInteract }: { onInteract: () => void }) {
  const [advancing, setAdvancing] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const handleAdvance = () => {
    if (advanced) return;
    setAdvancing(true);
    onInteract();
    setTimeout(() => {
      setAdvancing(false);
      setAdvanced(true);
    }, 1000);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Pipeline</p>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Projects auto-advance through stages</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {columns.map((col, ci) => {
          const color = colColors[ci];
          const headerClass = colBg[color];
          return (
            <div key={col.name} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className={`px-3 py-2 text-xs font-semibold ${headerClass}`}>
                {col.name}
              </div>
              <div className="p-2 space-y-2 bg-slate-50 dark:bg-slate-800/40 min-h-[140px]">
                {col.cards.map((card, ki) => {
                  const isAdvancing = card.advancing && !advanced;
                  const wasAdvanced = card.advancing && advanced;
                  if (wasAdvanced && ci === 1) return null;
                  return (
                    <button
                      key={`${ci}-${ki}`}
                      onClick={card.advancing ? handleAdvance : onInteract}
                      className={`w-full rounded-lg border p-2.5 text-left transition-all duration-300 bg-white dark:bg-slate-800 ${
                        isAdvancing
                          ? "border-indigo-400 dark:border-indigo-500 shadow-md shadow-indigo-500/20 animate-pulse"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                          ci === 0 ? "bg-indigo-500" : ci === 1 ? "bg-violet-500" : ci === 2 ? "bg-purple-500" : "bg-fuchsia-500"
                        }`}>
                          {card.avatar}
                        </div>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{card.client}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{card.progress} fields</span>
                        {card.complete && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">✓ Done</span>
                        )}
                      </div>
                      {isAdvancing && (
                        <div className="mt-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-indigo-500 animate-ping" />
                          Click to advance →
                        </div>
                      )}
                    </button>
                  );
                })}
                {/* Show advanced card in next column */}
                {advanced && ci === 2 && (
                  <div className="w-full rounded-lg border border-indigo-300 dark:border-indigo-500 p-2.5 bg-indigo-50 dark:bg-indigo-500/10">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="size-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-violet-500">ST</div>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Somchai T.</span>
                    </div>
                    <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">↑ Just advanced!</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
  },
  {
    field: "Offer price follow-up",
    project: "Rachel L. — District 9",
    role: "Sales Lead",
    time: "Tomorrow, 10:00 AM",
    status: "scheduled" as const,
  },
  {
    field: "Sign date reminder",
    project: "Aom K. — River Modern",
    role: "Agent",
    time: "Sent 1h ago",
    status: "sent" as const,
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
              className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              <div className={`size-2.5 shrink-0 rounded-full ${cfg.dot}`} />
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
  const [interactionTimer, setInteractionTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUserInteraction = useCallback(() => {
    setIsPaused(true);
    if (interactionTimer) clearTimeout(interactionTimer);
    const t = setTimeout(() => {
      setIsPaused(false);
      setProgress(0);
    }, INTERACTION_PAUSE_MS);
    setInteractionTimer(t);
  }, [interactionTimer]);

  // Progress bar + auto-advance
  useEffect(() => {
    if (isPaused) return;
    setProgress(0);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / AUTO_ADVANCE_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setActiveStage((s) => (s + 1) % STAGES.length);
        setProgress(0);
      }
    }, 50);
    return () => clearInterval(interval);
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
        {!isPaused && (
          <div className="mb-8 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-600 transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {isPaused && (
          <div className="mb-8 flex items-center justify-center gap-2 text-xs text-slate-400">
            <span>⏸</span> Paused — auto-resumes after inactivity
          </div>
        )}

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
