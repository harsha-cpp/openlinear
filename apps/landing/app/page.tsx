import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { TestimonialsSection } from "@/components/testimonials-section"
import { HowItWorksSection } from "@/components/how-it-works-section"
import { FAQSection } from "@/components/faq-section"
import { Footer } from "@/components/footer"
import { FadeIn } from "@/components/fade-in"

export default function Page() {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <FadeIn>
        <TestimonialsSection />
      </FadeIn>
      <FadeIn>
        <HowItWorksSection />
      </FadeIn>
      <FadeIn>
        <FAQSection />
      </FadeIn>
      <Footer />
    </main>
  )
}
