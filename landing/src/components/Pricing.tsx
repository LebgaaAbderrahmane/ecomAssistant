const plans = [
  {
    name: 'Starter',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    price: '4 900',
    tagline: 'Pour les petites boutiques qui démarrent',
    features: [
      'Jusqu\'à 100 commandes/mois',
      '1 connexion boutique',
      'Personnalisation de base',
      'Support email',
    ],
    cta: 'Choisir Starter',
    highlighted: false,
  },
  {
    name: 'Growth',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    price: '9 900',
    tagline: 'Pour les entreprises en pleine croissance',
    features: [
      'Jusqu\'à 500 commandes/mois',
      '2 connexions boutique',
      'Personnalisation avancée',
      'Support prioritaire',
      'Wilaya pricing éditeur',
    ],
    cta: 'Commencer l\'essai',
    highlighted: true,
  },
  {
    name: 'Pro',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728" />
      </svg>
    ),
    price: '19 900',
    tagline: 'Pour les marchands à fort volume',
    features: [
      'Commandes illimitées',
      '5 connexions boutique',
      'Personnalisation complète',
      'Support dédié',
      'Wilaya pricing éditeur',
      'Accès API',
    ],
    cta: 'Choisir Pro',
    highlighted: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 className="text-center text-3xl font-bold text-gray-900 md:text-4xl">
          Des tarifs adaptés au marché algérien.
        </h2>
        <p className="mt-3 text-center text-lg text-gray-500">
          Payez en dinars. Annulez quand vous voulez.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl border bg-white p-8 ${
                plan.highlighted
                  ? 'border-brand-600 shadow-sm'
                  : 'border-gray-200'
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">
                  Recommandé
                </span>
              )}
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${plan.highlighted ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {plan.icon}
                </div>
                <span className="text-lg font-semibold text-gray-900">{plan.name}</span>
              </div>
              <p className="mt-4 text-3xl font-bold text-gray-900">
                {plan.price} <span className="text-sm font-medium text-gray-500">DA/mo</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>
              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/signup"
                className={`mt-8 flex h-11 w-full items-center justify-center rounded-md text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-gray-400">
          14 jours d&apos;essai gratuit sur tous les plans. Aucune carte bancaire
          requise pour commencer.
        </p>
      </div>
    </section>
  )
}
