export function Escalations() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Escalades</h1>
          <p className="mt-1 text-sm text-gray-500">0 ouverte, 0 résolue</p>
        </div>
        <button className="rounded-md border border-gray-300 bg-white px-4 py-[10px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          Tout marquer comme résolu
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="p-12 text-center text-gray-500">
          <p>Aucune escalade</p>
          <p className="mt-1 text-sm">Les conversations nécessitant votre attention apparaîtront ici</p>
        </div>
      </div>
    </div>
  )
}
