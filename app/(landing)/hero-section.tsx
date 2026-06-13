"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { HeroHeader } from "./header";
import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

// ─── Shared data ──────────────────────────────────────────────────────────────

const PARTICIPANT_COLORS: Record<string, { bg: string; initials: string }> = {
  "Somchai T.": { bg: "#6366f1", initials: "ST" },
  "Nida R.":    { bg: "#8b5cf6", initials: "NR" },
  "Rachel L.":  { bg: "#7c3aed", initials: "RL" },
  "Jason W.":   { bg: "#0ea5e9", initials: "JW" },
};

type GroupMessage = { from: "user" | "ai"; name?: string; text: string };
type GroupChat    = { name: string; members: number; messages: GroupMessage[] };

const groupChats: GroupChat[] = [
  {
    name: "River Modern Sales",
    members: 8,
    messages: [
      { from: "user", name: "Somchai T.", text: "Hi, is the 3BR unit near MRT?" },
      { from: "ai",   text: "Yes! River Modern is 2 min from Great World MRT. Early-bird pricing until Friday!" },
      { from: "user", name: "Nida R.",    text: "I'm also looking — any 2BR left?" },
      { from: "ai",   text: "Noted! Somchai (3BR) and Nida (2BR). Want Saturday viewings? Saved your details ✅" },
      { from: "user", name: "Somchai T.", text: "Saturday 10am works for me!" },
      { from: "ai",   text: "Booked! Both viewings confirmed. All fields auto-filled 🎉" },
    ],
  },
  {
    name: "District 9 Closing",
    members: 5,
    messages: [
      { from: "user", name: "Rachel L.", text: "What's the latest offer for unit 12B?" },
      { from: "ai",   text: "Current offer is S$1.8M. Decision deadline is this Friday." },
      { from: "user", name: "Jason W.",  text: "Can we adjust the payment terms?" },
      { from: "ai",   text: "Logged! Revised terms prepared for review. Stage 3 fields updated ✅" },
    ],
  },
];

const groupList = [
  { name: "River Modern Sales", members: 8,  active: true },
  { name: "District 9 Closing", members: 5,  active: true },
  { name: "AI Sales Cohort",    members: 12, active: true },
  { name: "New Dev Launch",     members: 3,  active: false },
];

// ─── CRM data ─────────────────────────────────────────────────────────────────

const crmProjects = [
  { name: "River Modern #8",     group: "River Modern Sales", stage: "Site Visit",      stageIdx: 1, badge: "Active",  badgeColor: "#22c55e" },
  { name: "District 9 #12B",    group: "District 9 Closing", stage: "Offer Made",      stageIdx: 2, badge: "Hot",     badgeColor: "#f59e0b" },
  { name: "Bayview Condo #5C",  group: "Bayview Team Chat",  stage: "Initial Contact", stageIdx: 0, badge: "New",     badgeColor: "#6366f1" },
  { name: "One Pearl Bank #31A", group: "OPB Group",          stage: "Closing",         stageIdx: 3, badge: "Closing", badgeColor: "#8b5cf6" },
];

const stageLabels = ["Initial Contact", "Site Visit", "Offer Made", "Closing"];

const crmFields = [
  { label: "Client Name",    value: "Somchai Thanakit",   filled: true  },
  { label: "Phone",          value: "+66 81 234 5678",    filled: true  },
  { label: "Budget",         value: "S$3,000,000",        filled: true  },
  { label: "Unit Type",      value: "3-Bedroom",          filled: true  },
  { label: "Visit Date",     value: "Sat, Jul 12",        filled: true  },
  { label: "Agent Assigned", value: "Sarah K.",           filled: true  },
  { label: "Visit Notes",    value: "Prefers high floor", filled: true  },
  { label: "Decision Date",  value: "—",                  filled: false },
];

// ─── Mockup card shared constants — now use CSS custom properties for theme awareness ──

const CARD_STYLE: React.CSSProperties = {
  background:   "var(--mc-card-bg)",
  border:       "1px solid var(--mc-card-bd)",
  boxShadow:    "var(--mc-card-shadow)",
  borderRadius: 16,
  overflow:     "hidden",
};
const CHROME_STYLE: React.CSSProperties = {
  background:   "var(--mc-chrome-bg)",
  borderBottom: "1px solid var(--mc-chrome-bd)",
};
const SIDEBAR_STYLE: React.CSSProperties = {
  background:  "var(--mc-sidebar-bg)",
  borderRight: "1px solid var(--mc-sidebar-bd)",
};
const FOOTER_STYLE: React.CSSProperties = {
  background: "var(--mc-chrome-bg)",
  borderTop:  "1px solid var(--mc-chrome-bd)",
};

