import OperationsCore from '@/components/OperationsCore';
import './HomePage.css';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FolderKanban,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { buttonClasses } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

const CAPABILITIES = [
  { icon: Users, title: 'People & teams', description: 'Keep employee records, reporting lines and project membership clear.' },
  { icon: Bot, title: 'AI operations assistant', description: 'Ask about overdue work or prepare a reassignment request for review.' },
  { icon: FolderKanban, title: 'Project ownership', description: 'Give each project a manager, active members and visible progress.' },
  { icon: CheckSquare, title: 'Task management', description: 'Create and track work with an owner, due date, priority and status.' },
  { icon: ShieldCheck, title: 'Approvals & safety', description: 'Review task reassignment requests before any assignment changes.' },
  { icon: Activity, title: 'AI usage & costs', description: 'Review recorded provider token usage and cost when pricing is available.' },
];

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`fp-home-reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

function tiltCard(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;
  event.currentTarget.style.setProperty('--pointer-x', `${(x + 0.5) * 100}%`);
  event.currentTarget.style.setProperty('--pointer-y', `${(y + 0.5) * 100}%`);
  event.currentTarget.style.transform = `perspective(1100px) rotateX(${y * -2.2}deg) rotateY(${x * 2.5}deg) translateY(-3px)`;
}

function resetCard(event: PointerEvent<HTMLElement>) {
  event.currentTarget.style.transform = '';
}

function PreviewFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`fp-preview relative overflow-hidden rounded-xl border border-white/[0.09] bg-[#0a1220]/90 p-3.5 sm:p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <i className="h-1.5 w-1.5 rounded-full bg-brand-400/80" />
          <i className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <i className="h-1.5 w-1.5 rounded-full bg-white/20" />
        </span>
        <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8293ac]">Illustrative preview</span>
      </div>
      {children}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  className = '',
  children,
  delay = 0,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <Reveal className={className} delay={delay}>
      <article
        onPointerMove={tiltCard}
        onPointerLeave={resetCard}
        className="fp-home-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#243956] bg-[linear-gradient(145deg,rgba(19,34,55,0.96),rgba(10,18,31,0.98))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.20)] sm:rounded-[1.35rem] sm:p-5"
      >
        <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden="true">
          <div className="fp-card-grid absolute inset-0" />
          <div className="fp-card-light absolute inset-0" />
        </div>
        <div className="relative z-10 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#4d83e8]/20 bg-[#18315a] text-[#9fc0ff] transition-colors group-hover:border-brand-400/35 group-hover:text-brand-300">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-[15px] font-semibold tracking-tight text-[#f3f7ff] sm:text-base">{title}</h3>
            <p className="mt-1.5 max-w-prose text-xs leading-[1.65] text-[#a6b4c8] sm:text-[13px]">{description}</p>
          </div>
          <ArrowUpRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-[#617693] transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-300" aria-hidden="true" />
        </div>
        <div className="relative z-10 mt-4 min-w-0 flex-1 sm:mt-5">{children}</div>
      </article>
    </Reveal>
  );
}

function PeoplePreview() {
  return (
    <PreviewFrame className="h-full min-h-[178px]">
      <div className="grid grid-cols-[1fr_auto] gap-4">
        <div className="space-y-2.5">
          {[
            { initials: 'AM', name: 'Alex Morgan', role: 'Manager', color: 'bg-[#244a82]' },
            { initials: 'JL', name: 'Jordan Lee', role: 'Employee', color: 'bg-[#314b72]' },
            { initials: 'SK', name: 'Sam Kim', role: 'Employee', color: 'bg-[#584974]' },
          ].map((person, index) => (
            <div key={person.initials} className={`fp-preview-row flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 ${index ? 'ml-5' : ''}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${person.color} text-[9px] font-semibold text-white`}>{person.initials}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#e1e9f5]">{person.name}</span>
              <span className="shrink-0 text-[9px] text-[#91a1b7]">{person.role}</span>
            </div>
          ))}
        </div>
        <div className="hidden min-w-[118px] flex-col justify-center rounded-lg border border-[#314965] bg-[#14243a]/80 px-3 py-2 sm:flex">
          <span className="text-[9px] uppercase tracking-wider text-[#8194ae]">Reporting line</span>
          <span className="mt-2 flex items-center gap-1.5 text-[10px] text-[#dce7f6]"><span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Manager → team</span>
          <span className="mt-1.5 text-[9px] leading-relaxed text-[#8799b1]">Project membership stays separate.</span>
        </div>
      </div>
    </PreviewFrame>
  );
}

