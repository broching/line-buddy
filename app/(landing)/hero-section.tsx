"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { HeroHeader } from "./header";
import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const industries = [
  { text: "Real Estate Agents", emoji: "🏠" },
  { text: "Insurance Brokers", emoji: "📋" },
  { text: "Course Providers", emoji: "📚" },
  { text: "Retail Businesses", emoji: "🛍️" },
];

type Message = { from: "user" | "ai"; text: string };
type Conversation = {
  contactName: string;
  status: "Hot Lead" | "New Lead" | "Qualified";
  messages: Message[];
};

const conversations: Conversation[] = [
  {
    contactName: "Somchai T.",
    status: "Hot Lead",
    messages: [
      { from: "user", text: "Is the unit near MRT? Any discount?" },
      { from: "ai", text: "Yes! River Modern is 2 min walk from Great World MRT. We have early-bird pricing until Friday — interested in a viewing?" },
      { from: "user", text: "Sure, Saturday morning works!" },
      { from: "ai", text: "Booked ✅ I've noted your preferred unit type (3BR) and your budget. See you Saturday at 10am!" },
    ],
  },
  {
    contactName: "Aom K.",
    status: "Qualified",
    messages: [
      { from: "user", text: "I need travel insurance for 3 people, next month" },
      { from: "ai", text: "Great! TravelEase covers families up to 6. For 3 pax, 1 month — that's S$89 all-in. Want me to prepare a quote?" },
      { from: "user", text: "Yes please, include medical coverage" },
      { from: "ai", text: "Quote ready 📄 Includes S$1M medical, baggage, and delays. I've saved your trip dates and passenger count to the file." },
    ],
  },
  {
    contactName: "Wanchai P.",
    status: "New Lead",
    messages: [
      { from: "user", text: "How do I enroll in the sales course?" },
      { from: "ai", text: "Our AI Sales Mastery course starts June 20. It's 8 weeks, fully online. Do you have prior sales experience?" },
      { from: "user", text: "Some, about 2 years in retail" },
      { from: "ai", text: "Perfect fit! I've captured your experience level. The intermediate track starts at the right level for you 🎯" },
    ],
  },
];

const contacts = [
  { name: "Somchai T.", label: "Hot Lead" },
  { name: "Aom K.", label: "Qualified" },
  { name: "Wanchai P.", label: "New Lead" },
  { name: "Nida R.", label: "Hot Lead" },
  { name: "Jakrit S.", label: "New Lead" },
];

