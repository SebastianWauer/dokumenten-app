import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PrivateRoute({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    let aktiv = true
    supabase.auth.getSession().then(({ data }) => {
      if (!aktiv) return
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, neueSession) => {
      setSession(neueSession)
    })

    return () => {
      aktiv = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  if (session === undefined) return null
  if (!session) return <Navigate to="/login" />
  return children
}