function AgentPreview() {
  return (
    <PreviewFrame className="flex h-full min-h-[178px] flex-col justify-between">
      <div>
        <div className="ml-auto max-w-[88%] rounded-xl rounded-br-sm border border-[#31558a] bg-[#18335a]/80 px-3 py-2 text-[10px] leading-relaxed text-[#e4edfc]">
          Show overdue tasks for my team
        </div>
        <div className="mt-3 flex gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-brand-400/25 bg-brand-400/10 text-brand-300"><Sparkles className="h-3.5 w-3.5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] leading-relaxed text-[#d5dfed]">I’ll check overdue, incomplete tasks in your permitted scope.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="rounded-md border border-[#314863] bg-[#142237] px-2 py-1 text-[9px] text-[#afbdd0]">Role-scoped</span>
              <span className="rounded-md border border-blue-400/20 bg-blue-400/[0.07] px-2 py-1 text-[9px] text-blue-200">Read-only</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.07] pt-2.5 text-[9px] text-[#8293aa]"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Safe workflow · no unsupported actions</div>
    </PreviewFrame>
  );
}

function ProjectsPreview() {
  return (
    <PreviewFrame className="min-h-[166px]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#e4ecf8]">Studio production</p><p className="mt-1 text-[9px] text-[#899bb2]">Manager-owned project</p></div>
        <span className="shrink-0 rounded-full border border-[#304a72] bg-[#172b4a] px-2 py-1 text-[9px] text-[#a9c2ff]">Active</span>
      </div>
      <div className="mt-4 flex items-center justify-between text-[9px] text-[#94a4b9]"><span>Project progress</span><span>Based on task status</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#23334a]"><div className="fp-progress h-full w-[62%] rounded-full bg-gradient-to-r from-[#3679e8] to-[#87aaff]" /></div>
      <div className="mt-3 flex items-center justify-between text-[9px] text-[#8092a9]"><span>Manager and project members</span><span className="flex -space-x-1.5"><i className="h-5 w-5 rounded-full border-2 border-[#0c1625] bg-[#314b72]" /><i className="h-5 w-5 rounded-full border-2 border-[#0c1625] bg-[#584974]" /><i className="h-5 w-5 rounded-full border-2 border-[#0c1625] bg-[#244a82]" /></span></div>
    </PreviewFrame>
  );
}

function TasksPreview() {
  return (
    <PreviewFrame className="min-h-[166px]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 text-[9px]">
        <span className="text-[#8092a9]">Task</span><span className="text-[#8092a9]">Status</span>
        <span className="truncate text-[10px] text-[#dbe5f2]">Review release checklist</span><span className="rounded-full bg-[#172b4a] px-2 py-1 text-blue-200">In progress</span>
        <span className="truncate text-[10px] text-[#dbe5f2]">Prepare build notes</span><span className="rounded-full bg-[#29243e] px-2 py-1 text-[#c6b4ff]">To do</span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.07] pt-2.5 text-[9px] text-[#91a1b7]"><Clock3 className="h-3 w-3 text-brand-300" /> Owner and due date stay visible</div>
    </PreviewFrame>
  );
}

