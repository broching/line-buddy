const testimonials = [
  {
    name: "Priya Mehta",
    role: "Real Estate Sales Manager",
    quote:
      "Before LeadMighty, my agents were copy-pasting client info from LINE into spreadsheets. Now the AI does it automatically. We close 30% faster.",
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
      "My enrollment process used to be a mess across LINE messages. Now every student's details are captured automatically and the workflow moves them to the next stage on its own.",
    initials: "AT",
    color: "#3b82f6",
  },
  {
    name: "Sompon C.",
    role: "Retail Chain Manager",
    quote:
      "The smart reminders alone saved us from losing 3 big orders last month. The AI knows exactly when to ping the right person.",
    initials: "SC",
    color: "#06b6d4",
  },
  {
    name: "Michelle Ng",
    role: "Property Developer",
    quote:
      "Our sales team hated CRM tools. They just use LINE like they always did — LeadMighty quietly captures everything in the background.",
    initials: "MN",
    color: "#6366f1",
  },
  {
    name: "Tanawat P.",
    role: "Education Startup Founder",
    quote:
      "I was skeptical about AI understanding Thai customer messages. It works perfectly. Extracted names, dates, and course selections without any setup.",
    initials: "TP",
    color: "#8b5cf6",
  },
];

export default function WallOfLoveSection() {
  const col1 = testimonials.slice(0, 2);
  const col2 = testimonials.slice(2, 4);
  const col3 = testimonials.slice(4, 6);

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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[col1, col2, col3].map((col, ci) => (
              <div key={ci} className="space-y-4">
                {col.map((t, ti) => (
                  <div key={ti} className="rounded-2xl p-6 lm-card">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ background: t.color }}
                      >
                        {t.initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold lm-h1">{t.name}</p>
                        <p className="text-xs lm-muted">{t.role}</p>
                      </div>
                    </div>
                    <blockquote className="mt-4 text-sm leading-relaxed lm-body">
                      &ldquo;{t.quote}&rdquo;
                    </blockquote>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
