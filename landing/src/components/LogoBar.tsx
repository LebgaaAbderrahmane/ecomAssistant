export default function LogoBar() {
  const logos = ['Shopify', 'WooCommerce', 'Yalidine', 'Procolis', 'WhatsApp']

  return (
    <section className="border-y border-gray-100 bg-gray-50 py-10">
      <div className="mx-auto max-w-[1200px] px-6">
        <p className="mb-6 text-center text-sm text-gray-500">
          Intégré avec les outils que vous utilisez déjà
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {logos.map((name) => (
            <span
              key={name}
              className="text-lg font-semibold tracking-tight text-gray-300"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