function WindowChrome({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5" style={CHROME_STYLE}>
      <div className="flex gap-1.5">
        {(["#ef4444", "#eab308", "#22c55e"] as const).map((c, i) => (
          <div key={i} className="size-2.5 rounded-full" style={{ background: c, opacity: 0.7 }} />
        ))}
      </div>
      <div
        className="mx-auto flex items-center gap-1.5 rounded-md px-3 py-0.5 text-xs"
        style={{ background: "var(--mc-field-bg)", color: "var(--mc-text-url)" }}
      >
        🔒 {url}
      </div>
    </div>
  );
}

// ─── Tab 1: Group Chat ────────────────────────────────────────────────────────

function GroupChatTab() {
  const [groupIdx, setGroupIdx]       = useState(0);
  const [visibleMsgs, setVisibleMsgs] = useState(0);
  const [showTyping, setShowTyping]   = useState(false);

  useEffect(() => {
    setVisibleMsgs(0);
    setShowTyping(false);
    const group = groupChats[groupIdx];
    let idx = 0;

    const reveal = () => {
      if (idx >= group.messages.length) {
        setTimeout(() => setGroupIdx((g) => (g + 1) % groupChats.length), 2500);
        return;
      }
      const msg = group.messages[idx];
      if (msg.from === "ai") {
        setShowTyping(true);
        setTimeout(() => {
          setShowTyping(false);
          setVisibleMsgs(idx + 1);
          idx++;
          setTimeout(reveal, 1000);
        }, 1200);
      } else {
        setVisibleMsgs(idx + 1);
        idx++;
        setTimeout(reveal, 900);
      }
    };

    const t = setTimeout(reveal, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdx]);

  const group = groupChats[groupIdx];

  return (
    <div style={CARD_STYLE}>
      <WindowChrome url="leadmighty.app/dashboard" />

      <div className="flex" style={{ minHeight: 360 }}>
        {/* Groups sidebar */}
        <div className="w-40 shrink-0 py-2.5" style={SIDEBAR_STYLE}>
          <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--mc-text-label)" }}>
            Groups
          </p>
          {groupList.map((g) => {
            const cur = g.name === group.name;
            return (
              <div
                key={g.name}
                className="px-3 py-2 mx-1 rounded-lg mb-0.5"
                style={{ background: cur ? "var(--mc-group-sel)" : "transparent" }}
              >
                <p
                  className="text-[11px] font-medium truncate leading-tight"
                  style={{ color: cur ? "var(--mc-group-sel-t)" : "var(--mc-group-off-t)", maxWidth: 100 }}
                >
                  {g.name}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: g.active ? (cur ? "#86efac" : "#22c55e") : "var(--mc-dot-off)" }}
                  />
                  <span className="text-[9px]" style={{ color: "var(--mc-text-muted)" }}>
                    {g.members} members
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chat area */}
        <div className="flex flex-1 flex-col" style={{ background: "var(--mc-chat-bg)" }}>
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: "1px solid var(--mc-chrome-bd)" }}
          >
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                {(["#6366f1", "#8b5cf6", "#7c3aed"] as const).map((c, i) => (
                  <div
                    key={i}
                    className="size-5 rounded-full border-2 flex items-center justify-center text-[7px] font-bold text-white"
                    style={{ background: c, borderColor: "var(--mc-chat-bg)" }}
                  >
                    {["ST", "NR", "RL"][i]}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-semibold leading-tight" style={{ color: "var(--mc-text-primary)" }}>
                  {group.name}
                </p>
                <p className="text-[9px]" style={{ color: "var(--mc-text-sec)" }}>
                  {groupList.find((g) => g.name === group.name)?.members} members
                </p>
              </div>
            </div>
            <div
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
              style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
            >
              <span className="size-1.5 rounded-full bg-green-400 animate-pulse" />
              AI Active
            </div>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-2 px-3 py-3 overflow-hidden">
            {group.messages.slice(0, visibleMsgs).map((msg, i) => {
              const p = msg.name ? PARTICIPANT_COLORS[msg.name] : null;
              return (
                <div key={`${groupIdx}-${i}`} className="lb-msg-fade-in flex gap-1.5">
                  {msg.from === "ai" ? (
                    <div
                      className="mt-auto size-5 shrink-0 rounded-full flex items-center justify-center text-[10px]"
                      style={{ background: "var(--mc-ai-icon-bg)" }}
                    >
                      🤖
                    </div>
                  ) : (
                    <div
                      className="mt-auto size-5 shrink-0 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                      style={{ background: p?.bg ?? "#6366f1" }}
                    >
                      {p?.initials ?? "?"}
                    </div>
                  )}
                  <div className="max-w-[76%]">
                    {msg.from === "user" && msg.name && (
                      <p className="text-[9px] font-semibold mb-0.5" style={{ color: p?.bg ?? "#6366f1" }}>
                        {msg.name}
                      </p>
                    )}
                    <div
                      className="rounded-2xl px-3 py-1.5 text-[11px] leading-relaxed"
                      style={{
                        background:             msg.from === "ai" ? "var(--mc-msg-ai-bg)" : "var(--mc-msg-user-bg)",
                        color:                  "var(--mc-msg-text)",
                        borderBottomLeftRadius: 4,
                        border:                 msg.from === "user" ? "1px solid var(--mc-msg-user-bd)" : "none",
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}

            {showTyping && (
              <div className="flex items-center gap-1.5">
                <div
                  className="size-5 shrink-0 rounded-full flex items-center justify-center text-[10px]"
                  style={{ background: "var(--mc-ai-icon-bg)" }}
                >
                  🤖
                </div>
                <div
                  className="flex items-center gap-1 rounded-2xl px-3 py-1.5 text-xs"
                  style={{ background: "var(--mc-typing-bg)", color: "var(--mc-typing-text)", borderBottomLeftRadius: 4 }}
                >
                  {[0, 0.2, 0.4].map((d, di) => (
                    <span
                      key={di}
                      className="lb-dot-bounce size-1 rounded-full inline-block"
                      style={{ background: "#6366f1", animationDelay: `${d}s` }}
                    />
                  ))}
                  <span className="ml-1">AI is extracting…</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 flex items-center gap-2" style={FOOTER_STYLE}>
        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px]"
          style={{ background: "var(--mc-badge-bg)", color: "var(--mc-badge-text)" }}
        >
          <span className="size-1 rounded-full bg-indigo-400 animate-pulse inline-block" />
          AI monitoring {groupList.filter((g) => g.active).length} chats
        </div>
        <span className="text-[10px] ml-auto" style={{ color: "var(--mc-footer-text)" }}>
          fields auto-filled in real time
        </span>
      </div>
    </div>
  );
}

// ─── Tab 2: CRM Dashboard ─────────────────────────────────────────────────────

function CRMDashboardTab({ active }: { active: boolean }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [visibleFields, setVisibleFields] = useState(0);

  useEffect(() => {
    setVisibleFields(0);
    if (!active) return;
    let fi = 0;
    let intervalId: ReturnType<typeof setInterval>;
    const timerId = setTimeout(() => {
      intervalId = setInterval(() => {
        fi++;
        setVisibleFields(fi);
        if (fi >= crmFields.length) clearInterval(intervalId);
      }, 100);
    }, 200);
    return () => {
      clearTimeout(timerId);
      clearInterval(intervalId);
    };
  }, [active, selectedIdx]);

  const proj = crmProjects[selectedIdx];

  return (
    <div style={CARD_STYLE}>
      <WindowChrome url="leadmighty.app/dashboard/projects" />

      <div className="flex" style={{ minHeight: 360 }}>
        {/* Project list sidebar */}
        <div className="w-44 shrink-0 py-2.5" style={SIDEBAR_STYLE}>
          <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--mc-text-label)" }}>
            Projects
          </p>
          {crmProjects.map((p, i) => {
            const sel = i === selectedIdx;
            return (
              <button
                key={p.name}
                onClick={() => {
                  setSelectedIdx(i);
                  setVisibleFields(0);
                }}
                className="w-full text-left px-3 py-2.5 transition-colors"
                style={{ background: sel ? "var(--mc-proj-sel-bg)" : "transparent" }}
              >
                <p
                  className="text-[11px] font-medium truncate leading-tight"
                  style={{ color: sel ? "var(--mc-proj-sel-t)" : "var(--mc-proj-text)" }}
                >
                  {p.name}
                </p>
                <span
                  className="text-[9px] rounded-full px-1.5 py-0.5 mt-0.5 inline-block"
                  style={{
                    background: "var(--mc-proj-stg-bg)",
                    color:      sel ? "var(--mc-proj-sel-stg)" : "var(--mc-proj-stg-t)",
                  }}
                >
                  {p.stage}
                </span>
              </button>
            );
          })}
        </div>

        {/* Project detail */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--mc-chat-bg)" }}>
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--mc-chrome-bd)" }}
          >
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--mc-text-primary)" }}>{proj.name}</h3>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--mc-text-sec)" }}>
                {proj.group} · via LINE
              </p>
            </div>
            <span
              className="text-[10px] font-semibold rounded-full px-2.5 py-0.5"
              style={{
                background: `${proj.badgeColor}22`,
                color:      proj.badgeColor,
                border:     `1px solid ${proj.badgeColor}44`,
              }}
            >
              {proj.badge}
            </span>
          </div>

          {/* Stage pipeline */}
          <div className="px-4 pt-3 pb-2" style={{ borderBottom: "1px solid var(--mc-chrome-bd)" }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "var(--mc-proj-label)" }}>
              Stage Progress
            </p>
            <div className="flex items-start">
              {stageLabels.map((s, si) => {
                const done = si < proj.stageIdx;
                const curr = si === proj.stageIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
                      <div
                        className="size-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                        style={{
                          background: done ? "var(--mc-stage-done)" : curr ? "var(--mc-stage-act)" : "var(--mc-stage-pend)",
                          color:      done || curr ? "#fff" : "var(--mc-stl-pend)",
                          border:     curr ? "1.5px solid #6366f1" : "none",
                        }}
                      >
                        {done ? "✓" : si + 1}
                      </div>
                      <p
                        className="text-center leading-tight text-[8px]"
                        style={{
                          color:    curr ? "var(--mc-stl-curr)" : done ? "var(--mc-stl-done)" : "var(--mc-stl-pend)",
                          maxWidth: 44,
                        }}
                      >
                        {s}
                      </p>
                    </div>
                    {si < stageLabels.length - 1 && (
                      <div
                        className="h-0.5 flex-1 rounded-full self-start mt-2"
                        style={{ background: done ? "var(--mc-conn-done)" : "var(--mc-conn-pend)" }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Extracted fields */}
          <div className="px-4 pt-3 pb-4 flex-1 overflow-hidden">
            <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "var(--mc-proj-label)" }}>
              AI-Extracted Fields · {proj.stage}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {crmFields.map((f, fi) => (
                <div
                  key={f.label}
                  className="rounded-lg px-2.5 py-2"
                  style={{
                    background: "var(--mc-field-bg)",
                    border:     f.filled && fi < visibleFields ? "1px solid var(--mc-field-bd-f)" : "1px solid var(--mc-field-bd-e)",
                    opacity:    fi < visibleFields ? 1 : 0,
                    transform:  fi < visibleFields ? "translateY(0)" : "translateY(6px)",
                    transition: `opacity 0.2s ease-out ${fi * 20}ms, transform 0.2s ease-out ${fi * 20}ms, border-color 0.2s`,
                  }}
                >
                  <p className="text-[8.5px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--mc-field-label)" }}>
                    {f.label}
                  </p>
                  <div className="flex items-center gap-1">
                    <p
                      className="text-[11px] font-semibold truncate flex-1"
                      style={{ color: f.filled ? "var(--mc-field-val)" : "var(--mc-stl-pend)" }}
                    >
                      {f.value}
                    </p>
                    {f.filled && fi < visibleFields && (
                      <span className="text-[9px] text-green-500 shrink-0">✓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 flex items-center gap-2" style={FOOTER_STYLE}>
        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px]"
          style={{ background: "var(--mc-badge-bg)", color: "var(--mc-badge-text)" }}
        >
          <span className="size-1 rounded-full bg-indigo-400 animate-pulse inline-block" />
          {crmFields.filter((f) => f.filled).length}/{crmFields.length} fields extracted
        </div>
        <span className="text-[10px] ml-auto" style={{ color: "var(--mc-footer-text)" }}>
          auto-filled from LINE group
        </span>
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

export default function HeroSection() {
  const [activeTab,  setActiveTab]  = useState<"chat" | "crm">("chat");
  const [displayTab, setDisplayTab] = useState<"chat" | "crm">("chat");
  const [fading,     setFading]     = useState(false);

  const switchTab = (tab: "chat" | "crm") => {
    if (tab === activeTab) return;
    setFading(true);
    setTimeout(() => {
      setDisplayTab(tab);
      setActiveTab(tab);
      setFading(false);
    }, 150);
  };

  return (
    <>
      <HeroHeader />
      <main className="lm-page lm-hero-dots relative overflow-hidden" style={{ minHeight: "100svh" }}>
        {/* Primary glare — sits behind the headline and spills down onto the component */}
        <div className="lm-hero-glare pointer-events-none absolute inset-0" />

        {/* Secondary glow anchored above the tab/mockup panel */}
        <div className="lm-component-glare pointer-events-none absolute left-0 right-0" style={{ top: "45%", height: "60%" }} />

        {/* Ambient glow orbs */}
        <div
          className="pointer-events-none absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full blur-[130px]"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.14), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute top-1/2 -right-32 h-[360px] w-[360px] rounded-full blur-[110px]"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.1), transparent 70%)" }}
        />

        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-20 lg:pt-24">
          {/* Centered copy — staggered entrance animation */}
          <div className="flex flex-col items-center text-center">
            {/* Badge */}
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium bg-indigo-50 border border-indigo-200 text-indigo-600 dark:bg-indigo-500/15 dark:border-indigo-500/30 dark:text-indigo-300"
              style={{ animation: "lb-hero-in 0.6s ease-out 0.05s both" }}
            >
              <span className="size-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
              AI-powered LINE CRM
            </div>

            {/* Headline */}
            <h1
              className="text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-[3.5rem] max-w-3xl"
              style={{ animation: "lb-hero-in 0.6s ease-out 0.15s both" }}
            >
              Close more deals.{" "}
              <span className="block mt-1 pb-1.5 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-500 dark:from-indigo-400 dark:via-violet-400 dark:to-purple-400 bg-clip-text text-transparent">
                From LINE groups.
              </span>
            </h1>

            {/* Subtitle */}
            <p
              className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-400"
              style={{ animation: "lb-hero-in 0.6s ease-out 0.25s both" }}
            >
              Connect your LINE group chats. Let AI extract lead data, fill CRM fields, and advance your
              pipeline —{" "}
              <span className="text-slate-800 dark:text-slate-200">no manual entry required.</span>
            </p>

            {/* CTAs */}
            <div
              className="mt-8 flex flex-wrap justify-center gap-4"
              style={{ animation: "lb-hero-in 0.6s ease-out 0.35s both" }}
            >
              <SignUpButton mode="modal">
                <Button
                  size="lg"
                  className="h-12 px-8 text-base font-semibold text-white border-none cursor-pointer bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-lg"
                >
                  Get Started
                </Button>
              </SignUpButton>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-8 text-base font-semibold border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Link href="#features">See How It Works</Link>
              </Button>
            </div>

            {/* Trust badges */}
            <div
              className="mt-6 flex flex-wrap justify-center items-center gap-6"
              style={{ animation: "lb-hero-in 0.6s ease-out 0.45s both" }}
            >
              {["Connect in minutes", "No code required", "Cancel anytime"].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-500">
                  <span className="text-green-500">✓</span> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Tab panel */}
          <div className="mt-10" style={{ animation: "lb-hero-in 0.7s ease-out 0.55s both" }}>
            {/* Tab switcher */}
            <div className="flex justify-center mb-5">
              <div className="inline-flex rounded-xl p-1 gap-1 bg-slate-100 border border-slate-200 dark:bg-white/5 dark:border-white/9">
                {(["chat", "crm"] as const).map((id) => {
                  const label = id === "chat" ? "Group Chat" : "CRM Dashboard";
                  const cur   = activeTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => switchTab(id)}
                      className={`rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200 ${
                        cur
                          ? "bg-white dark:bg-indigo-500/30 text-indigo-700 dark:text-white shadow-sm border border-indigo-100 dark:border-indigo-500/38"
                          : "text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content with fade transition */}
            <div
              style={{
                opacity:    fading ? 0 : 1,
                transform:  fading ? "translateY(10px)" : "translateY(0)",
                transition: "opacity 0.15s ease-out, transform 0.15s ease-out",
              }}
            >
              {displayTab === "chat" ? (
                <GroupChatTab />
              ) : (
                <CRMDashboardTab active={displayTab === "crm" && !fading} />
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
