/** Local-only preview and download transport for reconstructed candidate workspaces. */
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  cp, lstat, open, readFile, realpath, readdir, rename, rm, stat,
} from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { once } from 'node:events'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { Zip, ZipDeflate } from 'fflate'
import { resolveRunsRoot, runGit, type GitConfig } from './git.ts'
import type {
  DualEvalFilePreview, DualEvalFileRequest, DualEvalModelRoute, DualEvalWorkspaceRequest,
} from './types.ts'

const ROUTE = '/dual-model-eval-files'
const MAX_REQUEST_BYTES = 64 * 1024
const MAX_PREVIEW_BYTES = 1024 * 1024
const ZIP_INPUT_CHUNK_BYTES = 64 * 1024
const TICKET_TTL_MS = 5 * 60 * 1000

interface FileRouteConfig extends GitConfig {
  readonly runsRoot?: string
}

interface CandidateRecord {
  readonly artifactDirectory: string
  readonly candidateDirectory: string
  readonly repository: string
  readonly baseCommit: string
  readonly route: DualEvalModelRoute
  readonly patchPath: string
  readonly changedPaths: ReadonlySet<string>
}

interface DownloadTicket {
  readonly kind: 'file' | 'workspace'
  readonly path: string
  readonly filename: string
  readonly expiresAt: number
}

const materializations = new Map<string, Promise<string>>()

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isLoopback(address: string | undefined): boolean {
  if (address === undefined) return false
  return address === '127.0.0.1'
    || address === '::1'
    || address.startsWith('127.')
    || address.startsWith('::ffff:127.')
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

function json(res: ServerResponse, statusCode: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Uint8Array[] = []
  for await (const raw of req as AsyncIterable<unknown>) {
    if (!(raw instanceof Uint8Array)) throw new Error('request body contains invalid data')
    const chunk = new Uint8Array(raw)
    size += chunk.byteLength
    if (size > MAX_REQUEST_BYTES) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new Error('request body must be valid JSON')
  }
}

function isModelRoute(value: unknown): value is DualEvalModelRoute {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return Number.isSafeInteger(row.index)
    && typeof row.label === 'string'
    && typeof row.providerLabel === 'string'
    && typeof row.provider === 'string'
    && typeof row.model === 'string'
    && (row.reasoningEffort === undefined || typeof row.reasoningEffort === 'string')
}

function requestBase(value: unknown): DualEvalWorkspaceRequest {
  if (typeof value !== 'object' || value === null) throw new Error('request must be an object')
  const row = value as Record<string, unknown>
  if (typeof row.artifactDirectory !== 'string' || !isAbsolute(row.artifactDirectory)) {
    throw new Error('artifactDirectory must be an absolute path')
  }
  if (typeof row.runId !== 'string' || row.runId.trim() === '' || row.runId.length > 128) {
    throw new Error('runId is invalid')
  }
  if (!Number.isSafeInteger(row.index) || (row.index as number) < 0) throw new Error('index is invalid')
  return {
    artifactDirectory: row.artifactDirectory,
    runId: row.runId,
    index: row.index as number,
  }
}

function fileRequest(value: unknown): DualEvalFileRequest {
  const base = requestBase(value)
  const path = (value as Record<string, unknown>).path
  if (typeof path !== 'string' || path === '' || path.includes('\u0000') || isAbsolute(path)) {
    throw new Error('path must be a non-empty relative path')
  }
  const normalized = normalize(path)
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || path.split(/[\\/]/u).includes('..')) {
    throw new Error('path escapes the workspace')
  }
  return { ...base, path: normalized }
}

function parseChangedPaths(patch: string): Set<string> {
  const paths = new Set<string>()
  for (const line of patch.split('\n')) {
    if (!line.startsWith('+++ b/') && !line.startsWith('--- a/')) continue
    const path = line.slice(6).trim().replace(/^"|"$/gu, '')
    if (path !== '' && path !== '/dev/null') paths.add(path)
  }
  return paths
}

