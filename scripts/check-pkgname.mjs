#!/usr/bin/env node
// check-pkgname — Unbound must NOT install a Debian package or binary called
// `unbound`. Debian already has one: the NLnet Labs validating recursive caching
// DNS resolver, present in every Debian/Ubuntu archive as `unbound`. A lab
// machine running DragonForge does networking; the resolver is in play.
//
// If this package were named `unbound`, installing Unbound would either conflict
// with the resolver, shadow it, or — worst and quietest — make `apt install
// unbound` on a student's box do something completely unexpected.
//
// So: the machine-readable name is `unbound-editor` everywhere, and the human
// display name stays "Unbound". This script is the thing that refuses, rather
// than the reviewer who remembers.
//
// Exit 0 = named correctly everywhere it matters · 1 = a `unbound` name crept in
// (the exact file and key are printed).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = 'unbound-editor'

const problems = []
const checked = []

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function expect(rel, label, actual, wanted) {
  checked.push(label)
  if (actual !== wanted) {
    problems.push(`${rel}: ${label} is ${JSON.stringify(actual)}, must be ${JSON.stringify(wanted)}`)
  }
}

// --- package.json ----------------------------------------------------------
const pkg = JSON.parse(read('package.json'))

// The npm name MAY stay `unbound` only if the .deb name comes from elsewhere.
// electron-builder derives the .deb name from `name` when `productName` is
// absent — we DO set productName, so the deb is `unbound` unless we force it.
// Requiring name === unbound-editor keeps one rule with no exception to forget.
expect('package.json', 'name', pkg.name, PKG)

const linux = pkg.build?.linux ?? {}
// executableName becomes /usr/bin/<name> in the .deb. Leaving it at `unbound`
// would shadow the resolver's binary — a quieter failure than the package name.
expect('package.json', 'build.linux.executableName', linux.executableName, PKG)

const entry = linux.desktop?.entry ?? {}
expect('package.json', 'build.linux.desktop.entry.Name', entry.Name, 'Unbound')

const mime = entry.MimeType ?? ''
checked.push('build.linux.desktop.entry.MimeType')
for (const needed of [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain'
]) {
  if (!mime.split(';').includes(needed)) {
    problems.push(
      `package.json: desktop MimeType does not claim ${needed} — ` +
        `double-clicking that file type will not offer Unbound`
    )
  }
}

// --- the app must be able to receive a path -------------------------------
const main = read('src/main/index.js')
checked.push('src/main/index.js single-instance lock')
if (!main.includes('requestSingleInstanceLock')) {
  problems.push(
    'src/main/index.js: no requestSingleInstanceLock — a second double-click ' +
      'starts a second editor over the same file instead of reaching the open one'
  )
}
checked.push('src/main/index.js argv/open-file pickup')
if (!main.includes("app.on('open-file'") || !main.includes('normalizeOpenPath(process.argv)')) {
  problems.push(
    'src/main/index.js: open-file / argv pickup missing — the .desktop MimeType ' +
      'would advertise an association the app cannot honour'
  )
}

// --- FAIL LOUDLY ----------------------------------------------------------
if (problems.length) {
  console.error(`check-pkgname: ${problems.length} problem(s) of ${checked.length} checks\n`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error(
    '\ncheck-pkgname: `unbound` is the Debian DNS resolver. Ship as `unbound-editor`.'
  )
  process.exit(1)
}

console.log(`check-pkgname: PASS — ${checked.length} checks, package/executable are ${PKG}, display name Unbound`)