const statusColors: Record<string, { bg: string; text: string }> = {
  "Hot Lead": { bg: "rgba(34,197,94,0.15)", text: "#4ade80" },
  "Qualified": { bg: "rgba(59,130,246,0.15)", text: "#60a5fa" },
  "New Lead": { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" },
};

export default function HeroSection() {
  const [industryIdx, setIndustryIdx] = useState(0);
  const [convIdx, setConvIdx] = useState(0);
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [showTyping, setShowTyping] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [fading, setFading] = useState(false);

  // Cursor blink
  useEffect(() => {
    const t = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(t);
  }, []);

  // Rotate industry every 3.5s
  useEffect(() => {
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndustryIdx((i) => (i + 1) % industries.length);
        setFading(false);
      }, 300);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  // Cycle through conversations + messages
  useEffect(() => {
    setVisibleMessages(0);
    setShowTyping(false);

    const conv = conversations[convIdx];
    let msgIdx = 0;

    const revealNext = () => {
      if (msgIdx < conv.messages.length) {
        const msg = conv.messages[msgIdx];
        if (msg.from === "ai") {
          setShowTyping(true);
          setTimeout(() => {
            setShowTyping(false);
            setVisibleMessages(msgIdx + 1);
            msgIdx++;
            setTimeout(revealNext, 900);
          }, 1200);
        } else {
          setVisibleMessages(msgIdx + 1);
          msgIdx++;
          setTimeout(revealNext, 800);
        }
      } else {
        setTimeout(() => {
          setConvIdx((c) => (c + 1) % conversations.length);
        }, 2000);
      }
    };

    const start = setTimeout(revealNext, 600);
    return () => clearTimeout(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convIdx]);

  const conv = conversations[convIdx];
  const activeContact = contacts.find((c) => c.name === conv.contactName);
  const activeStatus = activeContact?.label ?? "Lead";
  const statusColor = statusColors[activeStatus] ?? statusColors["New Lead"];

  return (
    <>
      <HeroHeader />
      <main className="lm-page relative min-h-screen overflow-hidden">
        {/* Ambient glow orbs — lighter in light mode */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-10 dark:opacity-20 blur-3xl bg-indigo-500" />
        <div className="pointer-events-none absolute top-1/3 right-0 h-80 w-80 rounded-full opacity-8 dark:opacity-15 blur-3xl bg-violet-500" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-5 dark:opacity-10 blur-3xl bg-blue-500" />

        <div className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-32 lg:pt-40">
          <div className="flex flex-col items-center gap-16 lg:flex-row lg:items-center lg:gap-12">
            {/* Left — copy */}
            <div className="flex-1">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 px-4 py-1.5 text-sm text-indigo-600 dark:text-indigo-300">
                <span className="size-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse inline-block" />
                AI-powered LINE CRM
              </p>

              <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-[3.5rem]">
                We automate{" "}
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  Sales Workflows
                </span>{" "}
                <br />
                for{" "}
                <span
                  className="inline-block transition-opacity duration-300 text-violet-600 dark:text-violet-400"
                  style={{ opacity: fading ? 0 : 1 }}
                >
                  {industries[industryIdx].text} {industries[industryIdx].emoji}
                </span>
                <span
                  className="ml-1 inline-block text-indigo-600"
                  style={{ opacity: cursorVisible ? 1 : 0 }}
                >
                  |
                </span>
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                Connect your{" "}
                <span className="text-emerald-600 dark:text-emerald-400">LINE group chats</span>. Let{" "}
                <span className="text-indigo-600 dark:text-indigo-400">AI</span> extract data, fill{" "}
                <span className="text-indigo-600 dark:text-indigo-400">workflow</span> fields, and send smart{" "}
                <span className="text-indigo-600 dark:text-indigo-400">reminders</span> — automatically.
              </p>

              <div className="mt-10 flex flex-wrap gap-4">
                <SignUpButton mode="modal">
                  <Button
                    size="lg"
                    className="h-12 px-8 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg border-none"
                  >
                    Get Started Free
                  </Button>
                </SignUpButton>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 px-8 text-base font-semibold border-slate-300 dark:border-[#1e2448] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Link href="#features">See How It Works</Link>
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-6">
                {["No credit card needed", "14-day free trial", "Cancel anytime"].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-500">
                    <span className="text-green-500">✓</span> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — product mockup */}
            <div className="w-full flex-shrink-0 lg:w-[52%]">
              <div className="relative overflow-hidden rounded-2xl shadow-2xl lm-card" style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(99,102,241,0.08)" }}>
                {/* Window chrome */}
                <div className="flex items-center gap-2 px-4 py-3 border-b lm-divider bg-slate-50 dark:bg-[#0b0e22]">
                  <div className="flex gap-1.5">
                    <div className="size-3 rounded-full bg-red-500/70" />
                    <div className="size-3 rounded-full bg-yellow-500/70" />
                    <div className="size-3 rounded-full bg-green-500/70" />
                  </div>
                  <div className="mx-auto flex items-center gap-2 rounded px-3 py-1 text-xs bg-slate-100 dark:bg-[#1a1f3e] text-slate-500 dark:text-slate-500">
                    <span>🔒</span> leadmighty.app/dashboard
                  </div>
                </div>

                {/* App layout */}
                <div className="flex" style={{ minHeight: 380 }}>
                  {/* Contacts panel */}
                  <div className="w-44 shrink-0 py-3 bg-slate-50 dark:bg-[#0b0e22] border-r border-slate-200 dark:border-[#1a1f3e]">
                    <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600">
                      Contacts
                    </p>
                    {contacts.map((c) => {
                      const isActive = c.name === conv.contactName;
                      return (
                        <div
                          key={c.name}
                          className="px-3 py-2.5 mx-1.5 rounded-lg mb-0.5 transition-colors"
                          style={{ background: isActive ? "#6366f1" : "transparent" }}
                        >
                          <p className="text-sm font-medium truncate" style={{ color: isActive ? "#fff" : undefined }} >
                            {!isActive && <span className="text-slate-700 dark:text-slate-300">{c.name}</span>}
                            {isActive && c.name}
                          </p>
                          <p className="text-xs" style={{ color: isActive ? "rgba(255,255,255,0.75)" : undefined }}>
                            {!isActive && <span className="text-slate-400 dark:text-slate-600">{c.label}</span>}
                            {isActive && c.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Chat panel */}
                  <div className="flex flex-1 flex-col bg-white dark:bg-[#0f1329]">
                    {/* Chat header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#1a1f3e]">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{conv.contactName}</p>
                      </div>
                      <span
                        className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ background: statusColor.bg, color: statusColor.text }}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {activeStatus}
                      </span>
                    </div>

                    {/* Messages */}
                    <div className="flex flex-1 flex-col gap-2.5 overflow-hidden px-4 py-4">
                      {conv.messages.slice(0, visibleMessages).map((msg, i) => (
                        <div
                          key={`${convIdx}-${i}`}
                          className={`lb-msg-fade-in flex ${msg.from === "user" ? "justify-end" : "justify-start gap-2"}`}
                        >
                          {msg.from === "ai" && (
                            <div className="mt-auto flex size-6 shrink-0 items-center justify-center rounded-full text-xs bg-slate-100 dark:bg-[#1e2448] text-indigo-500 dark:text-indigo-400">
                              🤖
                            </div>
                          )}
                          <div
                            className={msg.from === "user"
                              ? "max-w-[68%] rounded-2xl px-3 py-2 text-xs leading-relaxed bg-indigo-600 text-white"
                              : "max-w-[68%] rounded-2xl px-3 py-2 text-xs leading-relaxed bg-slate-100 dark:bg-[#1a1f3e] text-slate-700 dark:text-slate-300"
                            }
                            style={{
                              borderBottomRightRadius: msg.from === "user" ? 4 : undefined,
                              borderBottomLeftRadius: msg.from === "ai" ? 4 : undefined,
                            }}
                          >
                            {msg.text}
                          </div>
                        </div>
                      ))}

                      {showTyping && (
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs bg-slate-100 dark:bg-[#1e2448] text-indigo-500 dark:text-indigo-400">
                            🤖
                          </div>
                          <div className="flex items-center gap-1 rounded-2xl px-3 py-2 text-xs bg-slate-100 dark:bg-[#1a1f3e] text-slate-500 dark:text-slate-500">
                            <span className="inline-flex gap-0.5">
                              {[0, 0.2, 0.4].map((delay, di) => (
                                <span
                                  key={di}
                                  className="lb-dot-bounce inline-block size-1.5 rounded-full bg-indigo-500"
                                  style={{ animationDelay: `${delay}s` }}
                                />
                              ))}
                            </span>
                            <span className="ml-1">AI is typing…</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom badge */}
                <div className="px-4 py-2.5 flex items-center gap-2 border-t border-slate-100 dark:border-[#1a1f3e] bg-slate-50 dark:bg-[#0b0e22]">
                  <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                    <span className="size-1.5 rounded-full bg-indigo-500 animate-pulse inline-block" />
                    AI processing LINE messages
                  </div>
                  <span className="text-xs ml-auto text-slate-400 dark:text-slate-600">
                    3 fields auto-filled today
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
