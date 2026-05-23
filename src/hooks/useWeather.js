import { useState, useEffect } from 'react'
import { fetchWeather } from '../api/weather'

const POLL_MS = 5 * 60 * 1000 // 5 minutes

export default function useWeather() {
  const [weather, setWeather] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isActive = true

    async function load() {
      try {
        const data = await fetchWeather()
        if (!isActive) return
        setWeather(data)
        setError(null)
      } catch (e) {
        if (!isActive) return
        setError(e.message)
      }
    }

    load()

    const id = setInterval(load, POLL_MS)
    return () => {
      isActive = false
      clearInterval(id)
    }
  }, [])

  return { weather, error }
}
