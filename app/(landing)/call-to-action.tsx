"use client";

import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const extractedFields = [
  { label: "Client Name", value: "Somchai T." },
  { label: "Budget",      value: "S$3,000,000" },
  { label: "Unit Type",   value: "3-Bedroom" },
];

export default function CallToAction() {
  return (
    <section className="lm-section-alt">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">

        {/* Theme-adaptive card */}
        <div
          className="relative overflow-hidden rounded-3xl bg-white dark:bg-[#06070f] border border-indigo-100/80 dark:border-transparent"
          style={{
            boxShadow:
              "0 0 0 1px rgba(99,102,241,0.1), 0 30px 70px rgba(99,102,241,0.1), 0 8px 24px rgba(0,0,0,0.06)",
          }}
        >
          {/* Dot texture */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(99,102,241,0.12) 1.5px, transparent 1.5px)",
              backgroundSize: "22px 22px",
            }}
          />

          {/* Gradient mesh — light mode */}
          <div
            className="dark:hidden pointer-events-none absolute inset-0"
            style={{
              background: [
                "radial-gradient(ellipse 90% 55% at 50% -5%, rgba(99,102,241,0.12) 0%, transparent 65%)",
                "radial-gradient(ellipse 50% 45% at 85% 110%, rgba(139,92,246,0.07) 0%, transparent 60%)",
                "radial-gradient(ellipse 40% 40% at 10% 110%, rgba(99,102,241,0.06) 0%, transparent 60%)",
              ].join(", "),
            }}
          />

          {/* Gradient mesh — dark mode */}
          <div
            className="hidden dark:block pointer-events-none absolute inset-0"
            style={{
              background: [
                "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(99,102,241,0.28) 0%, transparent 65%)",
                "radial-gradient(ellipse 55% 50% at 85% 110%, rgba(139,92,246,0.18) 0%, transparent 60%)",
                "radial-gradient(ellipse 40% 40% at 10% 110%, rgba(99,102,241,0.12) 0%, transparent 60%)",
              ].join(", "),
            }}
          />

          {/* Floating decoration — left (fields extracted) */}
          <div
            className="lb-float-alt pointer-events-none hidden lg:block absolute left-7 bottom-14 rounded-2xl p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10"
            style={{ width: 210, backdropFilter: "blur(10px)" }}
          >
            <div className="flex items-center gap-1.5 mb-3">
              <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-semibold text-green-600 dark:text-green-300">
                Fields extracted
              </span>
            </div>
            <div className="space-y-2">
              {extractedFields.map((f) => (
                <div key={f.label} className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400 dark:text-white/40">{f.label}</span>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-white/85">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Floating decoration — right (stage advanced) */}
          <div
            className="lb-float pointer-events-none hidden lg:block absolute right-7 top-14 rounded-2xl p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10"
            style={{ width: 195, backdropFilter: "blur(10px)" }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <div className="size-6 rounded-full bg-indigo-100 dark:bg-indigo-500/30 flex items-center justify-center text-[11px]">
                🎯
              </div>
              <span className="text-[11px] font-semibold text-slate-800 dark:text-white">
                District 9 #12B
              </span>
            </div>
            <p className="text-[10px] mb-1.5 text-slate-400 dark:text-white/40">Stage advanced</p>
            <div className="flex items-center gap-1 text-[11px] font-semibold">
              <span className="text-indigo-600 dark:text-indigo-300">Offer Made</span>
              <span className="text-slate-300 dark:text-white/30">→</span>
              <span className="text-green-600 dark:text-green-400">Closing ✓</span>
            </div>
          </div>

          {/* Main content */}
          <div className="relative z-10 px-8 py-16 text-center md:px-20 md:py-20">
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">
              Start Today
            </p>

            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-slate-900 dark:text-white sm:text-4xl lg:text-5xl">
              Stop copying data.<br />Start closing deals.
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-500 dark:text-white/60">
              Connect your LINE groups in minutes. Your team keeps chatting the way they always have.
              AI captures every detail — silently, automatically.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <SignUpButton mode="modal">
                <Button
                  size="lg"
                  className="h-12 px-8 text-base font-semibold bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-white dark:text-indigo-700 dark:hover:bg-indigo-50 shadow-lg border-none cursor-pointer"
                >
                  Get Started
                </Button>
              </SignUpButton>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-8 text-base font-semibold bg-transparent border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
              >
                <Link href="mailto:hello@leadmighty.app">Talk to Sales</Link>
              </Button>
            </div>

            <p className="mt-6 text-sm text-slate-400 dark:text-white/30">
              Connect in minutes · Cancel anytime · No code required
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
