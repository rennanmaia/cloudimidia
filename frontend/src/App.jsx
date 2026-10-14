import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { FeedbackProvider } from './components/feedback'
import Layout from './components/Layout'
import { PageLoader } from './components/ui'
import { Login, Register, ForgotPassword, ResetPassword, Setup } from './pages/AuthPages'
import Invite from './pages/Invite'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const ScreensPage = lazy(() => import('./pages/screens/ScreensPage'))
const ScreenDetail = lazy(() => import('./pages/screens/ScreenDetail'))
const PairScreen = lazy(() => import('./pages/screens/PairScreen'))
const PlaylistsPage = lazy(() => import('./pages/playlists/PlaylistsPage'))
const PlaylistEditor = lazy(() => import('./pages/playlists/PlaylistEditor'))
const MediaPage = lazy(() => import('./pages/media/MediaPage'))
const SchedulesPage = lazy(() => import('./pages/schedules/SchedulesPage'))
const IntegrationsPage = lazy(() => import('./pages/integrations/IntegrationsPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const NewOrgPage = lazy(() => import('./pages/NewOrgPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <PageLoader />
    </div>
  )
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Splash />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return children
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Splash />
  if (user) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={next && next.startsWith('/') ? next : '/'} replace />
  }
  return children
}

/** Exige papel mínimo na organização atual */
function RequireRole({ min, children }) {
  const { can, org } = useAuth()
  if (!org) return <PageLoader />
  if (!can(min)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <HashRouter>
      <FeedbackProvider>
        <AuthProvider>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
              <Route path="/cadastro" element={<GuestOnly><Register /></GuestOnly>} />
              <Route path="/esqueci-senha" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
              <Route path="/redefinir-senha/:token" element={<ResetPassword />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/convite/:token" element={<Invite />} />
              <Route element={<RequireAuth><Layout /></RequireAuth>}>
                <Route index element={<Dashboard />} />
                <Route path="tvs" element={<ScreensPage />} />
                <Route path="tvs/adicionar" element={<PairScreen />} />
                <Route path="tvs/:id" element={<ScreenDetail />} />
                <Route path="playlists" element={<PlaylistsPage />} />
                <Route path="playlists/:id" element={<PlaylistEditor />} />
                <Route path="midias" element={<MediaPage />} />
                <Route path="grade" element={<SchedulesPage />} />
                <Route path="integracoes" element={<IntegrationsPage />} />
                <Route path="equipe" element={<RequireRole min="viewer"><TeamPage /></RequireRole>} />
                <Route path="relatorios" element={<ReportsPage />} />
                <Route path="configuracoes" element={<RequireRole min="admin"><SettingsPage /></RequireRole>} />
                <Route path="perfil" element={<ProfilePage />} />
                <Route path="nova-organizacao" element={<NewOrgPage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </FeedbackProvider>
    </HashRouter>
  )
}
