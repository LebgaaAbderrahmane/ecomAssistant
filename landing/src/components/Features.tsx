export default function Features() {
  return (
    <section id="features" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-[1200px] px-6 space-y-28">
        <div className="flex flex-col items-center gap-12 md:flex-row md:gap-20">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Parle darija, français et arabe — comme vous.
            </h2>
            <ul className="mt-6 space-y-4">
              {[
                'Détection automatique de la langue du client — plus besoin de choisir manuellement',
                'Transcription des notes vocales en texte pour suivre les conversations sans écouter',
                'Identification des produits dans les photos envoyées par les clients',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-base text-gray-600">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 flex justify-center">
            <div className="relative w-[280px] md:w-[320px]">
              <div className="rounded-[36px] border-[3px] border-gray-300 bg-white shadow-xl">
                <div className="flex items-center justify-center gap-1 pt-3 pb-2">
                  <div className="h-2 w-2 rounded-full bg-red-400" />
                  <div className="h-2 w-2 rounded-full bg-yellow-400" />
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                </div>
                <div className="px-4 pb-2">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">
                      A
                    </div>
                    <div className="text-xs font-medium text-gray-900">Amina Zoubiri</div>
                    <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-gray-600">
                      DZ
                    </span>
                  </div>
                </div>
                <div className="space-y-2 px-4 pb-4">
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
                      <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                        <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 0018 0v-2z" />
                      </svg>
                    </div>
                    <div className="max-w-[75%] rounded-xl rounded-bl-sm bg-gray-100 px-3 py-2">
                      <div className="flex gap-0.5 items-end h-5">
                        <div className="w-0.5 h-3 bg-gray-400 rounded" />
                        <div className="w-0.5 h-4 bg-gray-400 rounded" />
                        <div className="w-0.5 h-2 bg-gray-400 rounded" />
                        <div className="w-0.5 h-5 bg-gray-400 rounded" />
                        <div className="w-0.5 h-3 bg-gray-400 rounded" />
                      </div>
                      <p className="mt-1 text-[10px] italic text-gray-400">
                        &quot;Wach kayen d autres couleurs?&quot;
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-12 md:flex-row-reverse md:gap-20">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Tableau de bord en temps réel.
            </h2>
            <ul className="mt-6 space-y-4">
              {[
                'Suivez toutes vos conversations en un coup d\'œil',
                'Repérez les escalades avant qu\'elles ne deviennent urgentes',
                'KPIs en temps réel : taux de confirmation, délai moyen, relances en attente',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-base text-gray-600">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-[500px] rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Commandes', value: '47', color: 'text-brand-600' },
                  { label: 'Taux confirm.', value: '72%', color: 'text-brand-600' },
                  { label: 'Délai moyen', value: '4h23', color: 'text-brand-600' },
                  { label: 'Relances', value: '8', color: 'text-amber-600' },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-md bg-gray-50 p-3 text-center">
                    <p className="text-xs text-gray-500">{kpi.label}</p>
                    <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
