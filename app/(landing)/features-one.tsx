"use client";

import React from "react";

const features = [
  {
    icon: "🤖",
    title: "AI Data Extraction",
    description:
      "Gemini AI reads every message in your LINE group and automatically fills your CRM fields — names, dates, quantities, preferences — without anyone typing a single form.",
    badge: "Powered by Gemini",
    badgeColor: "#3b82f6",
  },
  {
    icon: "📋",
    title: "Workflow Stage Automation",
    description:
      "Define custom stages for your sales process. LeadMighty moves projects forward when AI detects the required data, and alerts your team when a stage is complete.",
    badge: "No-code setup",
    badgeColor: "#8b5cf6",
  },
  {
    icon: "⏰",
    title: "Smart Reminders",
    description:
      "Never miss a follow-up. Configure field-level reminders so the right team member gets notified at exactly the right time — automatically, every time.",
    badge: "Auto-scheduled",
    badgeColor: "#6366f1",
  },
  {
    icon: "💬",
    title: "LINE Group CRM",
    description:
      "Each LINE group chat becomes its own sales pipeline. Manage multiple groups, clients, and deals from one dashboard — no switching between apps.",
    badge: "Multi-group",
    badgeColor: "#06b6d4",
  },
];

export default function FeaturesOne() {
  return (
    <section id="features" className="lm-page">
      {/* Features grid */}
      <div className="py-20 md:py-28 lm-section-alt">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest lm-label">
              Core Features
            </p>
            <h2 className="text-3xl font-extrabold lm-h1 sm:text-4xl">
              Everything your team needs
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg lm-body">
              Built specifically for teams running sales through LINE group chats.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-1 lm-card"
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-2xl"
                  style={{
                    background: `radial-gradient(ellipse at top left, ${f.badgeColor}18, transparent 60%)`,
                  }}
                />
                <div className="relative">
                  <div className="mb-4 text-3xl">{f.icon}</div>
                  <span
                    className="mb-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      background: `${f.badgeColor}22`,
                      color: f.badgeColor,
                    }}
                  >
                    {f.badge}
                  </span>
                  <h3 className="mb-2 text-base font-bold lm-h1">{f.title}</h3>
                  <p className="text-sm leading-relaxed lm-body">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Social proof numbers */}
      <div className="border-y lm-divider py-16 lm-card-subtle">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
            {[
              { value: "10×", label: "Faster data collection" },
              { value: "0", label: "Manual form entries" },
              { value: "100%", label: "LINE-native experience" },
              { value: "24/7", label: "AI always on" },
            ].map((stat, i) => (
              <div key={i}>
                <div className="text-4xl font-black bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <p className="mt-1 text-sm lm-body">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
