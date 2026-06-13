"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const sectionLinks = [
  { title: "Features", href: "#features" },
  { title: "How It Works", href: "#how-it-works" },
  { title: "Pricing", href: "#pricing" },
  { title: "Testimonials", href: "#testimonials" },
  { title: "FAQ", href: "#faq" },
];

const pageLinks = [
  { title: "Privacy Policy", href: "/privacy" },
  { title: "Terms of Service", href: "/terms" },
];

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function FooterSection() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <footer className="lm-page border-t lm-divider">
      <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <div className="flex items-center gap-2">
            <Image src="/brandlogo.png" alt="LeadMighty" width={28} height={28} className="rounded-lg" />
            <span className="text-lg font-bold lm-h1">LeadMighty</span>
          </div>
          <p className="max-w-sm text-center text-sm lm-muted leading-relaxed">
            AI-powered LINE CRM for sales teams. Connect your group chats and let AI handle the rest.
          </p>
        </div>

        {/* Nav links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 mb-10">
          {sectionLinks.map((link) =>
            isHome ? (
              <button
                key={link.title}
                onClick={() => smoothScrollTo(link.href.slice(1))}
                className="text-sm lm-muted hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-150 cursor-pointer"
              >
                {link.title}
              </button>
            ) : (
              <Link
                key={link.title}
                href={`/${link.href}`}
                className="text-sm lm-muted hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-150"
              >
                {link.title}
              </Link>
            )
          )}
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>
          {pageLinks.map((link) => (
            <Link
              key={link.title}
              href={link.href}
              className="text-sm lm-muted hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-150"
            >
              {link.title}
            </Link>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t lm-divider">
          <span className="text-sm lm-muted">
            © {new Date().getFullYear()} LeadMighty. All rights reserved.
          </span>
          <div className="flex gap-4">
            <a
              href="#"
              aria-label="X / Twitter"
              className="lm-muted hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M10.488 14.651L15.25 21h7l-7.858-10.478L20.93 3h-2.65l-5.117 5.886L8.75 3h-7l7.51 10.015L2.32 21h2.65zM16.25 19L5.75 5h2l10.5 14z" />
              </svg>
            </a>
            <a
              href="#"
              aria-label="LinkedIn"
              className="lm-muted hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
