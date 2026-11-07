import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'

const viewport = { width: 1366, height: 768 }

async function freePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

const evaluateString = (fn, args) => `(${fn.toString()})(...${JSON.stringify(args)})`

async function chrome() {
  const executablePath = [
    process.env.TUKI_CHROME, path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    path.join(os.homedir(), '.cache/puppeteer/chrome/win64-152.0.7977.75/chrome-win64/chrome.exe'),
  ].find(file => file && existsSync(file))
  if (!executablePath) throw new Error('Definí TUKI_CHROME con la ruta de Chrome de escritorio.')
  const browser = await chromium.launch({
    executablePath, headless: false, args: ['--window-size=1460,930', '--no-first-run', '--no-default-browser-check'],
  })
  try {
    const session = await browser.newContext({ viewport })
    const page = await session.newPage()
    page.on('pageerror', error => console.error('Chrome ·', error.message))
    await page.bringToFront()
    return {
      name: 'Chrome', version: browser.version(), executablePath,
      goto: url => page.goto(url),
      eval: (fn, ...args) => page.evaluate(evaluateString(fn, args)),
      capture: () => page.screenshot({ type: 'png' }),
      close: () => browser.close(),
    }
  } catch (error) {
    await browser.close()
    throw error
  }
}

async function firefox() {
  const executablePath = process.env.TUKI_FIREFOX || path.join(process.env.ProgramFiles || 'C:/Program Files', 'Mozilla Firefox/firefox.exe')
  if (!existsSync(executablePath)) throw new Error('Definí TUKI_FIREFOX con la ruta de Firefox de escritorio.')
  const profile = await mkdtemp(path.join(os.tmpdir(), 'tuki-firefox-'))
  // Preserve the actual adapter name in WebGL diagnostics. This only affects this temporary profile.
  await writeFile(path.join(profile,'user.js'),'user_pref("webgl.sanitize-unmasked-renderer", false);\n')
  const port = await freePort()
  const args = ['--no-remote', '--new-instance', '--profile', profile, '--remote-debugging-port', String(port), '--width', '1460', '--height', '930', 'about:blank']
  const processHandle = spawn(executablePath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  processHandle.stdout.resume()
  processHandle.stderr.resume()
  let socket
  let nextId = 0
  const requests = new Map()
  let launchError
  processHandle.once('error', error => { launchError = error })
  const closing = once(processHandle, 'close').catch(() => {})

  // Firefox's remote agent accepts WebDriver BiDi on loopback, independent of geckodriver.
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { requests.delete(id); reject(new Error(`No respondió Firefox a ${method}`)) }, 120_000)
    requests.set(id, message => {
      clearTimeout(timer)
      if (message.type === 'error') reject(new Error(method + ' · ' + message.message))
      else resolve(message.result)
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const close = async () => {
    if (socket?.readyState === WebSocket.OPEN) {
      await Promise.race([send('browser.close').catch(() => {}), pause(1500)])
      socket.close()
    }
    await Promise.race([closing, pause(1500)])
    if (processHandle.exitCode === null && processHandle.pid) processHandle.kill()
    await Promise.race([closing, pause(1500)])
    // Only remove the isolated profile created above, never the user's Firefox profile.
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(profile))
    if (/^tuki-firefox-[^\\/]+$/.test(relative)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
  try {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (launchError) throw launchError
      if (processHandle.exitCode !== null) throw new Error(`Firefox terminó al abrirse (${processHandle.exitCode}).`)
      const candidate = new WebSocket(`ws://127.0.0.1:${port}/session`)
      const opened = await new Promise(resolve => {
        candidate.addEventListener('open', () => resolve(true), { once: true })
        candidate.addEventListener('error', () => resolve(false), { once: true })
      })
      if (opened) { socket = candidate; break }
      await pause(150)
    }
    if (!socket) throw new Error('Firefox no abrió la sesión local WebDriver BiDi.')
    socket.addEventListener('message', message => {
      const response = JSON.parse(message.data)
      requests.get(response.id)?.(response)
      requests.delete(response.id)
    })
    socket.addEventListener('close', () => {
      for (const callback of requests.values()) callback({ type: 'error', message: 'Se cerró el navegador' })
      requests.clear()
    })
    const session = await send('session.new', { capabilities: { alwaysMatch: {} } })
    const { contexts } = await send('browsingContext.getTree', { maxDepth: 0 })
    const context = contexts[0].context
    await send('browsingContext.setViewport', { context, viewport })
    await send('browsingContext.activate', { context })
    return {
      name: 'Firefox', version: session.capabilities.browserVersion, executablePath,
      goto: url => send('browsingContext.navigate', { context, url, wait: 'complete' }),
      eval: async (fn, ...args) => {
        const expression = `Promise.resolve(${evaluateString(fn, args)}).then(value => JSON.stringify(value ?? null))`
        const value = await send('script.evaluate', { expression, target: { context }, awaitPromise: true })
        if (value.type === 'exception') throw new Error(value.exceptionDetails.text)
        return JSON.parse(value.result.value)
      },
      capture: async () => Buffer.from((await send('browsingContext.captureScreenshot', { context })).data, 'base64'),
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}

export const openBrowser = name => name === 'chrome' ? chrome() : firefox()
