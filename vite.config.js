import http from 'node:http'
import { spawn } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

let inFlight = false
let inFlightSince = 0
let recovering = null
let activeUp = null

/** Tope duro de seguridad para una generación (ms). Si el motor se cuelga,
 *  esto libera el puente en vez de dejarlo bloqueado para siempre. */
const GENERATE_WATCHDOG_MS = 8 * 60 * 1000

function disarmTimeouts(sock) {
  if (!sock) return
  sock.setTimeout(0)
  sock.setNoDelay?.(true)
}

function queryOf(req) {
  const i = req.url.indexOf('?')
  return i >= 0 ? req.url.slice(i) : ''
}

function pingS2() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:3030/', (up) => {
      up.resume()
      resolve(up.statusCode || 0)
    })
    req.on('error', reject)
    req.setTimeout(2000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

function waitForS2(ms = 50000) {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      pingS2()
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - t0 > ms) reject(new Error('s2.cpp no arrancó a tiempo'))
          else setTimeout(tick, 700)
        })
    }
    setTimeout(tick, 500)
  })
}

function restartS2Container() {
  return new Promise((resolve) => {
    const child = spawn('docker', ['restart', 's2eval'], { windowsHide: true })
    const done = () => resolve()
    child.on('exit', done)
    child.on('error', done)
  })
}

function recoverS2() {
  if (recovering) return recovering
  recovering = (async () => {
    try {
      activeUp?.destroy()
      activeUp = null
      await restartS2Container()
      await waitForS2(50000)
    } finally {
      recovering = null
      inFlight = false
    }
  })()
  return recovering
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function postS2Generate(headers, body, signalAbort) {
  return new Promise((resolve, reject) => {
    const hdrs = { ...headers, host: '127.0.0.1:3030' }
    delete hdrs.connection
    hdrs['content-length'] = String(body.length)

    const up = http.request(
      {
        hostname: '127.0.0.1',
        port: 3030,
        path: '/generate',
        method: 'POST',
        headers: hdrs,
      },
      (upRes) => {
        const chunks = []
        upRes.on('data', (c) => chunks.push(c))
        upRes.on('end', () => {
          if (activeUp === up) activeUp = null
          resolve({
            status: upRes.statusCode || 502,
            headers: upRes.headers,
            body: Buffer.concat(chunks),
          })
        })
      },
    )
    activeUp = up
    up.setTimeout(0)
    up.on('error', (err) => {
      if (activeUp === up) activeUp = null
      reject(err)
    })
    signalAbort?.(() => {
      up.destroy()
      reject(Object.assign(new Error('aborted'), { code: 'ABORTED' }))
    })
    up.write(body)
    up.end()
  })
}

async function handleGenerate(req, res) {
  const body = await readBody(req)
  let aborted = false
  const onClientGone = () => {
    if (res.writableEnded) return
    aborted = true
    activeUp?.destroy()
  }
  // 'aborted' está obsoleto en Node 20+; 'close' en la respuesta detecta de
  // forma fiable que el navegador cortó, aunque el motor siga trabajando.
  req.on('aborted', onClientGone)
  res.on('close', onClientGone)

  const send = async () => postS2Generate(req.headers, body, (fn) => {
    if (aborted) fn()
    req.on('aborted', fn)
    res.on('close', fn)
  })

  let result
  try {
    result = await send()
  } catch (err) {
    if (aborted || err.code === 'ABORTED') {
      if (!res.headersSent) {
        res.statusCode = 499
        res.end('cancelado')
      }
      return
    }
    await waitForS2(20000).catch(() => recoverS2())
    try {
      result = await send()
    } catch (err2) {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(`No se pudo conectar con s2.cpp (${err2.message})`)
      }
      return
    }
  }

  if (result.status === 503) {
    await recoverS2().catch(() => {})
    try {
      result = await send()
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(`s2.cpp ocupado y no se pudo liberar (${err.message})`)
      }
      return
    }
  }

  if (res.headersSent) return
  const outHeaders = { ...result.headers }
  outHeaders['access-control-allow-origin'] = '*'
  delete outHeaders['transfer-encoding']
  res.writeHead(result.status, outHeaders)
  res.end(result.body)
}

