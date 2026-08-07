import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerSW } from 'virtual:pwa-register'
import { consumeAuthCallback } from './lib/api'

registerSW({ immediate: true })

// OAuthコールバック（?session=...）は、どのコンポーネントよりも先に同期的に処理する。
// useEffect内で行うと、既にcalendarConnected=trueな状態（前回接続済みの端末）では
// 子コンポーネントのuseEffectがセッション未設定のまま先に発火し401になるレース条件があった。
const authCallbackResult = consumeAuthCallback()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialConnected={authCallbackResult.connected} />
  </StrictMode>,
)