function ApprovalsPreview() {
  return (
    <PreviewFrame className="min-h-[166px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-[10px] font-semibold text-[#e2eaf6]">Task reassignment</p><p className="mt-1 truncate text-[9px] text-[#8fa1b8]">Review requested change</p></div>
        <span className="shrink-0 rounded-full border border-[#745b31] bg-[#302719] px-2 py-1 text-[9px] text-[#f4cb7b]">High risk</span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 text-[9px] text-[#bac7d8]"><span className="truncate">Current assignee</span><ArrowRight className="h-3 w-3 shrink-0 text-[#f3b447]" /><span className="truncate">Requested assignee</span></div>
      <div className="mt-3 flex items-center gap-1.5 text-[9px] text-[#91a4b9]"><CheckCircle2 className="h-3.5 w-3.5 text-blue-300" /> Decision and execution are recorded</div>
    </PreviewFrame>
  );
}

function UsagePreview() {
  const bars = [36, 62, 48, 78, 55, 88, 66, 96, 72, 84, 59, 74];
  return (
    <PreviewFrame className="min-h-[166px]">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[9px] uppercase tracking-wider text-[#91a2b8]">Recorded AI usage</p><p className="mt-1 text-[13px] font-semibold text-[#eff5ff]">Tokens & cost</p></div>
        <span className="rounded-md border border-[#314760] bg-[#142237] px-2 py-1 text-[9px] text-[#a9bdd7]">Daily view</span>
      </div>
      <div className="mt-3 flex h-[54px] items-end gap-1.5 border-b border-white/[0.08] pb-1">
        {bars.map((height, index) => <i key={index} className="fp-usage-bar flex-1 rounded-t-[3px] bg-gradient-to-t from-[#2761b8] to-[#87aaff]" style={{ height: `${height}%`, animationDelay: `${index * 35}ms` }} />)}
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-[#8799b0]">Cost stays unavailable when provider usage or pricing is not verified.</p>
    </PreviewFrame>
  );
}

export default function HomePage() {
  const user = useAuthStore((state) => state.user);
  const cta = user ? (
    <Link to="/dashboard" className={buttonClasses({ variant: 'primary' })}>
      Open dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  ) : (
    <>
      <Link to="/register" className={buttonClasses({ variant: 'primary' })}>
        Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <Link to="/login" className={buttonClasses({ variant: 'secondary' })}>Sign in</Link>
    </>
  );

  return (
    <div className="fp-home relative isolate overflow-hidden bg-[#080f1c] text-[#edf3fc]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="fp-home-grid absolute inset-0 opacity-40" />
        <div className="fp-home-beam fp-home-beam-one absolute -top-36 left-[14%] h-[520px] w-[190px] -rotate-[32deg]" />
        <div className="fp-home-beam fp-home-beam-two absolute -right-14 top-20 h-[500px] w-[130px] rotate-[30deg]" />
        <div className="fp-home-orb absolute -left-40 top-20 h-[460px] w-[460px] rounded-full" />
        <div className="fp-home-orb fp-home-orb-blue absolute -right-48 top-[32rem] h-[430px] w-[430px] rounded-full" />
        <div className="fp-home-stars absolute inset-0" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:px-8 lg:pt-[4.5rem]">
        <section className="relative mx-auto max-w-4xl text-center">
          <div className="fp-hero-enter inline-flex items-center gap-2 rounded-full border border-[#3d72bb]/50 bg-[#132540]/80 px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-[#b7d0ff] shadow-[0_0_24px_rgba(48,113,217,0.13)] sm:text-xs">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4c75e8] opacity-30 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#87aaff]" /></span>
            AI OPERATIONS CONTROL CENTER
          </div>
          <h1 className="fp-hero-enter mt-6 text-[2.65rem] font-semibold leading-[1.04] tracking-[-0.055em] text-[#f4f7fd] [text-wrap:balance] sm:mt-7 sm:text-6xl lg:text-[5.15rem]">
            Run Your Studio.<span className="block text-blue-300">Not the Chaos.</span>
          </h1>
          <p className="fp-hero-enter mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#aab9ce] sm:mt-6 sm:text-base sm:leading-8">
            One intelligent workspace to coordinate people, projects, tasks and AI-powered operations — with control, approvals and accountability.
          </p>
          <div className="fp-hero-enter mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-8">{cta}<a href="#platform" className="px-4 py-2 text-sm text-blue-200">Explore Platform ↓</a></div>
          <p className="mt-4 text-[10px] tracking-wide text-[#71839a] sm:text-[11px]">Clear ownership · Safer changes · Useful operational context</p>
        </section>

        <OperationsCore />
        <section id="platform" aria-label="FlowPilot product capabilities" className="relative mt-12 sm:mt-16 lg:mt-[4.5rem]">
          <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#68c1e7] sm:text-[10px]">One connected workspace</p>
              <h2 className="mt-2 text-lg font-medium tracking-tight text-[#e8effa] sm:text-xl">Work stays visible from team to task</h2>
            </div>
            <span className="hidden items-center gap-1.5 text-[10px] text-[#778ca7] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Built around real workflows</span>
          </div>

          <div className="fp-home-grid-cards grid auto-rows-auto grid-cols-1 gap-3.5 sm:gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(230px,auto)]">
            <FeatureCard icon={Users} title={CAPABILITIES[0].title} description={CAPABILITIES[0].description} className="lg:col-span-7" delay={0}>
              <PeoplePreview />
            </FeatureCard>
            <FeatureCard icon={Bot} title={CAPABILITIES[1].title} description={CAPABILITIES[1].description} className="lg:col-span-5" delay={55}>
              <AgentPreview />
            </FeatureCard>
            <FeatureCard icon={FolderKanban} title={CAPABILITIES[2].title} description={CAPABILITIES[2].description} className="lg:col-span-5" delay={100}>
              <ProjectsPreview />
            </FeatureCard>
            <FeatureCard icon={CheckSquare} title={CAPABILITIES[3].title} description={CAPABILITIES[3].description} className="lg:col-span-7" delay={145}>
              <TasksPreview />
            </FeatureCard>
            <FeatureCard icon={ShieldCheck} title={CAPABILITIES[4].title} description={CAPABILITIES[4].description} className="lg:col-span-5" delay={190}>
              <ApprovalsPreview />
            </FeatureCard>
            <FeatureCard icon={Activity} title={CAPABILITIES[5].title} description={CAPABILITIES[5].description} className="lg:col-span-7" delay={235}>
              <UsagePreview />
            </FeatureCard>
          </div>
        </section>

        <Reveal><section id="operations-workflow" className="operations-workflow" aria-label="Safe workflow sequence">
          <h2>Control at every step.</h2>
          <p>Risky task reassignment requires an authorized manager or admin approval.</p>
          <ol>{['Understand', 'Plan', 'Risk check', 'Approve', 'Execute', 'Verify'].map((step, index) => <li key={step} style={{ animationDelay: `${index}s` }}><small>0{index + 1}</small>{step}</li>)}</ol>
        </section></Reveal>
        <section className="relative mt-12 overflow-hidden rounded-2xl border border-[#294365] bg-[linear-gradient(110deg,rgba(17,34,57,0.96),rgba(11,20,34,0.96))] px-5 py-6 sm:mt-16 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:px-8 sm:py-7">
          <div className="pointer-events-none absolute -right-10 -top-24 h-52 w-52 rounded-full bg-[#2679d8]/15 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-brand-300"><span className="h-px w-5 bg-brand-400" />Start with the work you already manage</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#f0f5fc] sm:text-2xl">Bring people, projects and tasks into focus.</h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-[#a4b3c8] sm:text-sm">Link existing accounts, set up a managed project, then assign work to its active members.</p>
          </div>
          <div className="relative mt-5 shrink-0 sm:mt-0">{user ? <Link to="/dashboard" className={buttonClasses({ variant: 'primary' })}>Open dashboard <ArrowRight className="h-4 w-4" /></Link> : <Link to="/register" className={buttonClasses({ variant: 'primary' })}>Create your account <ArrowRight className="h-4 w-4" /></Link>}</div>
        </section>
      </div>

      <style>{`
        .fp-home { isolation:isolate; }
        .fp-home-grid { background-image:linear-gradient(rgba(89,137,204,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(89,137,204,.07) 1px,transparent 1px);background-size:54px 54px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.6),transparent 76%); }
        .fp-home-beam { background:linear-gradient(180deg,transparent,rgba(40,124,227,.12),rgba(135,170,255,.08),transparent);filter:blur(28px);animation:fp-home-beam 13s ease-in-out infinite alternate; }
        .fp-home-beam-two { animation-delay:-6s;opacity:.65; }
        .fp-home-orb { background:radial-gradient(circle,rgba(36,99,202,.19),transparent 68%);filter:blur(28px); }
        .fp-home-orb-blue { background:radial-gradient(circle,rgba(76,117,232,.13),transparent 68%); }
        .fp-home-stars { background-image:radial-gradient(circle at 18% 24%,rgba(157,204,255,.4) 1px,transparent 1.7px),radial-gradient(circle at 76% 16%,rgba(135,170,255,.4) 1px,transparent 1.8px),radial-gradient(circle at 88% 52%,rgba(157,204,255,.28) 1px,transparent 1.8px),radial-gradient(circle at 35% 72%,rgba(135,170,255,.26) 1px,transparent 1.8px);background-size:310px 270px;opacity:.27; }
        .fp-home-reveal { height:100%;opacity:0;transform:translateY(12px);transition:opacity 520ms ease,transform 520ms cubic-bezier(.2,.7,.2,1);transition-delay:var(--reveal-delay,0ms); }
        .fp-home-reveal.is-visible { opacity:1;transform:translateY(0); }
        .fp-home-card { transform-style:preserve-3d;transition:transform 180ms ease,border-color 260ms ease,box-shadow 260ms ease; }
        .fp-home-card:hover { border-color:rgba(83,153,231,.55);box-shadow:0 24px 70px rgba(0,0,0,.3),0 0 28px rgba(47,131,222,.09); }
        .fp-card-grid { background-image:linear-gradient(rgba(84,129,189,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(84,129,189,.055) 1px,transparent 1px);background-size:30px 30px;mask-image:linear-gradient(135deg,black,transparent 75%); }
        .fp-card-light { background:radial-gradient(320px circle at var(--pointer-x,80%) var(--pointer-y,0%),rgba(58,140,231,.12),transparent 56%); }
        .fp-preview-row { animation:fp-home-row-in 520ms both; }
        .fp-preview-row:nth-child(2) { animation-delay:100ms; }
        .fp-preview-row:nth-child(3) { animation-delay:180ms; }
        .fp-progress { transform-origin:left;animation:fp-home-progress 900ms 180ms cubic-bezier(.2,.8,.2,1) both; }
        .fp-usage-bar { transform-origin:bottom;animation:fp-home-bar 650ms both; }
        .fp-hero-enter { animation:fp-home-enter 700ms cubic-bezier(.2,.7,.2,1) both; }
        .fp-hero-enter:nth-child(2) { animation-delay:80ms; }
        .fp-hero-enter:nth-child(3) { animation-delay:150ms; }
        .fp-hero-enter:nth-child(4) { animation-delay:220ms; }
        @keyframes fp-home-enter { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
        @keyframes fp-home-row-in { from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)} }
        @keyframes fp-home-progress { from{transform:scaleX(0)}to{transform:scaleX(1)} }
        @keyframes fp-home-bar { from{transform:scaleY(0)}to{transform:scaleY(1)} }
        @keyframes fp-home-beam { from{transform:translate3d(-10px,-10px,0) rotate(-32deg);opacity:.35}to{transform:translate3d(20px,18px,0) rotate(-26deg);opacity:.8} }
        @media (prefers-reduced-motion:reduce) { .fp-home *, .fp-home *::before, .fp-home *::after { animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important; } .fp-home-reveal { opacity:1;transform:none; } .fp-home-card { transform:none!important; } }
        @media (pointer:coarse) { .fp-home-card { transform:none!important; } }
      `}</style>
    </div>
  );
}
