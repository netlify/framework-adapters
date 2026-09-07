// Statically imported by both entries, so every bundler under test hoists this module into a chunk
// that the two pages share -- a request that has to carry the deploy-pinning parameter just like an
// entry or a dynamically imported chunk does.
const SHARED_STATIC = 'shared static chunk loaded'

/**
 * Renders one fixture page. Both entries go through here so the browser test can treat every page
 * and every bundler alike: find or create the `#app` mount point, then settle it to a terminal
 * `data-state` once the page's dynamic chunk has either resolved or rejected.
 *
 * `importDynamic` is a callback rather than a specifier because bundlers only rewrite literal
 * `import()` specifiers: passing the specifier in would leave a single call site here in the
 * shared chunk instead of one per page.
 */
export function renderPage(name, importDynamic) {
  // Bundlers that generate their own HTML may not carry the fixture's markup, so the mount point
  // is created here when the page does not already provide one.
  let app = document.querySelector('#app')

  if (!app) {
    app = document.createElement('div')
    app.id = 'app'
    document.body.prepend(app)
  }

  app.textContent = `${name} loading`

  importDynamic()
    .then(({ default: sharedDynamic }) => {
      app.textContent = `${name}: ${SHARED_STATIC}, ${sharedDynamic}`
      app.dataset.state = 'loaded'
    })
    .catch((error) => {
      app.textContent = `failed: ${error.message}`
      app.dataset.state = 'failed'
    })
}
