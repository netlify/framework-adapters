// This is duplicating module resolution from package.json#exports
// because some module resolution settings in tsconfig.json are not honoring export maps
// https://www.typescriptlang.org/docs/handbook/modules/theory.html#module-resolution
// eslint-disable-next-line n/no-missing-import -- file exists; false positive from the import resolver here
export * from './src/app-engine.js'
