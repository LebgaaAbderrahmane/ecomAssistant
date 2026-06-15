const painPoints = [
  {
    stat: '35%',
    description: 'des commandes COD ne sont jamais confirmées',
  },
  {
    stat: '3h',
    description: 'par jour perdues à appeler les clients manuellement',
  },
  {
    stat: '1/2',
    description: 'livreurs repartent avec le colis',
  },
]

export default function Problem() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 className="text-center text-3xl font-bold text-gray-900 md:text-4xl">
          Les livraisons échouées coûtent cher.
        </h2>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {painPoints.map((point) => (
            <div
              key={point.stat}
              className="rounded-xl border border-gray-200 bg-white p-8 text-center"
            >
              <span className="text-5xl font-extrabold text-red-500">{point.stat}</span>
              <p className="mt-4 text-base text-gray-600">{point.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl bg-brand-600 p-8 text-center md:p-12">
          <p className="text-lg font-semibold text-white md:text-xl">
            EcomAssistant automatise tout ce que vous faites à la main.
          </p>
        </div>
      </div>
    </section>
  )
}