function pipeToStt(req, res) {
  const headers = { ...req.headers, host: '127.0.0.1:3031' }
  delete headers.connection
  disarmTimeouts(req.socket)
  const up = http.request(
    {
      hostname: '127.0.0.1',
      port: 3031,
      path: `/transcribe${queryOf(req)}`,
      method: req.method,
      headers,
    },
    (upRes) => {
      const outHeaders = { ...upRes.headers }
      outHeaders['access-control-allow-origin'] = '*'
      res.writeHead(upRes.statusCode || 502, outHeaders)
      upRes.pipe(res)
    },
  )
  up.setTimeout(0)
  up.on('error', (err) => {
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: `Whisper no está en :3031 (${err.message})`,
        }),
      )
    }
  })
  req.pipe(up)
}

function s2BridgePlugin() {
  return {
    name: 's2-bridge',
    configureServer(server) {
      const armHttp = () => {
        const hs = server.httpServer
        if (!hs) return
        hs.headersTimeout = 0
        hs.requestTimeout = 0
        hs.timeout = 0
        hs.keepAliveTimeout = 120000
      }
      armHttp()
      server.httpServer?.on('listening', armHttp)

      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''

        if (url === '/__s2_cancel' && req.method === 'POST') {
          ;(async () => {
            activeUp?.destroy()
            await recoverS2().catch(() => {})
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, ready: true }))
          })()
          return
        }

        if (url === '/__s2_health') {
          if (inFlight || recovering) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ok: true,
                busy: true,
                busySeconds: inFlightSince
                  ? Math.round((Date.now() - inFlightSince) / 1000)
                  : 0,
              }),
            )
            return
          }
          const ping = http.get('http://127.0.0.1:3030/', (up) => {
            up.resume()
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, upstream: up.statusCode }))
          })
          ping.on('error', () => {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false }))
          })
          ping.setTimeout(2500, () => ping.destroy())
          return
        }

        if (url === '/__stt_health') {
          const ping = http.get('http://127.0.0.1:3031/health', (up) => {
            const chunks = []
            up.on('data', (c) => chunks.push(c))
            up.on('end', () => {
              res.statusCode = up.statusCode === 200 ? 200 : 503
              res.setHeader('Content-Type', 'application/json')
              res.end(Buffer.concat(chunks))
            })
          })
          ping.on('error', () => {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false }))
          })
          ping.setTimeout(2500, () => ping.destroy())
          return
        }

        if (url === '/api/generate' && req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }

        if (url === '/api/generate' && req.method === 'POST') {
          ;(async () => {
            if (recovering) await recovering.catch(() => {})
            if (inFlight) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              res.end('Ya hay una generación en curso. Cancela o espera.')
              return
            }
            inFlight = true
            inFlightSince = Date.now()
            // Perro guardián: si el motor se queda colgado y nunca responde,
            // sin esto inFlight se queda true para siempre y la API parece
            // "desconectada" (todo devuelve 503 hasta reiniciar).
            const watchdog = setTimeout(() => {
              activeUp?.destroy()
            }, GENERATE_WATCHDOG_MS)
            try {
              await handleGenerate(req, res)
            } catch (err) {
              if (!res.headersSent) {
                res.statusCode = 502
                res.end(String(err.message || err))
              }
            } finally {
              clearTimeout(watchdog)
              inFlight = false
              inFlightSince = 0
            }
          })()
          return
        }

        if (url === '/api/transcribe' && req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }

        if (url === '/api/transcribe' && req.method === 'POST') {
          pipeToStt(req, res)
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), s2BridgePlugin()],
  server: {
    host: true,
    port: 5173,
  },
})
