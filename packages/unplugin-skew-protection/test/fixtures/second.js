import { renderPage } from './shared-static.js'

renderPage('second', () => import('./shared-dynamic.js'))
