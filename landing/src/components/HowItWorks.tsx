const steps = [
  {
    number: '01',
    title: 'Connectez votre boutique',
    desc: 'Shopify ou WooCommerce. En 2 clics.',
  },
  {
    number: '02',
    title: 'Lie˗z votre WhatsApp Business',
    desc: 'Scannez le QR code. C\'est tout.',
  },
  {
    number: '03',
    title: 'L\'agent prend le relais',
    desc: 'Il contacte, confirme, relance.',
  },
]

export default function HowItWorks() {
  return (
    <section className="bg-gray-50 py-20 md:py-28">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 className="text-center text-3xl font-bold text-gray-900 md:text-4xl">
          Prêt en 10 minutes. Actif 24h/24.
        </h2>
        <p className="mt-3 text-center text-lg text-gray-500">
          Trois étapes pour automatiser vos confirmations de commandes.
        </p>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.number} className="relative text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
                {step.number}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-xl border border-gray-200 bg-white p-6 md:p-10">
          <div className="mx-auto max-w-[500px] space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="rounded bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">DZ</span>
              <span>10:32</span>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-800">
                Salam, je veux commander
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-xl rounded-br-sm bg-brand-50 px-3 py-2 text-sm text-gray-800">
                Salam! 3la 7sab « Montre SmartFit Pro » b 13 900 DA. Tconfirmi?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[60%] rounded-xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-800">
                Iih, confirmé
              </div>
            </div>
            <div className="flex justify-start">
              <span className="flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                ✓ Confirmée
              </span>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-xl rounded-br-sm bg-brand-50 px-3 py-2 text-sm text-gray-800">
                Merci! Numéro de tracking: YD-48721. Baraka Allah fik!
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="rounded bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">FR</span>
              <span>10:35</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
