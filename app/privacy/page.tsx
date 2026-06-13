import Link from "next/link";
import Image from "next/image";
import { HeroHeader } from "@/app/(landing)/header";
import FooterSection from "@/app/(landing)/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — LeadMighty",
  description: "How LeadMighty collects, uses, and protects your data.",
};

const sections = [
  {
    id: "information-we-collect",
    title: "Information We Collect",
    content: [
      {
        subtitle: "Account Information",
        text: "When you create an account, we collect your name, email address, and organization details. This information is necessary to provide our service and manage your subscription.",
      },
      {
        subtitle: "LINE Conversation Data",
        text: "To power our AI extraction features, LeadMighty processes messages sent in connected LINE group chats. This includes message text, sender identifiers, and timestamps. We process this data solely to extract workflow fields as configured by your organization.",
      },
      {
        subtitle: "Usage Data",
        text: "We automatically collect information about how you interact with our platform — pages visited, features used, session duration, and device/browser information. This helps us improve the product and diagnose issues.",
      },
      {
        subtitle: "Payment Information",
        text: "Billing details are handled by our payment processor (Clerk). We do not store full credit card numbers. We retain transaction records required by law.",
      },
    ],
  },
  {
    id: "how-we-use",
    title: "How We Use Your Information",
    content: [
      {
        subtitle: "Providing the Service",
        text: "We use your data to authenticate you, process LINE conversations through our AI pipeline, advance workflow stages, and send reminders to the configured team members.",
      },
      {
        subtitle: "Improving LeadMighty",
        text: "Aggregated, anonymized usage data helps us understand which features deliver the most value and where we should invest in improvements. Conversation data is never used to train AI models.",
      },
      {
        subtitle: "Communications",
        text: "We may send you service-related emails such as account confirmations, billing notifications, and critical product updates. You can opt out of non-essential communications at any time.",
      },
      {
        subtitle: "Security & Compliance",
        text: "We use collected data to detect fraud, abuse, and security threats, and to comply with applicable laws and regulations.",
      },
    ],
  },
  {
    id: "data-sharing",
    title: "Data Sharing & Third Parties",
    content: [
      {
        subtitle: "We Do Not Sell Your Data",
        text: "LeadMighty does not sell, rent, or trade your personal information or conversation data to any third party for marketing purposes.",
      },
      {
        subtitle: "Service Providers",
        text: "We share data with carefully vetted sub-processors who help us operate the platform — including Convex (database), Google (AI models via Gemini API), Clerk (authentication and billing), and cloud infrastructure providers. Each is bound by data processing agreements.",
      },
      {
        subtitle: "Legal Requirements",
        text: "We may disclose your information if required by law, court order, or to protect the rights, property, or safety of LeadMighty, our users, or the public.",
      },
      {
        subtitle: "Business Transfers",
        text: "In the event of a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction. We will notify you via email and/or a prominent notice on our website before your data is transferred.",
      },
    ],
  },
  {
    id: "data-security",
    title: "Data Security",
    content: [
      {
        subtitle: "Encryption",
        text: "All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption. Sensitive credentials such as LINE channel secrets are encrypted using an additional application-layer key.",
      },
      {
        subtitle: "Access Controls",
        text: "Access to production data is restricted to authorized personnel on a need-to-know basis. We conduct periodic access reviews and maintain audit logs of all data access.",
      },
      {
        subtitle: "Incident Response",
        text: "In the event of a data breach affecting your personal information, we will notify affected users within 72 hours as required by applicable regulations.",
      },
    ],
  },
  {
    id: "data-retention",
    title: "Data Retention",
    content: [
      {
        subtitle: "Account Data",
        text: "We retain your account information for as long as your account is active. If you delete your account, we will delete or anonymize your personal data within 30 days, except where retention is required by law.",
      },
      {
        subtitle: "Conversation Data",
        text: "LINE message data processed for field extraction is retained for 12 months by default to support audit trails and dispute resolution. Organization admins can request earlier deletion via our support team.",
      },
      {
        subtitle: "Billing Records",
        text: "Transaction records are retained for 7 years as required by applicable financial regulations.",
      },
    ],
  },
  {
    id: "your-rights",
    title: "Your Rights",
    content: [
      {
        subtitle: "Access & Portability",
        text: "You have the right to request a copy of the personal data we hold about you and your organization. We will provide this in a machine-readable format within 30 days of your request.",
      },
      {
        subtitle: "Correction",
        text: "You can update most of your account information directly from your dashboard settings. Contact us for corrections to data you cannot update yourself.",
      },
      {
        subtitle: "Deletion",
        text: "You can request deletion of your account and associated data at any time. Some data may be retained where legally required.",
      },
      {
        subtitle: "Opt-Out",
        text: "You can opt out of non-essential email communications at any time via the unsubscribe link in those emails, or by contacting us directly.",
      },
    ],
  },
  {
    id: "cookies",
    title: "Cookies & Tracking",
    content: [
      {
        subtitle: "Essential Cookies",
        text: "We use cookies necessary to operate the service — including session authentication tokens and security tokens. These cannot be disabled without breaking the service.",
      },
      {
        subtitle: "Analytics",
        text: "We use minimal analytics to understand product usage. These do not track you across other websites and do not include advertising identifiers.",
      },
    ],
  },
  {
    id: "contact",
    title: "Contact Us",
    content: [
      {
        subtitle: "Privacy Inquiries",
        text: "For any privacy-related questions, data requests, or to exercise your rights, please contact us at privacy@leadmighty.app. We will respond within 5 business days.",
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="lm-page min-h-screen">
      <HeroHeader />

      <main className="pt-24 pb-20">
        {/* Page header */}
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-12 border-b lm-divider pb-10">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              Legal
            </p>
            <h1 className="text-3xl font-extrabold lm-h1 sm:text-4xl mb-4">
              Privacy Policy
            </h1>
            <p className="text-base lm-body max-w-2xl leading-relaxed">
              This policy explains how LeadMighty collects, uses, and safeguards your information when you use our AI-powered LINE CRM platform.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-6 text-sm lm-muted">
              <span>Effective: January 1, 2025</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>Last updated: June 12, 2026</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <Link href="/terms" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                View Terms of Service →
              </Link>
            </div>
          </div>

          <div className="flex gap-12 lg:gap-16">
            {/* Sticky table of contents — desktop only */}
            <aside className="hidden lg:block w-52 shrink-0">
              <div className="sticky top-28">
                <p className="text-xs font-semibold uppercase tracking-widest lm-muted mb-3">
                  Contents
                </p>
                <nav className="space-y-1">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="block py-1.5 text-sm lm-muted hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-0.5 transition-all duration-150"
                    >
                      {s.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Main content */}
            <article className="flex-1 min-w-0 space-y-12">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28">
                  <h2 className="text-xl font-bold lm-h1 mb-6 flex items-center gap-3">
                    <span className="block w-1 h-5 rounded-full bg-indigo-500 shrink-0" />
                    {section.title}
                  </h2>
                  <div className="space-y-6">
                    {section.content.map((item, i) => (
                      <div key={i} className="rounded-xl border lm-divider bg-slate-50 dark:bg-slate-900/40 p-5">
                        <h3 className="text-sm font-semibold lm-h1 mb-2">{item.subtitle}</h3>
                        <p className="text-sm lm-body leading-relaxed">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {/* Contact block */}
              <div className="mt-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 p-6">
                <h3 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-1">
                  Questions about your privacy?
                </h3>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-3">
                  Our team typically responds within 5 business days.
                </p>
                <a
                  href="mailto:privacy@leadmighty.app"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  privacy@leadmighty.app
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M7 17L17 7M17 7H7M17 7v10" />
                  </svg>
                </a>
              </div>
            </article>
          </div>
        </div>
      </main>

      <FooterSection />
    </div>
  );
}
