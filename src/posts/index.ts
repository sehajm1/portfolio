export interface Post {
  slug: string;
  title: string;
  platform: string;
  tags: string[];
  date: string;
  description: string;
  content: string;
}

export const POSTS: Post[] = [
  {
    slug: 'live-chat-performance',
    title: 'Why Your Live Chat UI Breaks at 1000 Messages Per Second (And How to Fix It)',
    platform: 'dev.to',
    tags: ['React', 'Performance', 'WebSocket'],
    date: '2025-06-17',
    description: 'Three concrete fixes for the render bottleneck that kills chat UIs at scale: buffered state flushing, virtual scrolling, and off-thread filtering with Web Workers.',
    content: `
Picture this: a streamer with 200 followers goes viral. Within four minutes, their viewer count jumps from 200 to 80,000. The chat panel, which worked perfectly in testing, becomes an unresponsive blur. New messages stack up faster than the browser can render them.

This is not a hypothetical. It is the exact failure mode that live streaming platforms encounter when their chat implementation scales past the assumptions it was built on. I ran into this while building StreamRoom, and spent two weeks going from a broken chat to one that handles 1,000+ messages per second at 60fps. Here is what I learned.

## The Problem: Naive React State at Scale

Start with the simplest possible implementation. A WebSocket connection pushes messages, each one calls \`setState\`:

\`\`\`tsx
const [messages, setMessages] = useState<Message[]>([]);

useEffect(() => {
  socket.on('message', (msg: Message) => {
    setMessages(prev => [...prev, msg]);
  });
}, []);
\`\`\`

This works at 5 messages per second. At 100 per second, things feel laggy. At 500, the browser tab becomes visibly unresponsive. At 1,000, you have broken the UI.

Every call to \`setMessages\` schedules a React re-render. Each re-render touches the entire messages array, diffs the virtual DOM, and commits changes to the real DOM. At 1,000 messages per second, you are asking React to perform 1,000 render cycles per second on a single thread, while also handling user interactions and animations.

Open React DevTools Profiler while this is running and look at the flame graph. You will see \`ChatPanel\` re-rendering continuously, each render taking 12-40ms. The browser's frame budget is 16.67ms for 60fps. You are consistently blowing it.

There are three problems layered on top of each other:

1. **Render frequency** -- state updates are too frequent
2. **DOM node count** -- every message is a mounted DOM node
3. **Memory growth** -- the messages array grows without bound

## Fix 1: Decouple Render Rate From Message Arrival Rate

The key insight: humans cannot read chat at 1,000 messages per second. The UI does not need to update at the same rate messages arrive. It needs to update at a rate that feels responsive, roughly 10 times per second (100ms intervals).

Buffer incoming messages in a \`useRef\` (no re-renders triggered) and flush to state on a fixed interval:

\`\`\`tsx
const [messages, setMessages] = useState<Message[]>([]);
const buffer = useRef<Message[]>([]);

useEffect(() => {
  socket.on('message', (msg: Message) => {
    buffer.current.push(msg);
  });

  const interval = setInterval(() => {
    if (buffer.current.length === 0) return;
    setMessages(prev => {
      const next = [...prev, ...buffer.current];
      buffer.current = [];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, 100);

  return () => {
    clearInterval(interval);
    socket.off('message');
  };
}, []);
\`\`\`

This reduces re-renders from 1,000/sec to 10/sec -- a 100x improvement. The array cap prevents unbounded memory growth regardless of stream duration.

## Fix 2: Virtual Scrolling

Even after fixing render frequency, 500 DOM nodes sit in the chat panel. Layout and Paint phases cost 8-15ms per frame just from those nodes. On a mid-range Android device, worse.

The fix: only mount nodes that are visible in the viewport. If the panel shows 20 messages, mount 20 plus a small overscan buffer, regardless of total message count.

\`\`\`tsx
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

const ChatPanel = ({ messages }: { messages: Message[] }) => {
  const listRef = useRef<FixedSizeList>(null);

  useEffect(() => {
    listRef.current?.scrollToItem(messages.length - 1, 'end');
  }, [messages.length]);

  const Row = ({ index, style }) => (
    <div style={style} className={styles.row}>
      <span style={{ color: messages[index].color }}>{messages[index].username}</span>
      <span>{messages[index].text}</span>
    </div>
  );

  return (
    <AutoSizer>
      {({ height, width }) => (
        <FixedSizeList
          ref={listRef}
          height={height}
          width={width}
          itemCount={messages.length}
          itemSize={52}
          overscanCount={8}
        >
          {Row}
        </FixedSizeList>
      )}
    </AutoSizer>
  );
};
\`\`\`

DOM node count drops from 500 to roughly 30, constant, regardless of message history length.

## Fix 3: Web Worker for Filtering

For chat search or filtering, \`Array.filter()\` in the render cycle costs 2-5ms across 500 messages. Move it off the main thread:

\`\`\`ts
// chat-worker.ts
self.onmessage = (e) => {
  const { messages, query } = e.data;
  const filtered = messages.filter(m =>
    m.text.toLowerCase().includes(query.toLowerCase())
  );
  self.postMessage(filtered);
};
\`\`\`

\`\`\`tsx
const worker = useRef<Worker>();

useEffect(() => {
  worker.current = new Worker(new URL('./chat-worker.ts', import.meta.url), { type: 'module' });
  worker.current.onmessage = (e) => setFilteredMessages(e.data);
  return () => worker.current?.terminate();
}, []);
\`\`\`

The \`new URL('./chat-worker.ts', import.meta.url)\` pattern is Vite-native and handles bundling automatically.

## Benchmarks

Testing on MacBook Pro M2 and Pixel 6a via Chrome DevTools remote debugging:

| Scenario | Naive | Buffered | + Virtual scroll | + Worker |
|---|---|---|---|---|
| 100 msg/sec, desktop FPS | 28 | 58 | 60 | 60 |
| 500 msg/sec, desktop FPS | 9 | 52 | 60 | 60 |
| 1,000 msg/sec, desktop FPS | ~2 | 44 | 60 | 60 |
| DOM nodes (chat panel) | 500 | 500 | ~30 | ~30 |
| Memory after 10 min | 312 MB | 18 MB | 18 MB | 18 MB |

The memory figure for the naive implementation is not a typo. Every message persisted in state, never cleaned up, on a stream running for 10 minutes at 100 msg/sec is 60,000 message objects.

## The Bigger Picture

Everything here is a specialisation of one principle: decouple data arrival rate from render rate, and decouple render rate from DOM mutation rate. In a CRUD app these three rates are basically the same. In a live streaming product they diverge dramatically. Data can arrive 1,000x faster than a human can perceive, and 100x faster than the browser frame budget.

The same techniques apply to any high-frequency event-driven UI: real-time dashboards, collaborative editors, trading platforms, sports scoreboards. The live chat problem is just the most visible because the consequences are immediate and the users will immediately tell you about it.

*Source code is in the [StreamRoom repository](https://github.com/sehajm1/streamroom).*
    `.trim(),
  },
  {
    slug: 'cross-platform-vue-tauri',
    title: 'Building a Cross-Platform LIVE Dashboard With Vue 3 and Tauri: One Codebase, Three Targets',
    platform: 'Hashnode',
    tags: ['Vue 3', 'Tauri', 'Multi-end'],
    date: '2025-06-10',
    description: 'How to build a broadcaster operating platform that runs as a web app and a native desktop binary from a single Vue 3 codebase, using a pnpm monorepo and platform-abstraction composables.',
    content: `
Every LIVE platform eventually runs into the same product request: power-user broadcasters want a desktop app. Not a web app pinned to their taskbar -- an actual native desktop application with a tray icon, keyboard shortcuts, and file system access for asset management. But the team already built a web dashboard. Building a second native app means a second codebase, a second deployment pipeline, and two sets of bugs to maintain.

This post documents how I solved this with CreatorOS, a broadcaster operating platform that runs as a native desktop app *and* a responsive web app from a single Vue 3 codebase.

## Why Not Electron?

The honest comparison:

| | Electron | Tauri | Flutter |
|---|---|---|---|
| Bundle size | ~150-200MB | ~3-8MB | ~25MB |
| Runtime | Chromium + Node.js | System WebView + Rust | Dart VM |
| Frontend language | Any web stack | Any web stack | Dart |
| Maturity | High | Medium | High |

Electron's bundle size is the dealbreaker for a LIVE tooling app. A broadcaster downloading your app should not receive a 200MB download that includes an entire Chromium install. Tauri compiles your Vite-built frontend into a native binary using the OS's built-in WebView (WKWebView on macOS, WebView2 on Windows) and a Rust backend. The result launches faster, uses less RAM, and ships as a small binary.

The real tradeoff: Tauri's ecosystem is younger. Some plugins are still in beta, documentation for edge cases is thinner, and breaking changes between major versions need attention.

## Project Structure

CreatorOS is a \`pnpm\` monorepo:

\`\`\`
creatorOS/
├── packages/
│   └── ui/             # Shared Vue 3 component library
├── apps/
│   ├── web/            # Vite + Vue 3, deployed to Vercel
│   └── desktop/        # Tauri + same Vue 3 app, compiled to native binary
└── pnpm-workspace.yaml
\`\`\`

Both apps import from \`@creatorOS/ui\`. The desktop app is not a separate codebase -- it is the exact same Vue application in a Tauri shell.

## Portable Logic With the Composition API

The Composition API's \`use*\` pattern is what makes shared logic genuinely portable. A \`useStreamAnalytics\` composable works identically in both targets:

\`\`\`ts
// packages/ui/src/composables/useStreamAnalytics.ts
export function useStreamAnalytics(sessionId: string) {
  const session = ref<StreamSession | null>(null);
  const loading = ref(false);

  const peakViewers = computed(() => session.value?.peakViewers ?? 0);

  async function fetchSession() {
    loading.value = true;
    try {
      const res = await fetch(\`/api/sessions/\${sessionId}\`);
      session.value = await res.json();
    } finally {
      loading.value = false;
    }
  }

  return { session, loading, peakViewers, fetchSession };
}
\`\`\`

No platform detection, no conditional imports. The analytics logic lives once.

## The \`usePlatform\` Composable

Some features need different implementations per target. The pattern is a composable that abstracts the divergence:

\`\`\`ts
const isTauri = ref(typeof window !== 'undefined' && '__TAURI__' in window);

export function usePlatform() {
  async function sendNotification(title: string, body: string) {
    if (isTauri.value) {
      const { sendNotification: tauriNotify } = await import('@tauri-apps/plugin-notification');
      await tauriNotify({ title, body });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    // silently no-op in unsupported contexts
  }

  return { isTauri, sendNotification };
}
\`\`\`

The composable never throws in an unsupported context -- it silently no-ops or falls back. Component code stays clean.

## Tauri IPC: Calling Rust From Vue

For native file system access, Vue calls a Rust command via \`invoke()\`:

\`\`\`ts
import { invoke } from '@tauri-apps/api/core';

const assets = await invoke<string[]>('get_local_assets', {
  folderPath: '/Users/user/StreamAssets'
});
\`\`\`

The Rust side:

\`\`\`rust
#[command]
fn get_local_assets(folder_path: String) -> Result<Vec<String>, String> {
    std::fs::read_dir(&folder_path)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.is_file() { path.to_str().map(String::from) } else { None }
        })
        .collect::<Vec<_>>()
        .into_ok()
}
\`\`\`

## The Component Library

\`packages/ui\` contains 12 components, each with a Storybook story. The deployed Storybook instance is a concrete artifact a hiring engineer can open and evaluate -- it shows component API design in a way that reading source code does not.

The design rule: every component must be renderable in isolation without any surrounding application context. If it cannot be written as a Storybook story without mocking app state, it is not a proper component.

## i18n

TikTok LIVE operates across dozens of markets simultaneously. Wiring up \`vue-i18n\` early signals you have thought about this:

\`\`\`ts
export function useI18nSetup() {
  return createI18n({
    legacy: false,
    locale: navigator.language.startsWith('zh') ? 'zh-CN' : 'en',
    fallbackLocale: 'en',
    messages: { en, 'zh-CN': zhCN },
  });
}
\`\`\`

The locale detection is intentionally simple -- a production implementation would add a user preference override and respect the \`Accept-Language\` header server-side.

## What I Would Do Differently

**Pin Tauri plugin versions aggressively.** Tauri 2.x introduced breaking changes to plugin APIs. Pin exact versions and read the migration guide before any major bump.

**Test on Windows early.** WebView2 renders some CSS differently from WKWebView. Use the GitHub Actions Windows runner to catch issues in CI rather than after deployment.

*Source code is in the [CreatorOS repository](https://github.com/sehajm1/creatorOS).*
    `.trim(),
  },
  {
    slug: 'incident-automation',
    title: 'I Built an AI System That Automates Post-Incident Reviews at Enterprise Scale',
    platform: 'Hashnode',
    tags: ['Architecture', 'AI', 'Systems'],
    date: '2025-05-28',
    description: 'The architecture behind an automated post-incident review system at a large technology organisation: multi-agent parallel fan-out, timeline reconstruction with confidence scoring, and the 80/20 rule for AI-generated content.',
    content: `
*Note: All details in this post are generalised. No proprietary systems, internal toolnames, or confidential data are referenced.*

Six months into a software engineering internship at a large technology organisation, I was handed a problem that looked simple on the surface: after a major system outage, engineers spend 2-3 days manually aggregating data from five to seven different platforms and then writing a structured post-incident document from it.

The question was whether this could be automated. The short answer is yes, mostly.

## The Problem

The challenge is not just "gather data" -- it is "gather data from N heterogeneous systems with inconsistent schemas, inconsistent timestamps, and missing data, and produce a coherent narrative from it."

At scale, a large organisation might manage thousands of major incidents per year. Each one requires the same manual data aggregation process. The total engineering hours consumed are significant -- we estimated roughly 96,000 hours annually based on real incident data and a conservative 50% automation rate.

The status quo: an engineer opens six browser tabs, logs into six systems, copies timestamps from one, pastes them into a spreadsheet, cross-references with log entries from another, watches a 90-minute conference recording to find the 4 minutes that matter. Then writes a document. Then a reviewer spots a discrepancy and the whole process starts again.

## Why Multi-Agent Architecture

The naive approach is a sequential pipeline:

\`\`\`
Incident ID -> fetch tickets -> fetch logs -> fetch chat -> fetch recordings -> generate document
\`\`\`

The problem: if fetching tickets takes 8 seconds, fetching logs takes 12 seconds, and fetching recordings takes 20 seconds, total latency is 40 seconds. Adding a fourth source adds its latency directly. At seven sources, you have a 60-90 second wait before document generation even begins.

The multi-agent parallel fan-out architecture solves this:

\`\`\`
Incident ID
     |
[ Orchestrator ]
  /   |   |   \\
[A]  [B]  [C]  [D]   <- all run concurrently
     |
[ Timeline Reconstruction ]
     |
[ Document Generation ]
\`\`\`

Total latency is bounded by the slowest single agent, not the sum of all agents. Adding a new data source costs zero additional wall-clock time.

The sub-agent registry -- a plug-and-play interface where any team can register a new data source agent -- is the most consequential architectural decision. Get it right and adding a new source takes a day.

## The Hardest Problem: Timeline Reconstruction

Once you have raw data from multiple sources, the real challenge emerges: none of it is in the same format.

The ticketing system timestamps are in ISO 8601 with timezone offsets. The log platform uses Unix milliseconds. The chat platform uses Unix seconds with fractional parts. Actors are identified by email in one system, by username in another, by display name in a third, and by service account ID in a fourth.

Timeline reconstruction requires:

1. **Timestamp normalisation** -- convert everything to UTC milliseconds
2. **Actor resolution** -- map various identifier formats to a canonical entity
3. **Confidence scoring** -- some timestamps are precise to the millisecond; others are only accurate to the nearest minute. Assign a confidence interval to each event.
4. **Gap flagging** -- when a time window has no corroborating events from any source, flag it explicitly as an observability gap.

The confidence scoring was the design decision I am most pleased with. A naive implementation silently coerces every timestamp to millisecond precision and produces a timeline that looks authoritative but is not. The confidence-aware implementation produces events like:

\`\`\`json
{
  "timestamp_ms": 1706789400000,
  "precision": "minute",
  "confidence": 0.7,
  "source": "chat",
  "description": "On-call engineer opened conference bridge"
}
\`\`\`

The document generator uses this to write differently about high-confidence and low-confidence events.

## The 80/20 Rule for AI-Generated Content

The most important design principle for any system that uses AI to synthesise from real data: be 80% deterministic and 20% intelligent.

The AI component is responsible for exactly one thing: turning a structured, verified timeline into fluent narrative text. It does not determine what happened. It does not assign blame or root cause. It does not make decisions about what to include or exclude. All of those decisions are made by the deterministic pipeline upstream.

The AI is a writer, not an analyst. Engineers reviewing the document can verify every narrative claim against the structured timeline. If the AI writes "the database team was notified at 14:35" and the timeline shows no notification event at 14:35, that discrepancy is immediately visible.

Contrast this with a system where the AI reads raw, unstructured data and produces a narrative directly. The output might be plausible and fluent, but it is not auditable. For a post-incident document that informs engineering decisions and organisational learning, that distinction is the difference between useful and dangerous.

## What I Would Build Differently

**Start with the timeline reconstruction algorithm, not the data connectors.** I built data connectors first because they felt more tangible. The timeline reconstruction problem is harder and more central to the value of the system.

**Build the evaluation rubric on day one.** The blind A/B evaluation work I did in parallel was the most valuable signal-gathering mechanism in the project. Retrofitting evaluation onto a system that is already in use is harder than building it in from the start.

**Design the sub-agent interface as a formal contract.** In the early prototype, each sub-agent was a Python function with an implicit interface. This works fine for three agents and breaks down at ten.
    `.trim(),
  },
  {
    slug: 'performance-budgets',
    title: 'Frontend Performance Budgets: The Engineering Practice That LIVE Platforms Cannot Skip',
    platform: 'dev.to',
    tags: ['Performance', 'CI', 'Frontend'],
    date: '2025-05-14',
    description: 'How to enforce bundle size, LCP, and TBT budgets in CI so performance regressions never reach production silently -- with a complete GitHub Actions setup and the exception workflow that makes it sustainable.',
    content: `
Most frontend teams have a vague sense that performance matters. They know a slow page is bad. They have looked at a Lighthouse score once or twice. Maybe someone complained about Time to Interactive in a Slack channel and everyone agreed to "be more careful."

Then they ship a feature that adds 40KB of JavaScript and nobody notices until a user in a bandwidth-constrained region files a complaint.

Performance budgets solve this. Not because they make your code faster, but because they make performance regressions impossible to ship silently.

## What a Performance Budget Is

A hard limit on specific metrics, enforced in CI. If a commit causes any limit to be breached, the build fails. The commit does not merge.

A concrete example:

\`\`\`json
{
  "bundles": [
    {
      "path": "dist/assets/index-*.js",
      "maxSize": "150 kB",
      "compression": "gzip"
    }
  ],
  "metrics": [
    { "metric": "largest-contentful-paint", "budget": 2500 },
    { "metric": "total-blocking-time", "budget": 200 },
    { "metric": "cumulative-layout-shift", "budget": 0.1 }
  ],
  "thirdParty": { "maxTotalSize": "50 kB" }
}
\`\`\`

These four numbers map to real-world outcomes.

## Why These Four Metrics

**Initial JS Bundle: 150KB (gzip).** This is what the browser must download, parse, and execute before any user-visible rendering begins. On a mid-range Android device -- the median device for streaming audiences in Southeast Asia and Latin America -- JavaScript parsing is 3-5x slower than on a MacBook. A 150KB gzip bundle becomes roughly 450KB uncompressed. The browser processes every byte before the stream UI is interactive.

**LCP: 2500ms on Fast 3G.** Largest Contentful Paint measures when the biggest visible element -- almost always the stream thumbnail or profile image -- appears on screen. At 2.5 seconds, users have visual confirmation the page is loading. Past 4 seconds, bounce rates increase sharply. This is the Google Core Web Vitals "good" threshold.

**Total Blocking Time: 200ms.** Measures total time the main thread is blocked from handling user input. A high TBT means that even though the page looks loaded, tapping a button produces no response for hundreds of milliseconds. On a LIVE viewer page, TBT directly affects how long a first-time viewer waits from "tap the share link" to "I can actually interact."

**Third-Party Script Weight: 50KB.** Analytics, A/B testing, error tracking -- every third-party script is JavaScript the browser loads and executes, over which you have no control over update cadence. The 50KB cap creates a forcing function: evaluate whether each script is worth its weight.

## Enforcing Budgets in CI

A custom Node.js script after \`vite build\`:

\`\`\`js
// scripts/check-bundle.mjs
import { readFileSync } from 'fs';
import { gzipSync } from 'zlib';

const BUDGET_KB = 150;
const stats = JSON.parse(readFileSync('dist/stats.json', 'utf-8'));

const chunks = stats.outputs
  .filter(o => o.entryPoint && o.path.endsWith('.js'))
  .map(o => ({
    name: o.path,
    sizeKb: Math.round(gzipSync(readFileSync(o.path)).length / 1024),
  }));

const violations = chunks.filter(c => c.sizeKb > BUDGET_KB);

if (violations.length > 0) {
  console.error('Bundle budget exceeded:');
  violations.forEach(v =>
    console.error(\`  \${v.name}: \${v.sizeKb}KB (budget: \${BUDGET_KB}KB)\`)
  );
  console.error('Options:');
  console.error('  1. Reduce the bundle (lazy imports, tree shaking, dependency audit)');
  console.error('  2. Add a temporary exception to budget-exceptions.json with a ticket link');
  process.exit(1);
}
\`\`\`

For Lighthouse metrics, use Lighthouse CI:

\`\`\`yaml
# lighthouserc.js
module.exports = {
  ci: {
    collect: { staticDistDir: './dist', numberOfRuns: 3 },
    assert: {
      preset: 'lighthouse:no-pwa',
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
      },
    },
  },
};
\`\`\`

## The Exception Workflow

Budgets will be violated. The question is not whether to allow exceptions, but how to handle them intentionally.

A \`budget-exceptions.json\` committed to the repository:

\`\`\`json
[
  {
    "path": "vendor-chartjs-*.js",
    "reason": "Chart.js upgrade to 4.x increased size by 12KB, tree shaking investigation in PERF-2847",
    "ticket": "PERF-2847",
    "expires": "2025-03-01",
    "addedBy": "sage.maggo"
  }
]
\`\`\`

The CI script checks this before failing. If an exception exists and has not expired, the build passes with a warning. If the exception has expired, the build fails with a message pointing to the ticket.

The \`expires\` field is the crucial element. Without it, exceptions accumulate indefinitely and the budget becomes meaningless. With it, someone is forced to re-evaluate the exception at the ticket's resolution.

## Starting Small

If you have no performance budget today:

1. Run Lighthouse on your most important page. Note the current LCP and bundle size.
2. Set the budget at 20% above the current values. This guarantees no immediate failures while establishing the infrastructure.
3. Add the check to PRs. Watch the numbers for two weeks.
4. Tighten the budget by 10% per month until you reach the target values.

You do not need to hit 150KB and 2.5s LCP immediately. You need to ensure the number never gets worse from this point forward. That alone, consistently enforced, compounds into a significantly faster product over time.

*The budget scripts from this post are open-sourced in the [PerfLens repository](https://github.com/sehajm1/perflens).*
    `.trim(),
  },
  {
    slug: 'multi-agent-components',
    title: 'What Multi-Agent Systems Taught Me About React Component Design',
    platform: 'Hashnode',
    tags: ['React', 'Architecture', 'Systems'],
    date: '2025-05-05',
    description: 'The structural principles that make multi-agent AI systems maintainable are identical to the principles that make React component trees maintainable. Here is why, and what it means for how you design components.',
    content: `
I spent the better part of six months building a multi-agent AI orchestration system -- an automated pipeline where specialised agents run concurrently, each handling one narrow task, feeding results into a central orchestrator. Somewhere around month three, while debugging a state management issue in a React frontend I was building alongside it, I noticed something uncomfortable.

I had been solving the same architectural problem twice, in two completely different contexts, without realising it was the same problem.

The principles that made the multi-agent system maintainable were structurally identical to the principles that make a React component tree maintainable. The terminology was different. The failure modes were different. But the underlying design question -- how do you structure a system of many cooperating units so that adding, changing, or removing one does not break the others -- had the same answer in both domains.

## The Sub-Agent Registry Pattern

In the multi-agent system, the most important architectural decision was the sub-agent registry: a plug-and-play interface where any data source could register an agent that followed a defined contract.

Every agent had to satisfy the same interface:

\`\`\`python
class BaseAgent:
    @abstractmethod
    def fetch(self, incident_id: str) -> AgentResult: ...

    @property
    @abstractmethod
    def source_name(self) -> str: ...

    @property
    @abstractmethod
    def timeout_seconds(self) -> int: ...
\`\`\`

The orchestrator did not know or care what any specific agent did internally. It registered agents, called \`fetch()\` on all of them concurrently, and collected their results. A new data source was a new class. The orchestrator did not change.

## The React Equivalent

Consider a LIVE analytics dashboard with a viewer count chart, a chat rate chart, a gift revenue chart, and a stream health indicator. These four things are conceptually independent.

The sub-agent registry pattern in React:

\`\`\`tsx
interface DashboardPanel {
  title: string;
  dataKey: keyof StreamStats;
  renderChart: (data: number[]) => React.ReactNode;
}

const PANELS: DashboardPanel[] = [
  { title: 'Viewer Count', dataKey: 'viewerTimeline', renderChart: (data) => <LineChart data={data} color="blue" /> },
  { title: 'Chat Rate', dataKey: 'chatRateTimeline', renderChart: (data) => <LineChart data={data} color="green" /> },
  { title: 'Gift Revenue', dataKey: 'giftTimeline', renderChart: (data) => <BarChart data={data} color="gold" /> },
];

const Dashboard = ({ stats }: { stats: StreamStats }) => (
  <div className={styles.grid}>
    {PANELS.map(panel => (
      <PanelCard key={panel.dataKey} title={panel.title}>
        {panel.renderChart(stats[panel.dataKey])}
      </PanelCard>
    ))}
  </div>
);
\`\`\`

The \`Dashboard\` does not know what any specific panel renders. It iterates the registry, calls \`renderChart()\`, and mounts the result. Adding a new panel is adding a new entry to \`PANELS\`. The \`Dashboard\` does not change. Same pattern, different runtime.

## Where the Analogy Breaks: State and Time

The analogy is structurally sound but breaks at a specific point.

Multi-agent systems are designed to be stateless between invocations. An agent fetches data, returns a result, and ceases to exist until the next call. There is no "previous run."

React components are not stateless between renders. A component with \`useState\` or \`useRef\` carries state across renders. This is what makes components more powerful than stateless agents for UI work -- but it also introduces the complexity that stateless agent systems avoid.

The implication: when you design a React component tree, the question of *where state lives* is equivalent to the orchestrator design in a multi-agent system. State that belongs to the interaction between two panels (say, a selected time range that all charts should reflect) belongs at the orchestrator level -- the \`Dashboard\` -- not inside either chart component.

Putting that shared state inside a child component creates the equivalent of an agent that maintains state between invocations and shares it with other agents through a side channel. In multi-agent systems, this pattern is called "hidden coupling." In React, it manifests as a child component that sibling components need to query directly.

The fix in both systems is the same: explicit interfaces. The \`Dashboard\` manages \`selectedTimeRange\` in state, passes it down as a prop, and receives updates via a callback.

## Composability and Emergent Behaviour

In the multi-agent system, interesting behaviour emerged from the *combination* of simple agents, not from any individual agent. The timeline reconstruction algorithm -- which produced something genuinely useful -- was entirely about how results were combined, not about anything individual agents did.

The same is true of React component trees. The page-level UX emerges from simple, well-defined components. This is why composability is the highest-order design value in both systems.

A \`LineChart\` that knows about viewer counts is less useful than a \`LineChart\` that renders any data you give it. A \`StreamHealthBadge\` that internally fetches stream health data is less composable than one that accepts status as a prop.

## Observability: Flag Gaps Explicitly

One principle from the multi-agent system I have started applying directly to frontend architecture: when something is missing, flag it explicitly rather than silently skipping it.

In the incident review system, when a data source is unavailable, the system does not omit that section. It includes the section with an explicit marker: "No log data available for this time window."

The same principle applies to React data-fetching components:

\`\`\`tsx
const ViewerChart = ({ data, loading, error }) => {
  if (loading) return <ChartSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!data?.viewerTimeline?.length) return <EmptyState message="No viewer data for this stream" />;
  return <LineChart data={data.viewerTimeline} />;
};
\`\`\`

Three explicit states before the happy path. Each one communicates something different to the user. None of them is a silent failure.

## The Practical Takeaway

When you find yourself adding logic to a component because "it needs to know about X," stop and ask the sub-agent question: should this component know about X, or should X be passed in as a prop from the orchestrating parent?

If a component cannot be rendered and tested in isolation, it is not a component -- it is a tightly coupled fragment of application logic that happens to return JSX.

These are not new ideas. They are functional programming principles applied to UI architecture. What working on multi-agent systems gave me is a different frame for *why* these principles matter: not because the React documentation says so, but because the same structural choices that make distributed AI systems reliable make UI systems reliable. The underlying problem is the same. The solution is the same.
    `.trim(),
  },
];
