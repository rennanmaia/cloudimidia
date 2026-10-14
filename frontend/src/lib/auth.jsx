import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from './api'

const AuthCtx = createContext(null)
const ORG_KEY = 'cm_org'

const RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 }

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, organizations: [], loading: !!getToken() })
  const [orgId, setOrgId] = useState(() => {
    try { return Number(localStorage.getItem(ORG_KEY)) || null } catch { return null }
  })
  const [org, setOrg] = useState(null)
  const [orgLoading, setOrgLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setState({ user: null, organizations: [], loading: false })
      return null
    }
    try {
      const data = await api.get('auth/me')
      setState({ user: data.user, organizations: data.organizations, loading: false })
      return data
    } catch (e) {
      if (e.status === 401) setToken(null)
      setState({ user: null, organizations: [], loading: false })
      return null
    }
  }, [])

  useEffect(() => {
    refresh()
    const onExpired = () => {
      setToken(null)
      setState({ user: null, organizations: [], loading: false })
      setOrg(null)
    }
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [refresh])

  // Organização atual: a salva, ou a primeira disponível
  const currentOrgId = useMemo(() => {
    const list = state.organizations
    if (orgId && (list.some((o) => o.id === orgId) || state.user?.is_superadmin)) return orgId
    return list[0]?.id ?? null
  }, [orgId, state.organizations, state.user])

  const loadOrg = useCallback(async (id) => {
    if (!id) { setOrg(null); return }
    setOrgLoading(true)
    try {
      const data = await api.get(`orgs/${id}`)
      setOrg(data.organization)
    } catch {
      setOrg(null)
      if (id === orgId) setOrgId(null)
    } finally {
      setOrgLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (state.user && currentOrgId) loadOrg(currentOrgId)
    else if (!state.user) setOrg(null)
  }, [state.user, currentOrgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchOrg = useCallback((id) => {
    try { localStorage.setItem(ORG_KEY, String(id)) } catch { /* */ }
    setOrgId(id)
  }, [])

  const login = useCallback(async (token) => {
    setToken(token)
    setState((s) => ({ ...s, loading: true }))
    return refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try { await api.post('auth/logout') } catch { /* */ }
    setToken(null)
    setOrg(null)
    setState({ user: null, organizations: [], loading: false })
  }, [])

  const value = useMemo(() => {
    const role = org?.role ?? null
    const rank = role ? RANK[role] : 0
    return {
      ...state,
      org,
      orgId: currentOrgId,
      orgLoading,
      switchOrg,
      reloadOrg: () => loadOrg(currentOrgId),
      refresh,
      login,
      logout,
      role,
      isGuest: !!org && !role,
      can: (min) => rank >= RANK[min],
      canCreate: !!org?.can_create_content,
      canOperateScreen: (id) => rank >= RANK.editor || org?.guest_screens?.[id] === 'editor',
    }
  }, [state, org, currentOrgId, orgLoading, switchOrg, loadOrg, refresh, login, logout])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
