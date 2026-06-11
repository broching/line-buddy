import HeroSection from "./hero-section";
import FeaturesOne from "./features-one";
import HowItWorksDemo from "./how-it-works";
import Testimonials from "./testimonials";
import CallToAction from "./call-to-action";
import FAQs from "./faqs";
import Footer from "./footer";
import CustomClerkPricing from "@/components/custom-clerk-pricing";

export default function Home() {
  return (
    <div className="lm-page">
      <HeroSection />
      <FeaturesOne />
      <HowItWorksDemo />
      <section id="testimonials" className="lm-page">
        <Testimonials />
      </section>
      <section
        id="pricing"
        className="lm-section-alt py-20 md:py-28"
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest lm-label">
              Pricing
            </p>
            <h2 className="text-3xl font-extrabold lm-h1 sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg lm-body">
              1,000 AI credits included every month. Top up as you grow.
              No surprises.
            </p>
          </div>
          <CustomClerkPricing />
        </div>
      </section>
      <CallToAction />
      <section id="faq" className="lm-page">
        <FAQs />
      </section>
      <Footer />
    </div>
  );
}
