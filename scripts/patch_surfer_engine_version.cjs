#!/usr/bin/env node
/**
 * Point Surfer's generated mozconfig at surfer.json version.engineVersion so
 * About/runtime ZEN_FIREFOX_VERSION reflects Astra's patched base, while
 * version.version stays the upstream tarball id (153.0.4) for downloads and
 * update platformVersion.
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const surferJson = JSON.parse(
  fs.readFileSync(path.join(root, 'surfer.json'), 'utf8'),
)
const engineVersion = surferJson.version?.engineVersion
if (!engineVersion) {
  console.log(
    'patch_surfer_engine_version: no version.engineVersion; leaving Surfer default',
  )
  process.exit(0)
}

const needle =
  'export ZEN_FIREFOX_VERSION=${(0, utils_1.getFFVersionOrCandidate)()}'
const replacement = `export ZEN_FIREFOX_VERSION=${engineVersion}`

const candidates = [
  path.join(
    root,
    'node_modules',
    '@zen-browser',
    'surfer',
    'dist',
    'constants',
    'mozconfig.js',
  ),
]

for (const file of candidates) {
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes(needle)) {
    if (text.includes(replacement)) {
      console.log(`patch_surfer_engine_version: already patched ${file}`)
      continue
    }
    throw new Error(
      `patch_surfer_engine_version: expected Surfer mozconfig template not found in ${file}`,
    )
  }
  fs.writeFileSync(file, text.replace(needle, replacement))
  console.log(
    `patch_surfer_engine_version: ZEN_FIREFOX_VERSION=${engineVersion} (${file})`,
  )
}
