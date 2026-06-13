"use client";

import React, { useState, useRef, useEffect } from "react";

const faqs = [
  {
    q: "How does LeadMighty connect to my LINE group?",
    a: "You create a LINE Official Account, add it to your group chat, and paste the channel credentials into LeadMighty. Setup takes under 5 minutes. The AI starts listening immediately.",
  },
  {
    q: "Does my team need to change how they use LINE?",
    a: "No. Your team and customers chat exactly as they normally would. LeadMighty runs silently in the background, extracting relevant data from the conversation automatically.",
  },
  {
    q: "What languages does the AI support?",
    a: "LeadMighty uses Google Gemini, which handles Thai, English, and mixed-language conversations natively. Perfect for Southeast Asian businesses.",
  },
  {
    q: "Can I define my own workflow stages and fields?",
    a: "Absolutely. You create workflow templates with any stages and required fields you need — property details, client preferences, booking dates, you name it. No coding required.",
  },
  {
    q: "What happens when a stage is completed?",
    a: "LeadMighty automatically advances the project to the next stage, cancels any pending reminders for the completed stage, and schedules new reminders for the upcoming one.",
  },
  {
    q: "Is my LINE conversation data private?",
    a: "Yes. Your data is encrypted in transit and at rest. Conversation data is only used to fill your workflow fields and is never shared or used to train models.",
  },
];

function FAQItem({
  faq,
  isOpen,
  onToggle,
}: {
  faq: { q: string; a: string };
  isOpen: boolean;
  onToggle: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) setHeight(bodyRef.current.scrollHeight);
  }, [faq.a]);

  return (
    <div className="border-b lm-divider">
      <button
        className="flex w-full items-center justify-between py-5 text-left"
        onClick={onToggle}
      >
        <span className="pr-4 text-sm font-semibold lm-h1">{faq.q}</span>
        <span
          className="shrink-0 text-lg transition-transform duration-300 text-indigo-600 dark:text-indigo-400"
          style={{ transform: isOpen ? "rotate(45deg)" : "none" }}
        >
          +
        </span>
      </button>
      <div
        style={{
          maxHeight: isOpen ? height : 0,
          overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div ref={bodyRef}>
          <p className="pb-5 text-sm leading-relaxed lm-body">{faq.a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQs() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="lm-page">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_auto]">
          <div className="text-center lg:text-left">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest lm-label">
              FAQ
            </p>
            <h2 className="mb-4 text-3xl font-extrabold lm-h1 sm:text-4xl">
              Frequently Asked
              <br className="hidden lg:block" /> Questions
            </h2>
            <p className="max-w-sm text-base lm-body">
              Can&apos;t find the answer you&apos;re looking for? Reach us at{" "}
              <a
                href="mailto:hello@leadmighty.app"
                className="underline text-indigo-600 dark:text-indigo-400"
              >
                hello@leadmighty.app
              </a>
            </p>
          </div>

          <div className="sm:mx-auto sm:max-w-lg lg:mx-0 lg:w-[520px]">
            {faqs.map((faq, i) => (
              <FAQItem
                key={i}
                faq={faq}
                isOpen={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
