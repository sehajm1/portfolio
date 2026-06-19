import styles from './App.module.css';

const PROJECTS = [
  {
    name: 'StreamRoom',
    tech: 'React 18 · TypeScript · WebSocket · Zustand',
    description: 'Real-time LIVE event viewer UI handling 1,000+ messages per second. Virtual scrolling chat, floating reaction system, broadcaster stats panel, and responsive layout from 375px to 1440px.',
    tags: ['LIVE UI', 'Performance', 'React', 'WebSocket'],
    github: 'https://github.com/sehajm1/streamroom',
    accent: '#fe2c55',
  },
  {
    name: 'CreatorOS',
    tech: 'Vue 3 · TypeScript · Tauri · pnpm Monorepo',
    description: 'Broadcaster operating platform running as a web app and native desktop binary from a single codebase. Ships a 12-component design system with full Storybook documentation, broadcast scheduler, and analytics dashboard.',
    tags: ['Operating Platform', 'Multi-end', 'Vue 3', 'Component Library'],
    github: 'https://github.com/sehajm1/creatorOS',
    accent: '#4d96ff',
  },
  {
    name: 'PerfLens',
    tech: 'Node.js · TypeScript · D3.js · Vite',
    description: 'Open-source CLI and web dashboard that audits bundle composition, identifies lazy-loading gaps, and enforces configurable performance budgets in CI. Returns exit code 1 on budget breach.',
    tags: ['OSS', 'Performance', 'Tooling', 'CLI'],
    github: 'https://github.com/sehajm1/perflens',
    accent: '#6bcb77',
  },
];

const POSTS = [
  {
    title: 'Why Your Live Chat UI Breaks at 1000 Messages Per Second (And How to Fix It)',
    platform: 'dev.to',
    tags: ['React', 'Performance', 'WebSocket'],
  },
  {
    title: 'Building a Cross-Platform LIVE Dashboard With Vue 3 + Tauri: One Codebase, Three Targets',
    platform: 'Hashnode',
    tags: ['Vue 3', 'Tauri', 'Multi-end'],
  },
  {
    title: 'I Built an AI System That Automates Post-Incident Reviews at Enterprise Scale',
    platform: 'Hashnode',
    tags: ['Architecture', 'AI', 'Systems'],
  },
  {
    title: 'Frontend Performance Budgets: The Engineering Culture Practice That LIVE Platforms Cannot Skip',
    platform: 'dev.to',
    tags: ['Performance', 'CI', 'Frontend'],
  },
  {
    title: 'What Multi-Agent Systems Taught Me About React Component Design',
    platform: 'Hashnode',
    tags: ['React', 'Architecture', 'Systems'],
  },
];

export default function App() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.intro}>
            <h1 className={styles.name}>Sage Maggo</h1>
            <p className={styles.role}>Frontend Engineer</p>
            <p className={styles.bio}>
              Final-year student at the University of Sydney, Data Science and Business Information Systems.
              Software Engineering Intern at Apple IS&T. Building real-time LIVE interfaces, cross-platform tooling, and open-source performance infrastructure.
            </p>
            <div className={styles.links}>
              <a href="https://github.com/sehajm1" target="_blank" rel="noreferrer" className={styles.link}>GitHub</a>
              <a href="https://linkedin.com/in/sehajmaggo" target="_blank" rel="noreferrer" className={styles.link}>LinkedIn</a>
              <a href="mailto:sehaj.maggo@student.usyd.edu.au" className={styles.link}>Email</a>
            </div>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Projects</h2>
          <div className={styles.projectGrid}>
            {PROJECTS.map((p) => (
              <a
                key={p.name}
                href={p.github}
                target="_blank"
                rel="noreferrer"
                className={styles.projectCard}
                style={{ '--accent': p.accent } as React.CSSProperties}
              >
                <div className={styles.projectAccent} />
                <div className={styles.projectBody}>
                  <span className={styles.projectName}>{p.name}</span>
                  <span className={styles.projectTech}>{p.tech}</span>
                  <p className={styles.projectDesc}>{p.description}</p>
                  <div className={styles.tagRow}>
                    {p.tags.map((t) => (
                      <span key={t} className={styles.tag}>{t}</span>
                    ))}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Writing</h2>
          <div className={styles.postList}>
            {POSTS.map((post) => (
              <div key={post.title} className={styles.postItem}>
                <div className={styles.postBody}>
                  <span className={styles.postTitle}>{post.title}</span>
                  <div className={styles.postMeta}>
                    <span className={styles.platform}>{post.platform}</span>
                    {post.tags.map((t) => (
                      <span key={t} className={styles.tag}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Experience</h2>
          <div className={styles.expCard}>
            <div className={styles.expHeader}>
              <span className={styles.expRole}>Software Engineering Intern</span>
              <span className={styles.expDate}>Feb 2026 - Jul 2026</span>
            </div>
            <span className={styles.expOrg}>Apple IS&T, Sydney</span>
            <ul className={styles.expPoints}>
              <li>Built Project Harbour: multi-agent AI orchestration system automating post-incident reviews for 9,600+ P0/P1C incidents. Parallel fan-out sub-agent registry (HCL, Splunk, Radar, WebEx) replaces sequential aggregation with concurrent processing.</li>
              <li>Shipped IVA Evaluation Portal: blind A/B comparison interface for RAG 2.0 vs RAG 1.0 assessment, merged to production monorepo.</li>
              <li>Managed alignment across 15+ stakeholders in Problem Management, MIM Operations, Helpline, and AIDP leadership across Sydney and Singapore.</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Sage Maggo</span>
        <a href="https://github.com/sehajm1" target="_blank" rel="noreferrer">github.com/sehajm1</a>
      </footer>
    </div>
  );
}
