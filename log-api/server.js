// =============================================================================
// [파일 위치] ~/log-api/server.js
// [역할] DR 로그 파일과 DNS 상태를 React 대시보드에 제공하는 API 서버
// [포트] 3001
// [실행] nohup node server.js &
// =============================================================================

const http = require('http')
const fs = require('fs')

const LOG_FILE = '/var/log/dr_check.log'
const DNS_FILE = '/etc/dnsmasq.d/internal.conf'
const PORT = 3001

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  // GET /logs - dr_check.log 마지막 100줄 반환 (중복 제거)
  if (req.url === '/logs') {
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8')
      const lines = content.trim().split('\n').slice(-100).reverse()

      const seen = new Set()
      const logs = lines.map(line => {
        const match = line.match(/\[(.+?)\] (\w+)\s+(.+)/)
        if (!match) return null
        const key = `${match[1]}-${match[3]}`
        if (seen.has(key)) return null
        seen.add(key)
        return { time: match[1], level: match[2], msg: match[3] }
      }).filter(Boolean)

      res.end(JSON.stringify({ logs }))
    } catch {
      res.end(JSON.stringify({ logs: [] }))
    }

  // GET /dns - 현재 DNS가 AWS인지 온프레미스인지 반환
  } else if (req.url === '/dns') {
    try {
      const content = fs.readFileSync(DNS_FILE, 'utf8')
      const match = content.match(/address=\/service\.local\/(.+)/)
      const ip = match ? match[1].trim() : ''
      const isDR = ip.startsWith('172.')  // AWS IP는 172.31.x.x
      res.end(JSON.stringify({ ip, isDR }))
    } catch {
      res.end(JSON.stringify({ ip: '', isDR: false }))
    }

  } else {
    res.end(JSON.stringify({ ok: true }))
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Log API server running on port ${PORT}`)
})
