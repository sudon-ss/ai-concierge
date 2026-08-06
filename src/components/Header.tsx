import { Wordmark } from './Wordmark'

export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-navy-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-center">
        <Wordmark size="sm" tone="light" />
      </div>
      <div className="gold-divider" />
    </header>
  )
}
