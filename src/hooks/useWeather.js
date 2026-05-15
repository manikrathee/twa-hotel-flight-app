import { useState, useEffect } from 'react'
import { fetchWeather } from '../api/weather'

const POLL_MS = 5 * 60 * 1000 // 5 minutes

export default function useWeather() {
  const [weather, setWeather] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchWeather()
        setWeather(data)
      } catch (e) {
        setError(e.message)
      }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [])

  return { weather, error }
}
