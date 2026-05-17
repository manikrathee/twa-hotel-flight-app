import { useState, useEffect } from 'react'
import { fetchWeather } from '../api/weather'

const POLL_MS = 5 * 60 * 1000 // 5 minutes

export default function useWeather() {
  const [weather, setWeather] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchWeather()
        setWeather(data)
        setError(null)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [])

  return { weather, error, loading }
}
