export function appendQueryParam(url: string, paramName: string, token: string): string {
  const hashIndex = url.indexOf('#')
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex)
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}${paramName}=${encodeURIComponent(token)}${fragment}`
}

export function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)

      throw new Error(`Invalid skew protection pattern ${JSON.stringify(pattern)}: ${reason}`, {
        cause: error,
      })
    }
  })
}

export function hasQueryParam(url: string, paramName: string, token: string): boolean {
  const hashIndex = url.indexOf('#')
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const queryIndex = base.indexOf('?')

  if (queryIndex === -1) {
    return false
  }

  const target = `${paramName}=${encodeURIComponent(token)}`

  return base
    .slice(queryIndex + 1)
    .split('&')
    .includes(target)
}

export function matchesAnyPattern(value: string, regexps: RegExp[]): boolean {
  return regexps.some((regexp) => regexp.test(value))
}
