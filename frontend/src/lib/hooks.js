import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

/** Carrega dados da API. `path` nulo não dispara a requisição. */
export function useFetch(path, { interval } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!!path)
  const mounted = useRef(true)
  const pathRef = useRef(path)
  pathRef.current = path

  const load = useCallback(async (silent = false) => {
    const p = pathRef.current
    if (!p) return
    if (!silent) setLoading(true)
    try {
      const d = await api.get(p)
      if (mounted.current && pathRef.current === p) {
        setData(d)
        setError(null)
      }
    } catch (e) {
      if (mounted.current && !silent) setError(e)
    } finally {
      if (mounted.current && !silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    setData(null)
    load()
    return () => { mounted.current = false }
  }, [path, load])

  useEffect(() => {
    if (!interval || !path) return
    const t = setInterval(() => document.visibilityState === 'visible' && load(true), interval)
    return () => clearInterval(t)
  }, [interval, path, load])

  return { data, setData, error, loading, reload: load }
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Executa uma ação assíncrona controlando "carregando" e erros. */
export function useAction(fn, { onError } = {}) {
  const [loading, setLoading] = useState(false)
  const run = useCallback(async (...args) => {
    setLoading(true)
    try {
      return await fn(...args)
    } catch (e) {
      onError?.(e)
      throw e
    } finally {
      setLoading(false)
    }
  }, [fn, onError])
  return [run, loading]
}

export function useMediaQuery(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}
