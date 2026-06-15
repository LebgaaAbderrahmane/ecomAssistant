export default function CTA() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-[900px] px-6">
        <div className="relative overflow-hidden rounded-2xl bg-brand-600 p-12 text-center shadow-lg md:p-16">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-white/5" />
            <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/5" />
            <div className="absolute top-1/3 right-1/4 h-4 w-4 rounded-full bg-white/10" />
            <div className="absolute bottom-1/4 left-1/3 h-3 w-3 rounded-full bg-white/15" />
            <div className="absolute top-1/2 left-[60%] h-2 w-2 rounded-full bg-white/10" />
            <div className="absolute bottom-1/3 right-[15%] h-5 w-5 rounded-full bg-white/8" />
          </div>
          <h2 className="relative text-3xl font-extrabold text-white md:text-4xl">
            Arrêtez de perdre des commandes.
          </h2>
          <p className="relative mt-4 text-lg text-white/80">
            Votre agent WhatsApp est prêt en 10 minutes.
          </p>
          <a
            href="/signup"
            className="animate-pulse-ring relative mt-8 inline-flex h-14 items-center rounded-md bg-white px-8 text-base font-semibold text-brand-600 hover:bg-gray-100 transition-colors"
          >
            Commencer gratuitement
          </a>
        </div>
      </div>
    </section>
  )
}
