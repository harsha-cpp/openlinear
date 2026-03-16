import { Footer } from '@/components/footer'
import { Header } from '@/components/header'

const installSteps = [
  'Clone the repository if you want to work on the landing page locally.',
  'Install dependencies with pnpm from the repo root.',
  'Run the landing site only and deploy it from Vercel.',
]

const authSteps = [
  'Run `openlinear github login` locally in your terminal.',
  'If GitHub CLI is already signed in, OpenLinear reuses that local token first.',
  'Otherwise OpenLinear can open GitHub in your browser and listen on `http://localhost:<port>/callback` on your machine.',
  'If no client secret is configured, use `openlinear github login --device` for the device flow fallback.',
  'Finish approval in GitHub. The token stays on your machine.',
]

const retiredItems = [
  'The hosted dashboard has been retired.',
  'GitHub OAuth login for the old product is no longer available.',
  'The old DigitalOcean droplet deploy flow has been removed.',
]

const links = [
  { label: 'GitHub repository', href: 'https://github.com/kaizen403/openlinear' },
  { label: 'Issues', href: 'https://github.com/kaizen403/openlinear/issues' },
  { label: 'Releases', href: 'https://github.com/kaizen403/openlinear/releases' },
]

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/80">
      <code>{children}</code>
    </pre>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
      <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-white">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-white/65">{children}</div>
    </section>
  )
}

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#0a0f1a] text-white">
      <Header />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-24 pt-36 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-8 md:p-12">
          <div className="inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-blue-200">
            Local-first release
          </div>
          <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold tracking-[-0.05em] text-white md:text-6xl">
            OpenLinear now ships as a desktop release, npm launcher, and Arch package.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-white/60 md:text-lg">
            This repository publishes the local desktop app, the `openlinear` npm launcher, the `openlinear-bin`
            Arch/AUR metadata, and the optional landing/docs surface in `apps/landing`.
          </p>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <Section title="Run locally">
            <p>Use the landing app directly from the monorepo root.</p>
            <CodeBlock>{`pnpm install
pnpm --filter @openlinear/landing dev`}</CodeBlock>
            <p>The local site runs on port `3002` by default.</p>
          </Section>

        <Section title="Install the CLI">
          <p>Choose the release channel that matches your machine.</p>
          <CodeBlock>{`curl -fsSL https://rixie.in/api/install | bash
npm install -g openlinear
paru -S openlinear-bin`}</CodeBlock>
          <p>The `curl` installer and npm launcher now support macOS (Apple Silicon / Intel) and Linux x64. Arch users should prefer `openlinear-bin`.</p>
        </Section>
      </div>

        <Section title="Local GitHub auth">
          <p>GitHub auth now runs locally with a localhost callback flow or device-flow fallback. No hosted callback on `rixie.in` is required.</p>
          <ul className="space-y-3">
            {authSteps.map((step) => (
              <li key={step} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
          <CodeBlock>{`openlinear github login
openlinear github login --browser
openlinear github login --device
openlinear github status
openlinear github whoami`}</CodeBlock>
        </Section>

        <Section title="Deploy on Vercel">
          <p>The landing site is optional. If you deploy it, Vercel only serves marketing and docs pages. The canonical `curl` installer is the repo-hosted `install.sh` script.</p>
          <ul className="space-y-3">
            {installSteps.map((step) => (
              <li key={step} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
          <CodeBlock>{`Framework preset: Next.js
Root directory: apps/landing
Build command: pnpm build
Output directory: .next`}</CodeBlock>
        </Section>

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="What was retired">
            <ul className="space-y-3">
              {retiredItems.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Project links">
            <ul className="space-y-3">
              {links.map((link) => (
                <li key={link.href}>
                  <a className="text-blue-200 transition hover:text-white" href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Footer />
    </main>
  )
}