async function changedPathsFromResult(artifactDirectory: string, index: number, patch: string): Promise<Set<string>> {
  try {
    const result = JSON.parse(await readFile(join(artifactDirectory, 'result.json'), 'utf8')) as {
      models?: { index?: unknown; changes?: { files?: unknown } }[]
    }
    const files = result.models?.find(model => model.index === index)?.changes?.files
    if (Array.isArray(files)) {
      const paths = new Set(files.filter((path): path is string => typeof path === 'string' && path !== ''))
      if (paths.size > 0) return paths
    }
  } catch {
    // Runs interrupted before result.json was persisted can still use their patch headers.
  }
  return parseChangedPaths(patch)
}

async function candidateRecord(
  request: DualEvalWorkspaceRequest,
  config: FileRouteConfig,
): Promise<CandidateRecord> {
  const runsRoot = await resolveRunsRoot(config.runsRoot)
  const artifactDirectory = await realpath(request.artifactDirectory)
  if (!inside(runsRoot, artifactDirectory)) throw new Error('artifactDirectory is outside the comparison evidence root')
  const parsed = JSON.parse(await readFile(join(artifactDirectory, 'request.json'), 'utf8')) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('comparison request metadata is invalid')
  const wire = parsed as Record<string, unknown>
  if (wire.runId !== request.runId) throw new Error('runId does not match the evidence directory')
  if (typeof wire.repository !== 'string' || typeof wire.baseCommit !== 'string' || !Array.isArray(wire.models)) {
    throw new Error('comparison request metadata is incomplete')
  }
  const route = wire.models.find((model: unknown): model is DualEvalModelRoute =>
    isModelRoute(model) && model.index === request.index)
  if (route === undefined) throw new Error('candidate index is not part of this comparison')
  const repository = await realpath(wire.repository)
  const candidateDirectory = await realpath(join(artifactDirectory, `candidate-${String(request.index + 1).padStart(2, '0')}`))
  if (!inside(artifactDirectory, candidateDirectory)) throw new Error('candidate evidence escaped its run directory')
  const patchPath = await realpath(join(candidateDirectory, 'changes.patch'))
  if (!inside(candidateDirectory, patchPath)) throw new Error('candidate patch escaped its evidence directory')
  const patch = await readFile(patchPath, 'utf8')
  return {
    artifactDirectory,
    candidateDirectory,
    repository,
    baseCommit: wire.baseCommit,
    route,
    patchPath,
    changedPaths: await changedPathsFromResult(artifactDirectory, request.index, patch),
  }
}

function omitGit(sourceRoot: string, source: string): boolean {
  const path = relative(sourceRoot, source)
  return path === '' || !path.split(sep).includes('.git')
}

async function buildCandidateSnapshot(ctx: Context, record: CandidateRecord, config: FileRouteConfig): Promise<string> {
  const snapshotDirectory = join(record.candidateDirectory, 'workspace')
  try {
    const info = await stat(snapshotDirectory)
    if (info.isDirectory()) return await realpath(snapshotDirectory)
  } catch {
    // First access reconstructs the final candidate workspace below.
  }

  const runDirectory = dirname(record.artifactDirectory)
  const temporaryWorktree = join(runDirectory, `.preview-worktree-${randomUUID()}`)
  const temporarySnapshot = join(record.candidateDirectory, `.workspace-${randomUUID()}`)
  let worktreeCreated = false
  try {
    await runGit(ctx, record.repository, [
      'worktree', 'add', '--detach', temporaryWorktree, record.baseCommit,
    ], undefined, config)
    worktreeCreated = true
    const patchInfo = await stat(record.patchPath)
    if (patchInfo.size > 0) {
      await runGit(ctx, temporaryWorktree, [
        'apply', '--index', '--binary', '--whitespace=nowarn', record.patchPath,
      ], undefined, config)
    }
    await cp(temporaryWorktree, temporarySnapshot, {
      recursive: true,
      preserveTimestamps: true,
      filter: source => omitGit(temporaryWorktree, source),
    })
    await rename(temporarySnapshot, snapshotDirectory)
    return await realpath(snapshotDirectory)
  } finally {
    await rm(temporarySnapshot, { recursive: true, force: true })
    if (worktreeCreated) {
      try {
        await runGit(ctx, record.repository, ['worktree', 'remove', '--force', temporaryWorktree], undefined, config)
        await runGit(ctx, record.repository, ['worktree', 'prune'], undefined, config)
      } catch {
        await rm(temporaryWorktree, { recursive: true, force: true })
      }
    }
  }
}

