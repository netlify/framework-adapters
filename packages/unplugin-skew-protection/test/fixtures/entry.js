// Bundlers that generate their own HTML may not carry the fixture's markup, so the mount
// point is created here when the page does not already provide one.
let app = document.querySelector('#app')

if (!app) {
  app = document.createElement('div')
  app.id = 'app'
  document.body.prepend(app)
}

app.textContent = 'entry loaded'

import('./lazy.js')
  .then(({ default: message }) => {
    app.textContent = message
    app.dataset.state = 'loaded'
  })
  .catch((error) => {
    app.textContent = `failed: ${error.message}`
    app.dataset.state = 'failed'
  })
