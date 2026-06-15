'use client'

import { useState } from 'react'

const faqs = [
  {
    q: 'Est-ce que ça marche avec Shopify et WooCommerce ?',
    a: 'Oui, EcomAssistant s\'intègre directement avec Shopify et WooCommerce. La connexion prend moins de 2 minutes et ne nécessite aucune compétence technique.',
  },
  {
    q: 'L\'agent comprend vraiment le darija ?',
    a: 'Oui, l\'agent est entraîné sur le dialecte algérien (derja), le français et l\'arabe standard. Il détecte automatiquement la langue du client et répond dans la même langue.',
  },
  {
    q: 'Est-ce que je peux répondre moi-même aux clients ?',
    a: 'Absolument. Vous pouvez reprendre la main à tout moment. L\'agent vous notifie quand il a besoin d\'aide et vous pouvez intervenir directement depuis le tableau de bord.',
  },
  {
    q: 'Quels services de livraison sont supportés ?',
    a: 'Nous supportons Yalidine et Procolis. Les frais de livraison par wilaya sont configurables directement dans les paramètres.',
  },
  {
    q: 'Est-ce que mes données clients sont sécurisées ?',
    a: 'Oui, toutes les données sont chiffrées en transit et au repos. Nous ne stockons que les informations nécessaires au traitement des commandes. Conforme aux réglementations algériennes.',
  },
  {
    q: 'Que se passe-t-il si je dépasse mon quota ?',
    a: 'Vous recevez une notification à 87% d\'utilisation. Si vous atteignez 100%, l\'agent se met en pause jusqu\'à la fin du cycle ou jusqu\'à ce que vous passiez à un forfait supérieur.',
  },
]

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="bg-gray-50 py-20 md:py-28">
      <div className="mx-auto max-w-[800px] px-6">
        <h2 className="text-center text-3xl font-bold text-gray-900 md:text-4xl">
          Questions fréquentes.
        </h2>

        <div className="mt-12 space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left text-base font-semibold text-gray-900"
              >
                {faq.q}
                <svg
                  className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
                    open === i ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {open === i && (
                <div className="border-t border-gray-100 px-6 py-4 text-base text-gray-500 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