async function candidateSnapshot(ctx: Context, record: CandidateRecord, config: FileRouteConfig): Promise<string> {
  const key = `${record.artifactDirectory}\u0000${String(record.route.index)}`
  const existing = materializations.get(key)
  if (existing !== undefined) return existing
  const pending = buildCandidateSnapshot(ctx, record, config)
  materializations.set(key, pending)
  try {
    return await pending
  } catch (error) {
    materializations.delete(key)
    throw error
  }
}

async function targetFile(snapshot: string, path: string): Promise<string | undefined> {
  const candidate = resolve(snapshot, path)
  if (!inside(snapshot, candidate)) throw new Error('path escapes the workspace')
  try {
    const resolved = await realpath(candidate)
    if (!inside(snapshot, resolved)) throw new Error('path resolves outside the workspace')
    const info = await lstat(resolved)
    if (info.isSymbolicLink()) throw new Error('symbolic links cannot be previewed or downloaded')
    if (!info.isFile()) throw new Error('path is not a file')
    return resolved
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Reconstruct and return a bounded preview of one changed candidate file. */
export async function previewCandidateFile(
  ctx: Context,
  request: DualEvalFileRequest,
  config: FileRouteConfig,
): Promise<DualEvalFilePreview> {
  const record = await candidateRecord(request, config)
  if (!record.changedPaths.has(request.path)) throw new Error('path is not one of this candidate\'s changed files')
  const snapshot = await candidateSnapshot(ctx, record, config)
  const path = await targetFile(snapshot, request.path)
  if (path === undefined) {
    return { path: request.path, size: 0, content: '', truncated: false, binary: false, deleted: true }
  }
  const info = await stat(path)
  const length = Math.min(info.size, MAX_PREVIEW_BYTES + 1)
  const bytes = Buffer.alloc(length)
  const handle = await open(path, 'r')
  let bytesRead = 0
  try {
    bytesRead = (await handle.read(bytes, 0, length, 0)).bytesRead
  } finally {
    await handle.close()
  }
  const visible = bytes.subarray(0, Math.min(bytesRead, MAX_PREVIEW_BYTES))
  let content = ''
  let binary = visible.includes(0)
  if (!binary) {
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(visible)
    } catch {
      binary = true
    }
  }
  return {
    path: request.path,
    size: info.size,
    content: binary ? '' : content,
    truncated: info.size > MAX_PREVIEW_BYTES,
    binary,
    deleted: false,
  }
}

async function workspaceFiles(root: string): Promise<{ absolute: string; archive: string }[]> {
  const files: { absolute: string; archive: string }[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (entry.name === '.git' || entry.isSymbolicLink()) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push({
        absolute,
        archive: relative(root, absolute).split(sep).join('/'),
      })
    }
  }
  await visit(root)
  return files
}

async function waitForDrain(res: ServerResponse, needsDrain: { value: boolean }): Promise<void> {
  if (!needsDrain.value) return
  needsDrain.value = false
  await once(res, 'drain')
}

