import Navigation from '../components/Navigation'

export default function Dashboard() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />
      <main className="flex-1 p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Dashboard</h2>
        <p className="text-gray-400 text-sm mb-8">Willkommen zurück, Sebastian.</p>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">Offene Rechnungen</p>
            <p className="text-2xl font-bold text-gray-900">0</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">Einnahmen diesen Monat</p>
            <p className="text-2xl font-bold text-gray-900">0,00 €</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">Kunden gesamt</p>
            <p className="text-2xl font-bold text-gray-900">0</p>
          </div>
        </div>
      </main>
    </div>
  )
}