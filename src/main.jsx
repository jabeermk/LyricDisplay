import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans-malayalam/400.css'
import '@fontsource/noto-sans-malayalam/700.css'
import '@fontsource/noto-sans-tamil/400.css'
import '@fontsource/noto-sans-tamil/700.css'
import '@fontsource/noto-sans-devanagari/400.css'
import '@fontsource/noto-sans-devanagari/700.css'
import '@fontsource/noto-sans-arabic/400.css'
import '@fontsource/noto-sans-arabic/700.css'
import './styles.css'
import App from './App.jsx'

// Netlify injects a fixed "Powered by Netlify" badge (iframe#nl-badge-frame) at the bottom-right.
// We leave it alone but keep our buttons clear of it: the 'host-badge' class adds bottom space.
const rootEl = document.documentElement
const markBadge = () => document.getElementById('nl-badge-frame') && rootEl.classList.add('host-badge')
if (/\.(netlify\.app|netlify\.live)$/.test(location.hostname)) rootEl.classList.add('host-badge')
new MutationObserver(markBadge).observe(document.body, { childList: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Not a PWA any more: remove any service worker / caches left by an earlier install.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {})
  window.caches?.keys().then((ks) => ks.filter((k) => k.startsWith('stagelyrics-')).forEach((k) => caches.delete(k))).catch(() => {})
}