async function streamWorkspaceZip(root: string, res: ServerResponse): Promise<void> {
  const files = await workspaceFiles(root)
  const needsDrain = { value: false }
  const completed = new Promise<void>((resolveCompleted, rejectCompleted) => {
    const archive = new Zip((error, data, final) => {
      if (error !== null) {
        rejectCompleted(error)
        return
      }
      if (data.byteLength > 0 && !res.write(data)) needsDrain.value = true
      if (final) {
        res.end()
        resolveCompleted()
      }
    })
    void (async () => {
      try {
        for (const file of files) {
          if (res.destroyed) throw new Error('download connection closed')
          const deflate = new ZipDeflate(file.archive, { level: 6 })
          archive.add(deflate)
          for await (const raw of createReadStream(file.absolute, { highWaterMark: ZIP_INPUT_CHUNK_BYTES })) {
            const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
            deflate.push(chunk, false)
            await waitForDrain(res, needsDrain)
          }
          deflate.push(new Uint8Array(), true)
          await waitForDrain(res, needsDrain)
        }
        archive.end()
      } catch (error) {
        archive.terminate()
        rejectCompleted(error instanceof Error ? error : new Error(String(error)))
      }
    })()
  })
  try {
    await completed
  } catch (error) {
    if (!res.destroyed) res.destroy(error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

function safeFilename(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[^\x20-\x7e]/gu, '_')
  return normalized.replace(/["\\/:*?<>|]/gu, '_').replace(/\s+/gu, '-').slice(0, 120) || 'candidate'
}

function contentDisposition(filename: string): string {
  const fallback = safeFilename(filename)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

async function prepareDownload(
  ctx: Context,
  value: unknown,
  config: FileRouteConfig,
  tickets: Map<string, DownloadTicket>,
): Promise<{ url: string; filename: string }> {
  if (typeof value !== 'object' || value === null) throw new Error('request must be an object')
  const kind = (value as Record<string, unknown>).kind
  if (kind !== 'file' && kind !== 'workspace') throw new Error('download kind is invalid')
  const request = kind === 'file' ? fileRequest(value) : requestBase(value)
  const record = await candidateRecord(request, config)
  const snapshot = await candidateSnapshot(ctx, record, config)
  let path = snapshot
  let filename = `${safeFilename(basename(record.repository))}-${safeFilename(record.route.label)}-worktree.zip`
  if (kind === 'file') {
    const file = request as DualEvalFileRequest
    if (!record.changedPaths.has(file.path)) throw new Error('path is not one of this candidate\'s changed files')
    const target = await targetFile(snapshot, file.path)
    if (target === undefined) throw new Error('deleted files cannot be downloaded')
    path = target
    filename = basename(file.path)
  }
  const token = randomUUID()
  tickets.set(token, { kind, path, filename, expiresAt: Date.now() + TICKET_TTL_MS })
  return { url: `${ROUTE}/download/${token}`, filename }
}

async function serveDownload(req: IncomingMessage, res: ServerResponse, ticket: DownloadTicket): Promise<void> {
  const headers = {
    'content-type': ticket.kind === 'workspace' ? 'application/zip' : 'application/octet-stream',
    'content-disposition': contentDisposition(ticket.filename),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
  if (ticket.kind === 'file') {
    const info = await stat(ticket.path)
    res.writeHead(200, { ...headers, 'content-length': info.size })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(ticket.path).on('error', (error) => { res.destroy(error) }).pipe(res)
    return
  }
  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  await streamWorkspaceZip(ticket.path, res)
}

/** Register same-origin local HTTP routes for file preview and streamed downloads. */
export function registerCandidateFileRoutes(ctx: Context, config: FileRouteConfig): () => void {
  const tickets = new Map<string, DownloadTicket>()
  return ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: async (req, res) => {
      try {
        if (!isLoopback(req.socket.remoteAddress)) {
          json(res, 403, { error: 'candidate files are available only from the local browser' })
          return
        }
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
        if (pathname.startsWith(`${ROUTE}/download/`)) {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            json(res, 405, { error: 'method not allowed' })
            return
          }
          const token = pathname.slice(`${ROUTE}/download/`.length)
          const ticket = tickets.get(token)
          tickets.delete(token)
          if (ticket === undefined || ticket.expiresAt < Date.now()) {
            json(res, 404, { error: 'download link expired' })
            return
          }
          await serveDownload(req, res, ticket)
          return
        }
        if (req.method !== 'POST') {
          json(res, 405, { error: 'method not allowed' })
          return
        }
        const value = await readJson(req)
        if (pathname === `${ROUTE}/preview`) {
          json(res, 200, await previewCandidateFile(ctx, fileRequest(value), config))
          return
        }
        if (pathname === `${ROUTE}/prepare`) {
          for (const [token, ticket] of tickets) {
            if (ticket.expiresAt < Date.now()) tickets.delete(token)
          }
          json(res, 200, await prepareDownload(ctx, value, config, tickets))
          return
        }
        json(res, 404, { error: 'not found' })
      } catch (error) {
        if (res.headersSent) {
          res.destroy(error instanceof Error ? error : undefined)
          return
        }
        json(res, 400, { error: errorText(error) })
      }
    },
  })
}
