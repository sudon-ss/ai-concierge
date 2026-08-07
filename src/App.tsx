import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { HomePage } from './pages/HomePage'
import { ChatPage } from './pages/ChatPage'
import { CalendarPage } from './pages/CalendarPage'
import { TasksPage } from './pages/TasksPage'
import { SettingsPage } from './pages/SettingsPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { ProfileProvider } from './hooks/useProfile'
import { SettingsProvider, useSettings } from './hooks/useSettings'
import { useReminders } from './hooks/useReminders'
import { useWakeLock } from './hooks/useWakeLock'
import { FlashOverlay } from './components/FlashOverlay'

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const isOnboarding = location.pathname.startsWith('/onboarding')

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {!isOnboarding && <Header />}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</main>
      {!isOnboarding && <BottomNav />}
    </div>
  )
}

function AppRoutes({ initialConnected }: { initialConnected?: string }) {
  const { settings, onboarded, updateCalendar } = useSettings()
  const location = useLocation()
  const isOnboarding = location.pathname.startsWith('/onboarding')
  const { current: reminderEvent, minutesUntil, dismiss } = useReminders()
  // リマインダー有効時は、通知を見逃さないよう画面の自動消灯を防ぐ
  useWakeLock(settings.notificationEnabled)

  // OAuthコールバック自体はmain.tsxでReact起動前に同期処理済み（子コンポーネントの
  // useEffectがセッション未設定のまま先に発火するレースを避けるため）。
  // ここではデモ用の接続フラグを更新するだけ。
  useEffect(() => {
    if (initialConnected === 'google' || initialConnected === 'outlook') {
      updateCalendar(initialConnected, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // オンボーディング未完了 → 自動でオンボーディング画面へ
  if (!onboarded && !isOnboarding) {
    return <Navigate to="/onboarding" replace />
  }
  // オンボーディング完了済みで /onboarding へ来た → ホームへ
  if (onboarded && isOnboarding) {
    return <Navigate to="/" replace />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      {reminderEvent && !isOnboarding && (
        <FlashOverlay title={reminderEvent.title} minutesUntil={minutesUntil} onDismiss={dismiss} />
      )}
    </Layout>
  )
}

export default function App({ initialConnected }: { initialConnected?: string }) {
  return (
    <SettingsProvider>
      <ProfileProvider>
        <BrowserRouter>
          <AppRoutes initialConnected={initialConnected} />
        </BrowserRouter>
      </ProfileProvider>
    </SettingsProvider>
  )
}
