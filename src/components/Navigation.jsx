import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const links = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/kunden', label: 'Kunden' },
  { path: '/dokumente', label: 'Dokumente' },
  { path: '/einstellungen', label: 'Einstellungen' },
]

export default function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()

  function istAktiv(path) {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard'
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  async function abmelden() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-100 flex flex-col">
      <div className="px-6 py-6 border-b border-gray-100">
        <h1 className="font-bold text-gray-900 text-base">Dokumenten-App</h1>
        <p className="text-xs text-gray-400 mt-0.5">Sport Voice</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(link => (
          <Link
            key={link.path}
            to={link.path}
            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
              istAktiv(link.path)
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={abmelden}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Abmelden
        </button>
      </div>
    </aside>
  )
}
