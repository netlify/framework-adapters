import webpack from 'webpack'

const { RuntimeModule, Template } = webpack

/**
 * Runtime module that wraps a webpack chunk-URL function (e.g.
 * `__webpack_require__.u` for JS, the mini-css-extract equivalent for CSS) so
 * that every dynamically-loaded chunk URL carries the deploy-pinning query
 * parameter.
 *
 * A chunk's script src is computed as
 * `__webpack_require__.p + __webpack_require__.u(chunkId)`. `publicPath` (`.p`)
 * is a *prefix*, so the query has to be appended onto the *suffix* (`.u`). This
 * is why a publicPath override can't do the job.
 */
export class SkewProtectionRuntimeModule extends RuntimeModule {
  constructor(
    private readonly globalName: string,
    private readonly query: string,
  ) {
    // STAGE_ATTACH runs after the default chunk-filename runtime module
    // (STAGE_NORMAL) has defined the function we're wrapping.
    super(`netlify skew protection (${globalName})`, RuntimeModule.STAGE_ATTACH)
  }

  override generate(): string {
    const original = '__nfSkewOriginal'
    const fn = this.globalName
    const body = [
      `var url = ${original}(chunkId);`,
      // Defensive separator in case a filename already carries a query string.
      `return url + (url.indexOf("?") < 0 ? "?" : "&") + ${JSON.stringify(this.query)};`,
    ]

    const runtimeTemplate = this.compilation?.runtimeTemplate
    const wrapped = runtimeTemplate
      ? runtimeTemplate.basicFunction('chunkId', body)
      : `function (chunkId) { ${body.join(' ')} }`

    return Template.asString([`var ${original} = ${fn};`, `${fn} = ${wrapped};`])
  }
}
