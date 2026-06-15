import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import LogoBar from "@/components/LogoBar";
import Problem from "@/components/Problem";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import Testimonial from "@/components/Testimonial";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <LogoBar />
      <Problem />
      <HowItWorks />
      <Features />
      <Testimonial />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
