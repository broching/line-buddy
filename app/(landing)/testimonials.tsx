const testimonials = [
  {
    name: "Priya Mehta",
    role: "Real Estate Sales Manager",
    quote:
      "Before LeadMighty, my agents were copy-pasting client info from LINE into spreadsheets every day. Now the AI handles it automatically. We close 30% faster and nobody complains about data entry anymore.",
    initials: "PM",
    color: "#6366f1",
  },
  {
    name: "Kevin Loh",
    role: "Insurance Agency Owner",
    quote:
      "We run 12 LINE group chats for different client segments. LeadMighty keeps every deal organized without anyone doing manual data entry. Game changer.",
    initials: "KL",
    color: "#8b5cf6",
  },
  {
    name: "Arunee T.",
    role: "Online Course Creator",
    quote:
      "My enrollment process used to be a mess of LINE messages. Now every student's details are captured automatically and the workflow moves them to the next stage on its own.",
    initials: "AT",
    color: "#3b82f6",
  },
  {
    name: "Sompon C.",
    role: "Retail Chain Manager",
    quote: "The smart reminders alone saved us from losing 3 big orders last month. The AI knows exactly when to ping the right person.",
    initials: "SC",
    color: "#06b6d4",
  },
  {
    name: "Michelle Ng",
    role: "Property Developer",
    quote:
      "Our sales team hated CRM tools. They just use LINE like they always did — LeadMighty quietly captures everything in the background. Adoption was instant.",
    initials: "MN",
    color: "#6366f1",
  },
  {
    name: "Tanawat P.",
    role: "Education Startup Founder",
    quote:
      "I was skeptical about AI understanding Thai customer messages. It works perfectly. Extracted names, dates, and course selections without any setup at all.",
    initials: "TP",
    color: "#8b5cf6",
  },
  {
    name: "Chaiporn S.",
    role: "Hotel Sales Coordinator",
    quote: "Managing inquiries across 8 LINE groups was chaos. LeadMighty syncs it all. Our front desk team doesn't even know they're using a CRM.",
    initials: "CS",
    color: "#0ea5e9",
  },
  {
    name: "Lisa K.",
    role: "Fitness Studio Owner",
    quote:
      "Set up a workflow for our trial class signups in one afternoon. The AI picks up every detail from LINE — name, preferred class time, fitness goals. Zero manual work from us.",
    initials: "LK",
    color: "#7c3aed",
  },
];

// Distribute across 4 columns for a masonry feel (varying card heights per column)
const columns = [
  [testimonials[0], testimonials[4]],
  [testimonials[1], testimonials[5]],
  [testimonials[2], testimonials[6]],
  [testimonials[3], testimonials[7]],
];

function TestimonialCard({ t }: { t: (typeof testimonials)[0] }) {
  return (
    <div className="group rounded-2xl p-6 lm-card transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-indigo-300/50 dark:hover:border-indigo-500/35 cursor-default">
      {/* Author */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: t.color }}
        >
          {t.initials}
        </div>
        <div>
          <p className="text-sm font-semibold lm-h1 leading-tight">{t.name}</p>
          <p className="text-xs lm-muted mt-0.5">{t.role}</p>
        </div>
      </div>

      {/* Quote */}
      <blockquote className="text-sm leading-relaxed lm-body">
        &ldquo;{t.quote}&rdquo;
      </blockquote>

      {/* Hover glow border accent */}
      <div className="mt-4 h-0.5 w-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 group-hover:w-full opacity-0 group-hover:opacity-100" />
    </div>
  );
}

export default function WallOfLoveSection() {
  return (
    <section className="lm-page">
      <div className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest lm-label">
              Customer Stories
            </p>
            <h2 className="text-3xl font-extrabold lm-h1 sm:text-4xl">
              Teams closing more with LINE
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg lm-body">
              Real businesses using LeadMighty to automate their sales workflows.
            </p>
          </div>

          {/* 4-column masonry on desktop */}
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-4 lg:items-start">
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-4">
                {col.map((t, ti) => (
                  <TestimonialCard key={ti} t={t} />
                ))}
              </div>
            ))}
          </div>

          {/* 2-column on tablet */}
          <div className="hidden sm:grid sm:grid-cols-2 sm:gap-4 sm:items-start lg:hidden">
            {[
              [testimonials[0], testimonials[2], testimonials[4], testimonials[6]],
              [testimonials[1], testimonials[3], testimonials[5], testimonials[7]],
            ].map((col, ci) => (
              <div key={ci} className="flex flex-col gap-4">
                {col.map((t, ti) => (
                  <TestimonialCard key={ti} t={t} />
                ))}
              </div>
            ))}
          </div>

          {/* 1-column on mobile */}
          <div className="sm:hidden flex flex-col gap-4">
            {testimonials.map((t, i) => (
              <TestimonialCard key={i} t={t} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
