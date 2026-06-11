"use client";

import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function CallToAction() {
  return (
    <section className="lm-section-alt">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <div className="relative overflow-hidden rounded-3xl px-8 py-16 text-center md:py-20 bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 shadow-2xl shadow-indigo-500/25">
          {/* Subtle inner glow */}
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12)_0%,transparent_70%)]" />

          <div className="relative">
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-200">
              Start Today
            </p>
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-white sm:text-4xl lg:text-5xl">
              Stop copying data.<br />Start closing deals.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100">
              Set up LeadMighty in under 10 minutes. No developers needed.
              Your team keeps using LINE. AI handles the rest.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <SignUpButton mode="modal">
                <Button
                  size="lg"
                  className="h-12 px-8 text-base font-semibold bg-white text-indigo-700 hover:bg-indigo-50 shadow-lg border-none"
                >
                  Get Started Free
                </Button>
              </SignUpButton>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-8 text-base font-semibold border-indigo-300/60 text-white hover:bg-white/10 bg-transparent"
              >
                <Link href="mailto:hello@leadmighty.app">Talk to Sales</Link>
              </Button>
            </div>

            <p className="mt-6 text-sm text-indigo-300">
              14-day free trial · No credit card · Cancel anytime
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
