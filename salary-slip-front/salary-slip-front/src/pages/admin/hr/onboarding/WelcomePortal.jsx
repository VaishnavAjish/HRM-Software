import { Eye, Pencil } from "lucide-react";
import Button from "../../../../components/ui/Button";
import Timeline from "../../../../components/onboarding/Timeline";
import PageHeader from "../../../../components/onboarding/PageHeader";
import {
  Avatar,
  Eyebrow,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";

const PEOPLE = [
  ["Rakesh Menon", "Reporting manager · Manufacturing"],
  ["Meera Kulkarni", "HR Operations Lead"],
  ["Rohit Chauhan", "Onboarding buddy · Maintenance"],
  ["Sana Qureshi", "IT support contact"],
];

const TASKS = [
  ["Upload cancelled cheque", "Due today", "bad", "Overdue"],
  ["Accept 2 policies", "Due 06 Aug", "warn", "Open"],
  ["Complete safety training", "Due 08 Aug", "warn", "Open"],
  ["Acknowledge safety kit", "Completed 02 Aug", "ok", "Done"],
];

export default function WelcomePortal() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Welcome portal"
        subtitle="What a new joiner sees on day one — personalised per journey"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Eye size={15} />}>
              Preview as employee
            </Button>
            <Button size="sm" icon={<Pencil size={15} />}>
              Edit content
            </Button>
          </>
        }
      />

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#171a3d] to-[#0d0e1e] px-7 py-6 text-white">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full"
          style={{ background: "radial-gradient(circle, rgb(99 102 241 / 0.42), transparent 68%)" }}
          aria-hidden="true"
        />
        <div className="relative">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-indigo-300">
            Day 1 · 04 August 2026
          </span>
          <h2 className="mt-2 text-[25px] font-semibold tracking-tight">
            Welcome to Nidhi Impex, Shailesh.
          </h2>
          <p className="mt-1.5 max-w-[56ch] text-[13.5px] text-indigo-100/70">
            We&apos;re glad you&apos;re here. Your first day starts at 9:00 AM at the Vapi Plant,
            Gate 2. Meera from HR will meet you at reception and hand over your safety kit.
          </p>
          <div className="mt-5 flex flex-wrap gap-6">
            {[
              ["09:00 AM", "Reporting time"],
              ["Vapi Plant · Gate 2", "Location"],
              ["Rakesh Menon", "Reporting manager"],
              ["NI-24817", "Employee code"],
            ].map(([v, l]) => (
              <div key={l}>
                <b className="block text-base font-semibold tracking-tight">{v}</b>
                <small className="text-[11px] text-indigo-200/60">{l}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <SectionCard title="Your first week">
            <div className="p-4">
              <Timeline
                items={[
                  {
                    tone: "ok",
                    title: "Day 1 — Induction & safety briefing",
                    description: "09:00 · Training Hall A with Meera Kulkarni",
                    at: "Mon 04 Aug",
                  },
                  {
                    tone: "brand",
                    title: "Day 1 — Meet your team",
                    description: "14:00 · Production floor walkthrough",
                    at: "Mon 04 Aug",
                  },
                  {
                    tone: "idle",
                    title: "Day 2 — Quality systems orientation",
                    description: "10:00 · ISO 9001 module and assessment",
                    at: "Tue 05 Aug",
                  },
                  {
                    tone: "idle",
                    title: "Day 3 — Shift handover shadowing",
                    description: "06:00 · With Rohit Chauhan",
                    at: "Wed 06 Aug",
                  },
                  {
                    tone: "idle",
                    title: "Day 5 — First check-in with your manager",
                    description: "16:00 · 30 minutes",
                    at: "Fri 08 Aug",
                  },
                ]}
              />
            </div>
          </SectionCard>
        </div>

        <div className="col-span-12 flex flex-col gap-4 lg:col-span-4">
          <SectionCard title="Your people">
            <div className="flex flex-col gap-3 p-4">
              {PEOPLE.map(([name, role]) => (
                <div key={name} className="flex items-center gap-2.5">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[12.5px] font-semibold">{name}</b>
                    <small className="block truncate text-[11.5px] text-gray-400">{role}</small>
                  </div>
                  <Button variant="ghost" size="sm">
                    Message
                  </Button>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Your outstanding tasks">
            <div className="flex flex-col gap-3 p-4">
              {TASKS.map(([title, due, tone, label]) => (
                <div key={title} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[12.5px] font-semibold">{title}</b>
                    <small className="text-[11.5px] text-gray-400">{due}</small>
                  </div>
                  <StatusPill tone={tone}>{label}</StatusPill>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {[
          ["Company overview", "Who we are, what we make, and where we operate."],
          ["Employee handbook", "Policies, entitlements and expectations in one place."],
          ["Office information", "Gate access, canteen timings, transport and parking."],
          ["Important contacts", "HR, IT, payroll and facilities, with response times."],
          ["Frequently asked", "The twenty questions new joiners ask most often."],
          ["Company announcements", "What has happened across the group this month."],
        ].map(([title, desc]) => (
          <div key={title} className="col-span-12 sm:col-span-6 xl:col-span-4">
            <SectionCard>
              <div className="p-4">
                <Eyebrow>Portal section</Eyebrow>
                <h3 className="mb-1 mt-1.5 text-[14.5px] font-semibold">{title}</h3>
                <p className="mb-3 text-[12.5px] text-gray-500 dark:text-gray-400">{desc}</p>
                <Button variant="secondary" size="sm">
                  Open
                </Button>
              </div>
            </SectionCard>
          </div>
        ))}
      </div>
    </div>
  );
}
