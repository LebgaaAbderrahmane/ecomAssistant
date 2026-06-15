export default function Testimonial() {
  return (
    <section className="bg-brand-50 py-20 md:py-28">
      <div className="mx-auto max-w-[800px] px-6 text-center">
        <svg className="mx-auto h-10 w-10 text-brand-300" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z" />
        </svg>
        <blockquote className="mt-6 text-lg leading-relaxed text-gray-800 md:text-xl">
          &ldquo;Avant, je passais 3 heures par jour à appeler les clients.
          Maintenant EcomAssistant le fait la nuit pendant que je dors. Mon
          taux de confirmation est passé de 51% à 74% en 3 semaines.&rdquo;
        </blockquote>
        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            SB
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">
              Sami B., fondateur de Sami Boutique
            </p>
            <p className="text-sm text-gray-500">Alger</p>
          </div>
        </div>
      </div>
    </section>
  )
}
