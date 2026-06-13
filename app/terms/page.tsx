import Link from "next/link";
import { HeroHeader } from "@/app/(landing)/header";
import FooterSection from "@/app/(landing)/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — LeadMighty",
  description: "The terms and conditions governing your use of LeadMighty.",
};

const sections = [
  {
    id: "acceptance",
    title: "Acceptance of Terms",
    content: [
      {
        subtitle: "Agreement to Terms",
        text: "By accessing or using LeadMighty (the \"Service\"), you agree to be bound by these Terms of Service. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.",
      },
      {
        subtitle: "Changes to Terms",
        text: "We may update these Terms from time to time. We will notify you of material changes via email or a notice within the Service at least 14 days before they take effect. Continued use after that date constitutes acceptance of the updated Terms.",
      },
    ],
  },
  {
    id: "service-description",
    title: "Service Description",
    content: [
      {
        subtitle: "What LeadMighty Provides",
        text: "LeadMighty is a CRM platform that connects to LINE Official Accounts and LINE group chats. Our AI pipeline extracts structured data from conversations to automatically fill workflow fields, advance project stages, and trigger smart reminders.",
      },
      {
        subtitle: "Beta Features",
        text: "Some features may be released in beta. Beta features are provided \"as-is\" and may change or be discontinued. We will clearly label beta features within the product.",
      },
      {
        subtitle: "Service Availability",
        text: "We aim for 99.9% uptime but do not guarantee uninterrupted access. We may perform scheduled maintenance with advance notice, or emergency maintenance without notice when required for security or stability.",
      },
    ],
  },
  {
    id: "accounts",
    title: "Accounts & Organizations",
    content: [
      {
        subtitle: "Account Responsibility",
        text: "You are responsible for maintaining the security of your account credentials. You must notify us immediately of any unauthorized access. We are not liable for losses caused by unauthorized use of your account.",
      },
      {
        subtitle: "Organization Admins",
        text: "The user who creates an organization is its owner and has full administrative rights. Owners are responsible for managing member access, configuring integrations, and ensuring their team's compliance with these Terms.",
      },
      {
        subtitle: "Seat Limits",
        text: "Your subscription plan defines the number of members (seats) permitted in your organization. Adding members beyond your plan limit requires upgrading to a higher tier.",
      },
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    content: [
      {
        subtitle: "Permitted Use",
        text: "You may use LeadMighty for legitimate business purposes including sales pipeline management, customer relationship management, and team coordination via LINE group chats.",
      },
      {
        subtitle: "Prohibited Activities",
        text: "You must not: (a) use the Service to send spam or unsolicited messages; (b) violate LINE's Terms of Service or Official Account guidelines; (c) use the AI pipeline to process messages in chats where participants have not consented; (d) attempt to reverse-engineer, scrape, or extract our AI models; (e) use the Service to engage in any illegal activity.",
      },
      {
        subtitle: "LINE Platform Compliance",
        text: "You are solely responsible for ensuring your use of LINE Official Accounts complies with LINE Corporation's developer terms, official account policies, and applicable messaging regulations in your jurisdiction.",
      },
    ],
  },
  {
    id: "data-ownership",
    title: "Data Ownership & License",
    content: [
      {
        subtitle: "Your Data",
        text: "You retain ownership of all data you input into LeadMighty, including workflow configurations, project data, and conversation data processed from your LINE groups. We do not claim any ownership rights over your data.",
      },
      {
        subtitle: "License to Operate",
        text: "By using the Service, you grant LeadMighty a limited, non-exclusive license to process your data solely for the purpose of providing the Service as described in our Privacy Policy.",
      },
      {
        subtitle: "No Training Use",
        text: "Your conversation data and extracted fields will never be used to train AI models, whether by LeadMighty or any third party. This is a firm commitment.",
      },
      {
        subtitle: "Data Export",
        text: "You can export your workflow data and project records at any time from your dashboard. Upon account deletion, we provide a 30-day window to export your data before it is permanently deleted.",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & Subscriptions",
    content: [
      {
        subtitle: "Subscription Plans",
        text: "LeadMighty offers monthly and annual subscription plans. Prices are listed on our Pricing page and are subject to change with 30 days' notice. Annual plans are billed upfront and not refundable except as required by law.",
      },
      {
        subtitle: "AI Credits",
        text: "Each plan includes a monthly AI credit allowance. Credits are consumed when our AI pipeline processes message groups. Unused credits do not roll over to the next month. Additional credits can be purchased as top-ups.",
      },
      {
        subtitle: "Cancellation",
        text: "You may cancel your subscription at any time. Your access continues until the end of the current billing period. We do not offer prorated refunds for unused time except where required by applicable consumer protection law.",
      },
      {
        subtitle: "Failed Payments",
        text: "If a payment fails, we will retry up to 3 times over 7 days. After that, your account will be downgraded to the free tier and AI processing will be paused until payment is resolved.",
      },
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    content: [
      {
        subtitle: "LeadMighty IP",
        text: "The Service, including its software, AI models, design, and content, is owned by LeadMighty and protected by intellectual property laws. These Terms do not grant you any rights in our intellectual property beyond the limited license to use the Service.",
      },
      {
        subtitle: "Feedback",
        text: "If you submit feedback, feature requests, or suggestions, you grant us a royalty-free, perpetual license to use that feedback without any obligation to you.",
      },
    ],
  },
  {
    id: "liability",
    title: "Limitation of Liability",
    content: [
      {
        subtitle: "Disclaimer",
        text: "The Service is provided \"as is\" without warranties of any kind. We do not warrant that the AI extraction will be 100% accurate, that the Service will be error-free, or that all workflow fields will be correctly identified from every conversation.",
      },
      {
        subtitle: "Limitation",
        text: "To the maximum extent permitted by law, LeadMighty's total liability for any claims arising from your use of the Service shall not exceed the greater of: (a) the amounts you paid in the 12 months preceding the claim, or (b) USD $100.",
      },
      {
        subtitle: "Exclusions",
        text: "LeadMighty shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, even if we have been advised of the possibility of such damages.",
      },
    ],
  },
  {
    id: "termination",
    title: "Termination",
    content: [
      {
        subtitle: "By You",
        text: "You may terminate your account at any time via the Settings page. Termination does not entitle you to a refund of prepaid fees.",
      },
      {
        subtitle: "By Us",
        text: "We may suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or if continued operation poses a legal or security risk. We will provide notice except in cases of severe violations or legal necessity.",
      },
      {
        subtitle: "Effect of Termination",
        text: "Upon termination, your access to the Service ceases. Your data will be retained for 30 days for export, then deleted in accordance with our Privacy Policy.",
      },
    ],
  },
  {
    id: "governing-law",
    title: "Governing Law",
    content: [
      {
        subtitle: "Jurisdiction",
        text: "These Terms are governed by the laws of Singapore. Any disputes arising from these Terms or the Service will be subject to the exclusive jurisdiction of the courts of Singapore, without regard to conflict of law principles.",
      },
      {
        subtitle: "Dispute Resolution",
        text: "Before initiating legal proceedings, both parties agree to attempt to resolve any dispute informally by contacting us at legal@leadmighty.app. We will make a good-faith effort to resolve disputes within 30 days.",
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="lm-page min-h-screen">
      <HeroHeader />

      <main className="pt-24 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          {/* Page header */}
          <div className="mb-12 border-b lm-divider pb-10">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              Legal
            </p>
            <h1 className="text-3xl font-extrabold lm-h1 sm:text-4xl mb-4">
              Terms of Service
            </h1>
            <p className="text-base lm-body max-w-2xl leading-relaxed">
              These terms govern your use of the LeadMighty platform. Please read them carefully before using our service.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-6 text-sm lm-muted">
              <span>Effective: January 1, 2025</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>Last updated: June 12, 2026</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <Link href="/privacy" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                View Privacy Policy →
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
                    <span className="block w-1 h-5 rounded-full bg-violet-500 shrink-0" />
                    {section.title}
                  </h2>
                  <div className="space-y-4">
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
              <div className="mt-4 rounded-2xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 p-6">
                <h3 className="font-semibold text-violet-900 dark:text-violet-100 mb-1">
                  Legal inquiries
                </h3>
                <p className="text-sm text-violet-700 dark:text-violet-300 mb-3">
                  For legal questions or dispute resolution, contact our team.
                </p>
                <a
                  href="mailto:legal@leadmighty.app"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                >
                  legal@leadmighty.app
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
