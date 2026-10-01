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

// カレンダー連携のエラーは、これまで画面に何も表示せずURLから消えるだけだった。
// 特に「別の利用者として既に登録済み」は原因が分かりにくいため、最低限アラートで伝える。
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  google_linked_elsewhere:
    'このGoogleアカウントは、既に別の利用者として登録されています。\n' +
    '同じ人の別アカウントとして統合したい場合は、開発チームへご連絡ください。',
  outlook_linked_elsewhere:
    'このOutlookアカウントは、既に別の利用者として登録されています。\n' +
    '同じ人の別アカウントとして統合したい場合は、開発チームへご連絡ください。',
}
if (authCallbackResult.error) {
  const message = AUTH_ERROR_MESSAGES[authCallbackResult.error] ?? 'カレンダー連携に失敗いたしました。もう一度お試しくださいませ。'
  window.alert(message)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialConnected={authCallbackResult.connected} />
  </StrictMode>,
)
