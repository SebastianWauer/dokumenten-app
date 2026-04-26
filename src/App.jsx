import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [status, setStatus] = useState('Verbinde...')

  useEffect(() => {
    async function test() {
      const { data, error } = await supabase
        .from('firmenprofile')
        .select('*')
      
      if (error) {
        setStatus('Fehler: ' + error.message)
      } else {
        setStatus('Verbindung erfolgreich!')
      }
    }
    test()
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Dokumenten-App</h1>
        <p className="text-gray-500">{status}</p>
      </div>
    </div>
  )
}

export default App