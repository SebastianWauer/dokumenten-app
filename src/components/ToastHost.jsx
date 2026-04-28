import { useEffect, useState } from 'react'

const farben = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-gray-200 bg-white text-gray-800',
}

export function appToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }))
}

export default function ToastHost() {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    function onToast(event) {
      const message = event?.detail?.message
      const type = event?.detail?.type || 'info'
      if (!message) return
      setToast({ message: String(message), type })
      window.setTimeout(() => setToast(null), 2600)
    }

    window.addEventListener('app-toast', onToast)
    return () => window.removeEventListener('app-toast', onToast)
  }, [])

  if (!toast) return null

  return (
    <div className="fixed right-4 top-4 z-[120]">
      <div className={`rounded-lg border px-4 py-2 text-sm shadow-sm ${farben[toast.type] || farben.info}`}>
        {toast.message}
      </div>
    </div>
  )
}
