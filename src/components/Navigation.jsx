import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getFeld } from '../lib/utils'

const links = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/kunden', label: 'Kunden' },
  { path: '/dokumente', label: 'Dokumente' },
  { path: '/eingangsrechnungen', label: 'Eingangsrechnungen' },
  { path: '/einstellungen', label: 'Einstellungen' },
]

export default function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const [profilName, setProfilName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [mobilOffen, setMobilOffen] = useState(false)

  const ladeProfilName = useCallback(async function ladeProfilName() {
    try {
      const { data, error } = await supabase.from('firmenprofile').select('name,inhaber,logo_url').limit(1)
      if (error) throw error

      const profil = data?.[0]
      const name = getFeld(profil, ['name'])
      const inhaber = getFeld(profil, ['inhaber'])
      setProfilName([name, inhaber].filter(Boolean).join(' · '))
      setLogoUrl(getFeld(profil, ['logo_url']))
    } catch {
      setProfilName('')
      setLogoUrl('')
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      ladeProfilName()
    }, 0)

    const handleProfilUpdate = () => {
      ladeProfilName()
    }

    window.addEventListener('profil-aktualisiert', handleProfilUpdate)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('profil-aktualisiert', handleProfilUpdate)
    }
  }, [ladeProfilName])

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

  function SidebarInhalt() {
    return (
      <>
        <div className="px-6 py-6 border-b border-gray-100 flex flex-col items-center text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={profilName || 'Firmenlogo'}
              className="h-20 w-auto max-w-full object-contain mb-3"
            />
          ) : (
            <h1 className="font-bold text-gray-900 text-base">Dokumenten-App</h1>
          )}
          {profilName && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{profilName}</p>}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map(link => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobilOffen(false)}
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
      </>
    )
  }

  return (
    <>
      <div className="md:hidden fixed left-3 top-3 z-[90]">
        <button
          type="button"
          onClick={() => setMobilOffen(true)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
        >
          Menü
        </button>
      </div>

      {mobilOffen && (
        <div className="md:hidden fixed inset-0 z-[100]">
          <button
            type="button"
            onClick={() => setMobilOffen(false)}
            className="absolute inset-0 bg-black/30"
            aria-label="Menü schließen"
          />
          <aside className="relative z-[101] w-72 max-w-[85vw] min-h-screen bg-white border-r border-gray-100 flex flex-col">
            <SidebarInhalt />
          </aside>
        </div>
      )}

      <aside className="hidden md:flex w-56 min-h-screen bg-white border-r border-gray-100 flex-col">
        <SidebarInhalt />
      </aside>
    </>
  )
}
