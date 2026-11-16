// Front door for the dsh Web UI inside an Olares app.
// Olares already signs the user in at the entrance, so this proxy hands the browser dsh's per-process launch
// token, and presents every request to dsh as a loopback one (Host and Origin), which its browser-trust fence admits.
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'

const LISTEN = Number(process.env.PROXY_PORT || 3000)
const UP_HOST = '127.0.0.1'
const UP_PORT = Number(process.env.DSH_PORT || 3080)
const UP = `${UP_HOST}:${UP_PORT}`
const TOKEN_FILE = process.env.DSH_TOKEN_FILE || '/tmp/dsh-token'

const token = () => { try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim() } catch { return '' } }
const isEntry = (url) => url === '/' || url === '/index.html'
const hasAuth = (h) => /(^|;\s*)dsh-auth-/.test(h.cookie || '')

function upstreamHeaders(h) {
  const out = { ...h, host: UP }
  if (out.origin) out.origin = `http://${UP}`
  if (out.referer) out.referer = out.referer.replace(/^https?:\/\/[^/]+/, `http://${UP}`)
  delete out['x-forwarded-host']
  return out
}

function launch(res) {
  const t = token()
  if (!t) { res.writeHead(503, { 'content-type': 'text/plain' }); res.end('DeepSeek Harness is starting, reload in a few seconds.'); return }
  res.writeHead(302, { location: `/?token=${encodeURIComponent(t)}`, 'cache-control': 'no-store' })
  res.end()
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && isEntry(req.url) && !hasAuth(req.headers)) return launch(res)
  const up = http.request({ host: UP_HOST, port: UP_PORT, method: req.method, path: req.url, headers: upstreamHeaders(req.headers) }, (r) => {
    // a cookie from an earlier dsh process: hand out the current token again
    if (r.statusCode === 401 && req.method === 'GET' && isEntry(req.url)) { r.resume(); return launch(res) }
    res.writeHead(r.statusCode, r.statusMessage, r.headers)
    r.pipe(res)
  })
  up.on('error', () => { if (!res.headersSent) { res.writeHead(502, { 'content-type': 'text/plain' }) } res.end('DeepSeek Harness is not answering yet.') })
  req.pipe(up)
})

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(UP_PORT, UP_HOST, () => {
    const h = upstreamHeaders(req.headers)
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`
    for (const [k, v] of Object.entries(h)) for (const x of [].concat(v)) raw += `${k}: ${x}\r\n`
    up.write(raw + '\r\n')
    if (head?.length) up.write(head)
    up.pipe(socket); socket.pipe(up)
  })
  up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy())
})

server.listen(LISTEN, '0.0.0.0', () => console.log(`proxy: :${LISTEN} -> ${UP}`))
