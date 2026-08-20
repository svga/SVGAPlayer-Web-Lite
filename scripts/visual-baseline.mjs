import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { parse } from 'acorn'

const executeFile = promisify(execFile)
const numericIdentifier = '(?:0|[1-9]\\d*)'
const prereleaseIdentifier = '(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)'
const strictSemver = new RegExp(`^${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`)

function allowedBaseline (baseline) {
  return baseline === 'latest' || baseline === 'local' || strictSemver.test(baseline)
}

export function parseBaselineOptions (arguments_ = []) {
  if (arguments_.length === 0) return { baseline: 'latest' }
  if (arguments_.length !== 2 || arguments_[0] !== '--baseline') {
    throw new Error('Usage: --baseline <latest|local|exact semver>')
  }

  const baseline = arguments_[1]
  if (allowedBaseline(baseline)) return { baseline }
  throw new Error('Baseline must be latest, local, or an exact semver')
}

async function defaultRun (command, arguments_, options = {}) {
  const { stdout } = await executeFile(command, arguments_, {
    cwd: options.cwd,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  })
  return stdout
}

function scriptIntegrity (bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

async function readJson (path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

function identifierIs (node, name) {
  return node?.type === 'Identifier' && node.name === name
}

function assignmentHasProperty (node, property, objectName) {
  return node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' &&
    !node.left.computed && identifierIs(node.left.property, property) &&
    (!objectName || identifierIs(node.left.object, objectName))
}

function usesIdentifier (node, name) {
  let found = false
  const visit = value => {
    if (found || !value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (identifierIs(value, name)) {
      found = true
      return
    }
    if (value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression') return
    for (const child of Object.values(value)) visit(child)
  }
  visit(node)
  return found
}

function hasCommonJsTypeofTest (test) {
  const typeofNames = new Set()
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return void node.forEach(visit)
    if (node.type === 'UnaryExpression' && node.operator === 'typeof' && node.argument.type === 'Identifier') typeofNames.add(node.argument.name)
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return
    for (const child of Object.values(node)) visit(child)
  }
  visit(test)
  return typeofNames.has('exports') && typeofNames.has('module')
}

function isCommonJsExportTarget (node) {
  return identifierIs(node, 'exports') || (node?.type === 'MemberExpression' &&
    !node.computed && identifierIs(node.object, 'module') && identifierIs(node.property, 'exports'))
}

function isGlobalSvgaAssignment (node, globalName) {
  return node?.type === 'AssignmentExpression' && node.operator === '=' &&
    node.left.type === 'MemberExpression' && !node.left.computed &&
    identifierIs(node.left.property, 'SVGA') && usesIdentifier(node.left.object, globalName)
}

function expressionCallsFactory (expression, factoryName, acceptsArgument) {
  if (expression?.type === 'CallExpression' && identifierIs(expression.callee, factoryName)) {
    return expression.arguments.some(acceptsArgument)
  }
  if (expression?.type === 'SequenceExpression') return expression.expressions.some(candidate => expressionCallsFactory(candidate, factoryName, acceptsArgument))
  if (expression?.type === 'ConditionalExpression') {
    return expressionCallsFactory(expression.consequent, factoryName, acceptsArgument) || expressionCallsFactory(expression.alternate, factoryName, acceptsArgument)
  }
  return false
}

function expressionAssignsExport (expression, property, exportedObject) {
  if (assignmentHasProperty(expression, property, exportedObject)) return true
  return expression?.type === 'SequenceExpression' && expression.expressions.some(candidate => assignmentHasProperty(candidate, property, exportedObject))
}

function reachableTopLevelStatements (body) {
  const statements = []
  for (const statement of body.body) {
    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') break
    statements.push(statement)
  }
  return statements
}

function patternBindsName (pattern, names) {
  if (pattern?.type === 'Identifier') return names.has(pattern.name)
  if (pattern?.type === 'RestElement') return patternBindsName(pattern.argument, names)
  if (pattern?.type === 'AssignmentPattern') return patternBindsName(pattern.left, names)
  if (pattern?.type === 'ArrayPattern') return pattern.elements.some(element => patternBindsName(element, names))
  if (pattern?.type === 'ObjectPattern') return pattern.properties.some(property => patternBindsName(property.value, names))
  return false
}

function hasShadowedBinding (value, names) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(item => hasShadowedBinding(item, names))
  if (value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression') return false
  if (value.type === 'FunctionDeclaration') return names.has(value.id.name)
  if (value.type === 'ClassDeclaration') return names.has(value.id.name)
  if (value.type === 'VariableDeclarator' && patternBindsName(value.id, names)) return true
  if (value.type === 'CatchClause' && patternBindsName(value.param, names)) return true
  return Object.values(value).some(child => hasShadowedBinding(child, names))
}

function unwrapIifeCall (expression) {
  if (expression?.type === 'CallExpression') return expression
  if (expression?.type === 'UnaryExpression' && expression.operator === '!' && expression.argument.type === 'CallExpression') {
    return expression.argument
  }
  return null
}

function hasUmdRuntimeShape (program) {
  const calls = program.body
    .filter(statement => statement.type === 'ExpressionStatement')
    .map(statement => unwrapIifeCall(statement.expression))
    .filter(Boolean)
  if (calls.length !== 1) return false
  const call = calls[0]
  if (!call || call.callee.type !== 'FunctionExpression') return false

  const wrapper = call.callee
  const factoryIndex = call.arguments.findIndex(argument => argument?.type === 'FunctionExpression')
  if (factoryIndex < 1 || call.arguments.filter(argument => argument?.type === 'FunctionExpression').length !== 1) return false
  const factory = call.arguments[factoryIndex]
  const factoryParameter = wrapper.params[factoryIndex]
  const globalParameter = wrapper.params[0]
  const exportedObject = factory.params[0]
  if (!identifierIs(factoryParameter, factoryParameter?.name) || !identifierIs(globalParameter, globalParameter?.name) || !identifierIs(exportedObject, exportedObject?.name)) return false

  const wrapperStatements = reachableTopLevelStatements(wrapper.body)
  const factoryStatements = reachableTopLevelStatements(factory.body)
  if (hasShadowedBinding(wrapperStatements, new Set([factoryParameter.name, globalParameter.name])) || hasShadowedBinding(factoryStatements, new Set([exportedObject.name]))) return false

  let exportsParser = false
  let exportsPlayer = false
  for (const statement of factoryStatements) {
    if (statement.type !== 'ExpressionStatement') continue
    exportsParser ||= expressionAssignsExport(statement.expression, 'Parser', exportedObject.name)
    exportsPlayer ||= expressionAssignsExport(statement.expression, 'Player', exportedObject.name)
  }
  if (!exportsParser || !exportsPlayer) return false

  let hasLinkedBranches = false
  for (const statement of wrapperStatements) {
    if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'ConditionalExpression') continue
    const candidate = statement.expression
    if (!hasCommonJsTypeofTest(candidate.test)) continue
    const commonJsCallsFactory = expressionCallsFactory(candidate.consequent, factoryParameter.name, isCommonJsExportTarget)
    const globalCallsFactory = expressionCallsFactory(candidate.alternate, factoryParameter.name, argument => isGlobalSvgaAssignment(argument, globalParameter.name))
    hasLinkedBranches ||= commonJsCallsFactory && globalCallsFactory
  }
  return hasLinkedBranches
}

async function inspectRuntime (directory, metadata) {
  const manifest = await readJson(join(directory, 'package.json'))
  if (!manifest || manifest.name !== 'svga' || typeof manifest.version !== 'string') return null
  if (metadata.expectedVersion && manifest.version !== metadata.expectedVersion) return null
  const file = join(directory, 'dist/index.min.js')
  let bytes
  try {
    bytes = await readFile(file)
  } catch {
    return null
  }
  let program
  try {
    program = parse(bytes.toString('utf8'), { ecmaVersion: 'latest', sourceType: 'script' })
  } catch {
    return null
  }
  if (!hasUmdRuntimeShape(program)) return null

  const calculatedScriptIntegrity = scriptIntegrity(bytes)
  if (metadata.expectedScriptIntegrity && metadata.expectedScriptIntegrity !== calculatedScriptIntegrity) return null

  const runtime = {
    version: manifest.version,
    source: metadata.source,
    url: metadata.url,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    integrity: metadata.integrity || null,
    scriptIntegrity: calculatedScriptIntegrity,
    cacheState: metadata.cacheState,
    ...(metadata.onlineConfirmed === undefined ? {} : { onlineConfirmed: metadata.onlineConfirmed }),
    ...(metadata.warning ? { warning: metadata.warning } : {}),
  }
  Object.defineProperty(runtime, 'runtimePath', { value: file, enumerable: false, writable: true })
  return runtime
}

async function localVersion (projectDir) {
  const manifest = await readJson(join(projectDir, 'package.json'))
  return manifest?.name === 'svga' && typeof manifest.version === 'string' ? manifest.version : null
}

async function metadataForDirectory ({ directory, expectedVersion, expectedScriptIntegrity, source, url, cacheState, integrity, onlineConfirmed, projectDir }) {
  const runtime = await inspectRuntime(directory, { expectedVersion, expectedScriptIntegrity, source, url, cacheState, integrity, onlineConfirmed })
  if (!runtime) return null
  const currentVersion = await localVersion(projectDir)
  if (url === '/runtime/baseline.js' && currentVersion === runtime.version) runtime.warning = 'Baseline version is the same as local runtime.'
  return runtime
}

function readNpmMetadata (output) {
  const parsed = JSON.parse(String(output))
  const value = Array.isArray(parsed) ? parsed[0] : parsed
  const version = value?.version
  const integrity = value?.['dist.integrity'] || value?.dist?.integrity
  if (typeof version !== 'string' || !strictSemver.test(version) || typeof integrity !== 'string' || integrity.length === 0) {
    throw new Error('npm did not return a valid svga version and integrity')
  }
  return { version, integrity }
}

async function resolveFromNpm (spec, dependencies) {
  const output = await dependencies.run('npm', ['view', `svga@${spec}`, 'version', 'dist.integrity', '--json', '--ignore-scripts'], { cwd: dependencies.projectDir })
  return readNpmMetadata(output)
}

async function cacheLatest (cacheDir) {
  const latest = await readJson(join(cacheDir, 'latest.json'))
  if (!latest || !strictSemver.test(latest.version) || typeof latest.integrity !== 'string' || typeof latest.scriptIntegrity !== 'string') return null
  return latest
}

async function writeJsonAtomically (path, value) {
  const parent = dirname(path)
  await mkdir(parent, { recursive: true })
  const temporaryDirectory = await mkdtemp(join(parent, `.${basename(path)}-`))
  const temporary = join(temporaryDirectory, basename(path))
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`)
    await rename(temporary, path)
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

async function writeLatest (cacheDir, latest) {
  await writeJsonAtomically(join(cacheDir, 'latest.json'), { ...latest, resolvedAt: new Date().toISOString() })
}

async function writeCacheMetadata (directory, metadata) {
  await writeJsonAtomically(join(directory, 'metadata.json'), metadata)
}

async function cachedRuntimeAt ({ directory, version, cacheState, onlineConfirmed, expectedIntegrity, expectedScriptIntegrity, projectDir }) {
  const cached = await readJson(join(directory, 'metadata.json'))
  if (!cached || cached.version !== version || typeof cached.integrity !== 'string' || typeof cached.scriptIntegrity !== 'string') return null
  if (expectedIntegrity && cached.integrity !== expectedIntegrity) return null
  if (expectedScriptIntegrity && cached.scriptIntegrity !== expectedScriptIntegrity) return null
  return await metadataForDirectory({
    directory, expectedVersion: version, expectedScriptIntegrity: cached.scriptIntegrity, source: 'npm',
    url: '/runtime/baseline.js', cacheState, integrity: cached.integrity, onlineConfirmed, projectDir
  })
}

async function cachedRuntime ({ cacheDir, version, cacheState, onlineConfirmed, expectedIntegrity, expectedScriptIntegrity, projectDir }) {
  return await cachedRuntimeAt({
    directory: join(cacheDir, 'versions', version), version, cacheState, onlineConfirmed,
    expectedIntegrity, expectedScriptIntegrity, projectDir
  })
}

function packedFilename (output) {
  const parsed = JSON.parse(String(output))
  const entry = Array.isArray(parsed)
    ? parsed[0]
    : typeof parsed?.filename === 'string'
      ? parsed
      : Object.values(parsed || {}).find(value => value && typeof value === 'object' && typeof value.filename === 'string')
  if (!entry || typeof entry.filename !== 'string' || basename(entry.filename) !== entry.filename) {
    throw new Error('npm pack did not return a package filename')
  }
  return entry.filename
}

async function downloadRuntime (version, integrity, dependencies) {
  const { cacheDir, projectDir, run } = dependencies
  const versionsDir = join(cacheDir, 'versions')
  const target = join(versionsDir, version)
  const staging = await mkdtemp(join(tmpdir(), `svga-visual-${process.pid}-`))
  const unpacked = join(staging, 'package')
  try {
    const packed = await run('npm', ['pack', `svga@${version}`, '--ignore-scripts', '--json', '--pack-destination', staging], { cwd: projectDir })
    const archive = join(staging, packedFilename(packed))
    await mkdir(unpacked, { recursive: true })
    await run('tar', ['-xzf', archive, '-C', unpacked, '--strip-components=1'], { cwd: projectDir })
    const validated = await metadataForDirectory({
      directory: unpacked, expectedVersion: version, source: 'npm', url: '/runtime/baseline.js',
      cacheState: 'downloaded', integrity, onlineConfirmed: true, projectDir
    })
    if (!validated) throw new Error('Downloaded package is not svga with a matching dist/index.min.js')
    await writeCacheMetadata(unpacked, {
      version,
      integrity,
      scriptIntegrity: validated.scriptIntegrity
    })
    await mkdir(versionsDir, { recursive: true })
    const expectedRuntime = {
      cacheDir, version, cacheState: 'confirmed-cache', onlineConfirmed: true,
      expectedIntegrity: integrity, expectedScriptIntegrity: validated.scriptIntegrity, projectDir
    }
    const inspectTarget = async () => {
      const matching = await cachedRuntime(expectedRuntime)
      if (matching) return { matching, existing: null }
      const existing = await cachedRuntime({
        cacheDir, version, cacheState: 'confirmed-cache', onlineConfirmed: true, projectDir
      })
      return { matching: null, existing }
    }
    const matchesExpectedRuntime = runtime => runtime && runtime.integrity === integrity && runtime.scriptIntegrity === validated.scriptIntegrity
    const isCollision = error => error && typeof error === 'object' && ['EEXIST', 'ENOTEMPTY'].includes(error.code)
    let lastError = null

    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await inspectTarget()
      if (before.matching) return before.matching
      if (matchesExpectedRuntime(before.existing)) return before.existing
      if (before.existing) throw new Error(`Refusing to replace validated cache for ${version} with a conflicting package integrity`)

      try {
        await rename(unpacked, target)
        validated.runtimePath = join(target, 'dist/index.min.js')
        return validated
      } catch (error) {
        if (!isCollision(error)) throw error
        lastError = error
      }

      const afterPublishConflict = await inspectTarget()
      if (afterPublishConflict.matching) return afterPublishConflict.matching
      if (matchesExpectedRuntime(afterPublishConflict.existing)) return afterPublishConflict.existing
      if (afterPublishConflict.existing) throw new Error(`Refusing to replace validated cache for ${version} with a conflicting package integrity`)

      const quarantine = join(versionsDir, `.${version}.quarantine-${randomUUID()}`)
      let quarantineIsInvalid = false
      try {
        try {
          await rename(target, quarantine)
        } catch (error) {
          if (error && typeof error === 'object' && error.code === 'ENOENT') continue
          throw error
        }

        const movedMatching = await cachedRuntimeAt({
          directory: quarantine, version, cacheState: 'confirmed-cache', onlineConfirmed: true,
          expectedIntegrity: integrity, expectedScriptIntegrity: validated.scriptIntegrity, projectDir
        })
        const movedExisting = movedMatching || await cachedRuntimeAt({
          directory: quarantine, version, cacheState: 'confirmed-cache', onlineConfirmed: true, projectDir
        })
        if (movedExisting) {
          try {
            await rename(quarantine, target)
          } catch (error) {
            const winner = await inspectTarget()
            if (winner.matching) {
              await rm(quarantine, { force: true, recursive: true })
              return winner.matching
            }
            if (matchesExpectedRuntime(winner.existing)) {
              await rm(quarantine, { force: true, recursive: true })
              return winner.existing
            }
            if (winner.existing) throw new Error(`Refusing to replace validated cache for ${version} with a conflicting package integrity`)
            throw error
          }
          const restored = await inspectTarget()
          if (restored.matching) return restored.matching
          if (matchesExpectedRuntime(restored.existing)) return restored.existing
          if (restored.existing) throw new Error(`Refusing to replace validated cache for ${version} with a conflicting package integrity`)
          continue
        }

        quarantineIsInvalid = true
        try {
          await rename(unpacked, target)
          validated.runtimePath = join(target, 'dist/index.min.js')
          return validated
        } catch (error) {
          lastError = error
          const winner = await inspectTarget()
          if (winner.matching) return winner.matching
          if (matchesExpectedRuntime(winner.existing)) return winner.existing
          if (winner.existing) throw new Error(`Refusing to replace validated cache for ${version} with a conflicting package integrity`)
        }
      } finally {
        if (quarantineIsInvalid) await rm(quarantine, { force: true, recursive: true })
      }
    }
    throw new Error(`Baseline cache publish collision for ${version} did not produce a matching runtime: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  } finally {
    await rm(staging, { force: true, recursive: true })
  }
}

export async function prepareBaselineRuntime (request, suppliedDependencies = {}) {
  const baseline = request?.baseline
  if (typeof baseline !== 'string' || !allowedBaseline(baseline)) {
    throw new Error('Baseline must be latest, local, or an exact semver')
  }
  const projectDir = resolve(suppliedDependencies.projectDir || resolve(import.meta.dirname, '..'))
  const cacheDir = resolve(suppliedDependencies.cacheDir || join(projectDir, 'node_modules/.cache/svga-visual'))
  const dependencies = { projectDir, cacheDir, run: suppliedDependencies.run || defaultRun }

  if (baseline === 'local') {
    return await metadataForDirectory({
      directory: projectDir, source: 'local', url: '/runtime/baseline.js', cacheState: 'local', projectDir
    })
  }

  if (baseline === 'latest') {
    try {
      const latest = await resolveFromNpm('latest', dependencies)
      const cached = await cachedRuntime({
        cacheDir, version: latest.version, cacheState: 'confirmed-cache', onlineConfirmed: true, projectDir
      })
      if (cached && cached.integrity !== latest.integrity) {
        throw new Error(`Refusing to replace validated cache for ${latest.version} with a conflicting package integrity`)
      }
      const runtime = cached || await downloadRuntime(latest.version, latest.integrity, dependencies)
      await writeLatest(cacheDir, {
        version: runtime.version,
        integrity: runtime.integrity,
        scriptIntegrity: runtime.scriptIntegrity
      })
      return runtime
    } catch {
      const latest = await cacheLatest(cacheDir)
      if (!latest) return null
      return await cachedRuntime({
        cacheDir, version: latest.version, cacheState: 'stale-cache', onlineConfirmed: false,
        expectedIntegrity: latest.integrity, expectedScriptIntegrity: latest.scriptIntegrity, projectDir
      })
    }
  }

  const cached = await cachedRuntime({
    cacheDir, version: baseline, cacheState: 'cache', projectDir
  })
  if (cached) return cached

  try {
    const resolved = await resolveFromNpm(baseline, dependencies)
    if (resolved.version !== baseline) throw new Error('npm resolved a version different from the requested baseline')
    return await downloadRuntime(resolved.version, resolved.integrity, dependencies)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to prepare exact baseline ${baseline}: ${reason}`)
  }
}

async function gitValue (run, projectDir, arguments_) {
  try {
    return String(await run('git', arguments_, { cwd: projectDir })).trim()
  } catch {
    return null
  }
}

export async function createRuntimeMetadata (suppliedDependencies = {}) {
  const projectDir = resolve(suppliedDependencies.projectDir || resolve(import.meta.dirname, '..'))
  const run = suppliedDependencies.run || defaultRun
  const runtime = await metadataForDirectory({
    directory: projectDir, source: 'local', url: '/runtime/local.js', cacheState: 'local', projectDir
  })
  if (!runtime) throw new Error('Local svga runtime dist/index.min.js is unavailable or invalid')
  runtime.gitCommit = await gitValue(run, projectDir, ['rev-parse', '--short', 'HEAD'])
  const status = await gitValue(run, projectDir, ['status', '--porcelain'])
  runtime.dirty = status === null ? null : status.length > 0
  return runtime
}
