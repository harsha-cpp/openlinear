import { AnimatedTitle } from "@/components/animated-title"

export function Hero() {
  return (
    <section className="px-6 md:px-20 pt-24 md:pt-24 pb-24 md:pb-24">
      <div className="mx-auto max-w-content">
        <AnimatedTitle
          text="OpenLinear"
          className="text-[48px] md:text-[72px] lg:text-[88px] font-semibold tracking-[-2px] md:tracking-[-3px] leading-[1] mb-8"
        />

        <p className="animate-fade-up-delay-3 text-[20px] md:text-[24px] leading-[1.4] text-muted-foreground max-w-[560px] mb-10">
          Execute your tasks. Don&apos;t just track them.
        </p>

        <div className="animate-fade-up-delay-4 flex items-center gap-3">
          <a
            href="https://github.com/kaizen403/openlinear/releases"
            className="inline-flex items-center rounded-lg bg-blue-500 px-5 py-4 text-[15px] font-medium text-white hover:bg-blue-600 active:scale-[0.98] transition-all"
          >
            Download OpenLinear
          </a>
        </div>
      </div>
    </section>
  )
}
