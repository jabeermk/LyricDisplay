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

// Free hosts (e.g. Netlify) overlay a fixed badge at the bottom; lift the tab bar above it.
if (/\.(netlify\.app|netlify\.live)$/.test(location.hostname)) document.documentElement.classList.add('host-badge')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}
