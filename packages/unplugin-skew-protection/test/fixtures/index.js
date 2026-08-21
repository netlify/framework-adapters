import { renderPage } from './shared-static.js'

renderPage('index', () => import('./shared-dynamic.js'))
