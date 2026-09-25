import { useState, useEffect, useRef, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import './App.css'

const PROMETHEUS_URL = 'http://52.78.72.131:9090'

const C = {
  ok:   '#1D9E75',
  err:  '#E24B4A',
  warn: '#BA7517',
  pub:  '#7F77DD',
  idle: 'rgba(128,128,128,0.15)',
  text: 'var(--color-text-primary)',
  sub:  'var(--color-text-tertiary)',
}

function useInterval(cb, delay) {
  const saved = useRef(cb)
  useEffect(() => { saved.current = cb }, [cb])
  useEffect(() => {
    if (delay === null) return
    const id = setInterval(() => saved.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}

function Clock() {
  const [t, setT] = useState(new Date().toTimeString().slice(0, 8))
  useEffect(() => {
    const id = setInterval(() => setT(new Date().toTimeString().slice(0, 8)), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="clock">{t}</span>
}

function Toast({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <div className="toast-dot" style={{ background: t.color }} />
          <div>
            <div className="toast-msg">{t.msg}</div>
            <div className="toast-time">{t.time}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CauseBadge({ st }) {
  const f = (!st.sw1 && !st.sw2) || ((!st.sw1 || !st.sw2) && (!st.wiki || !st.pg))
  if (!f) return <span className="cause-badge cause-ok">정상</span>
  if (!st.sw1 && !st.sw2) return <span className="cause-badge cause-net">네트워크 장애</span>
  if (!st.wiki && st.sw1 && st.sw2) return <span className="cause-badge cause-svc">서비스 장애</span>
  if (!st.pg && st.sw1 && st.sw2) return <span className="cause-badge cause-db">DB 장애</span>
  return <span className="cause-badge cause-net">복합 장애</span>
}

export default function App() {
  const canvasRef = useRef(null)
  const nodesRef = useRef({})
  const faultStartRef = useRef(null)

  const [st, setSt] = useState({ sw1: true, sw2: true, wiki: true, pg: true })
  const [pkts, setPkts] = useState([])
  const [tick, setTick] = useState(0)
  const [switchCount, setSwitchCount] = useState(0)
  const [faultStart, setFaultStart] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [prevDR, setPrevDR] = useState(false)
  const [toasts, setToasts] = useState([])
  const [uptimeStart] = useState(Date.now())
  const [uptimeSec, setUptimeSec] = useState(0)
  const [rtoHistory, setRtoHistory] = useState([])
  const [faultHistory, setFaultHistory] = useState([])
  const [promConnected, setPromConnected] = useState(false)
  const [timeline, setTimeline] = useState([
    { color: C.ok, time: new Date().toTimeString().slice(0, 8), msg: '시스템 정상 — 온프레미스 운영 중' },
    { color: C.ok, time: new Date(Date.now() - 18000).toTimeString().slice(0, 8), msg: 'DS SW1/SW2 ping 정상' },
    { color: C.ok, time: new Date(Date.now() - 36000).toTimeString().slice(0, 8), msg: 'Wiki.js HTTP 200, PostgreSQL TCP OK' },
  ])

  const now = () => new Date().toTimeString().slice(0, 8)
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const fmtUptime = s => {
    if (s < 60) return `${s}초`
    if (s < 3600) return `${Math.floor(s / 60)}분 ${s % 60}초`
    return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`
  }

  const isDR = useCallback((s = st) =>
    (!s.sw1 && !s.sw2) || ((!s.sw1 || !s.sw2) && (!s.wiki || !s.pg))
  , [st])

  // Prometheus 연동
  useInterval(async () => {
    try {
      const res = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=probe_success`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPromConnected(true)
      const results = data.data.result
      const get = (target) => {
        const found = results.find(r => r.metric.target?.includes(target))
        return found ? found.value[1] === '1' : null
      }
      const sw1 = get('192.168.60.1')
      const sw2 = get('192.168.60.2')
      const wiki = get('192.168.20.20')
      const pg = get('192.168.30.30')
      if (sw1 !== null || sw2 !== null || wiki !== null || pg !== null) {
        setSt(prev => ({
          sw1:  sw1  !== null ? sw1  : prev.sw1,
          sw2:  sw2  !== null ? sw2  : prev.sw2,
          wiki: wiki !== null ? wiki : prev.wiki,
          pg:   pg   !== null ? pg   : prev.pg,
        }))
      }
    } catch {
      setPromConnected(false)
    }
  }, 15000)

  // 업타임
  useInterval(() => {
    if (!faultStart) setUptimeSec(Math.floor((Date.now() - uptimeStart) / 1000))
  }, 1000)

  // RTO 카운터
  useInterval(() => {
    if (faultStart) setElapsed(Math.floor((Date.now() - faultStart) / 1000))
  }, 500)

  // 토스트 자동 제거
  useEffect(() => {
    if (!toasts.length) return
    const id = setTimeout(() => setToasts(p => p.slice(1)), 4000)
    return () => clearTimeout(id)
  }, [toasts])

  const addToast = (msg, color, type) =>
    setToasts(p => [...p, { id: Date.now(), msg, color, type, time: now() }].slice(-4))

  const addTL = (color, msg) =>
    setTimeline(prev => [{ color, time: now(), msg }, ...prev].slice(0, 7))

  // 노드 빌드
  const buildNodes = useCallback((W) => {
    const cx = W / 2
    nodesRef.current = {
      user:    { x: cx,       y: 30,  r: 22, label: '사용자',      sub: 'VLAN10' },
      dns:     { x: cx,       y: 92,  r: 24, label: 'dnsmasq',    sub: 'service.local' },
      sw1:     { x: cx - 170, y: 170, r: 22, label: 'DS SW1',     sub: '99.11' },
      sw2:     { x: cx - 80,  y: 170, r: 22, label: 'DS SW2',     sub: '99.12' },
      wiki:    { x: cx - 170, y: 252, r: 22, label: 'Wiki.js',    sub: 'VLAN20' },
      pg:      { x: cx - 60,  y: 252, r: 22, label: 'PostgreSQL', sub: 'VLAN30' },
      mon:     { x: cx + 60,  y: 170, r: 20, label: 'Monitor',    sub: 'Prometheus' },
      aws:     { x: cx + 170, y: 170, r: 26, label: 'AWS DR',     sub: 'EC2' },
      awswiki: { x: cx + 120, y: 252, r: 18, label: 'Wiki.js',    sub: 'DR' },
      awspg:   { x: cx + 210, y: 252, r: 18, label: 'PostgreSQL', sub: 'DR' },
    }
  }, [])

  const nColor = useCallback((k, s = st) => {
    const f = isDR(s)
    if (k === 'sw1') return s.sw1 ? C.ok : C.err
    if (k === 'sw2') return s.sw2 ? C.ok : C.err
    if (k === 'wiki') return (!s.sw1 && !s.sw2) ? C.err : s.wiki ? C.ok : C.err
    if (k === 'pg')   return (!s.sw1 && !s.sw2) ? C.err : s.pg   ? C.ok : C.err
    if (['aws', 'awswiki', 'awspg'].includes(k)) return f ? C.pub : C.idle
    if (k === 'dns') return f ? C.pub : C.ok
    return C.ok
  }, [st, isDR])

  // 캔버스
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const DPR = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = 290
    canvas.width = W * DPR
    canvas.height = H * DPR
    const ctx = canvas.getContext('2d')
    ctx.scale(DPR, DPR)
    buildNodes(W)

    const nodes = nodesRef.current
    const f = isDR()
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const bgColor = dark ? '#1a1a18' : '#f5f4f0'
    const textColor = dark ? '#c2c0b6' : '#3d3d3a'
    const subColor = dark ? '#4a5a4a' : '#888780'

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, W, H)

    const edge = (a, b, col, dash, w = 1) => {
      const na = nodes[a], nb = nodes[b]
      if (!na || !nb) return
      const dx = nb.x - na.x, dy = nb.y - na.y, len = Math.hypot(dx, dy)
      ctx.beginPath()
      ctx.moveTo(na.x + dx / len * na.r, na.y + dy / len * na.r)
      ctx.lineTo(nb.x - dx / len * nb.r, nb.y - dy / len * nb.r)
      ctx.strokeStyle = col; ctx.lineWidth = w
      ctx.setLineDash(dash ? [5, 5] : []); ctx.stroke(); ctx.setLineDash([])
    }

    edge('user', 'dns', C.ok, false, 1.5)
    edge('dns', 'sw1', f ? C.err : C.ok, f, 1.2)
    edge('dns', 'sw2', f ? C.err : st.sw1 ? 'rgba(128,128,128,0.2)' : C.ok, !f && !st.sw1)
    edge('sw1', 'wiki', st.sw1 && st.wiki ? C.ok : C.err, !st.sw1 || !st.wiki)
    edge('sw1', 'pg',   st.sw1 && st.pg   ? C.ok : C.err, !st.sw1 || !st.pg)
    edge('mon', 'sw1',  'rgba(128,128,128,0.2)', true, .8)
    edge('mon', 'sw2',  'rgba(128,128,128,0.2)', true, .8)
    edge('mon', 'wiki', 'rgba(128,128,128,0.2)', true, .8)
    edge('mon', 'pg',   'rgba(128,128,128,0.2)', true, .8)
    if (f) {
      edge('dns', 'aws',     C.pub, false, 2)
      edge('aws', 'awswiki', C.pub, false, 1.5)
      edge('aws', 'awspg',   C.pub, false, 1.5)
    } else {
      edge('dns', 'aws',     'rgba(128,128,128,0.15)', true)
      edge('aws', 'awswiki', 'rgba(128,128,128,0.15)', true)
      edge('aws', 'awspg',   'rgba(128,128,128,0.15)', true)
    }

    Object.keys(nodes).forEach(k => {
      const n = nodes[k]
      const col = nColor(k)
      const isIdle = col === C.idle
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      ctx.fillStyle = isIdle ? 'rgba(128,128,128,0.08)' : col + '20'
      ctx.fill()
      ctx.strokeStyle = isIdle ? 'rgba(128,128,128,0.2)' : col
      ctx.lineWidth = f && ['aws', 'awswiki', 'awspg'].includes(k) ? 2 : 1.2
      ctx.stroke()
      ctx.fillStyle = isIdle ? subColor : textColor
      ctx.font = '500 11px system-ui, sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(n.label, n.x, n.y - 5)
      ctx.fillStyle = subColor
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillText(n.sub, n.x, n.y + 7)
    })

    pkts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = p.col; ctx.fill()
    })
  }, [st, pkts, buildNodes, nColor, isDR])

  // 패킷 애니메이션
  useInterval(() => {
    setTick(t => t + 1)
    setPkts(prev => {
      const f = isDR()
      const nodes = nodesRef.current
      let next = prev
        .map(p => ({ ...p, p: Math.min(1, p.p + p.s), x: p.x + (p.tx - p.x) * p.s * 2, y: p.y + (p.ty - p.y) * p.s * 2 }))
        .filter(p => p.p < .97)

      if (tick % 22 === 0 && Object.keys(nodes).length > 0) {
        const spk = (from, to, col) => {
          const na = nodes[from], nb = nodes[to]
          if (!na || !nb) return null
          const dx = nb.x - na.x, dy = nb.y - na.y, len = Math.hypot(dx, dy)
          return { x: na.x + dx / len * na.r, y: na.y + dy / len * na.r, tx: nb.x - dx / len * nb.r, ty: nb.y - dy / len * nb.r, col, p: 0, s: .026 + Math.random() * .012 }
        }
        if (!f) {
          next = [...next, spk('user', 'dns', C.ok), spk('dns', 'sw1', C.ok), st.sw1 && st.wiki ? spk('sw1', 'wiki', C.ok) : null].filter(Boolean)
        } else {
          next = [...next, spk('user', 'dns', C.ok), spk('dns', 'aws', C.pub), spk('aws', 'awswiki', C.pub)].filter(Boolean)
        }
      }
      return next
    })
  }, 100)

  const fault = (type) => {
    setSt(prev => {
      const next = { ...prev, [type]: !prev[type] }
      const f = isDR(next)
      const wasDR = isDR(prev)
      const msgs = {
        sw1:  'DS SW1 ping 실패 (192.168.99.11)',
        sw2:  'DS SW2 ping 실패 (192.168.99.12)',
        wiki: 'Wiki.js HTTP 실패 — 컨테이너 장애',
        pg:   'PostgreSQL TCP 실패 (:5432)',
      }
      if (!prev[type]) {
        addTL(C.err, `ALERT  ${msgs[type]}`)
        addToast(msgs[type], C.err, 'err')
        if (f && !wasDR) {
          setSwitchCount(c => c + 1)
          const start = Date.now()
          setFaultStart(start)
          faultStartRef.current = start
          setPrevDR(true)
          setFaultHistory(h => [...h, { time: now(), type: 'DR 전환', duration: null }])
          addTL(C.err, 'CRITICAL  온프레미스 장애 확정 → AWS DR 전환')
          addTL(C.pub, 'DNS  service.local → AWS DR 주소로 변경')
          addToast('AWS DR 전환 완료', C.pub, 'pub')
        }
      } else {
        addTL(C.ok, `INFO   ${type} 복구 확인`)
        addToast(`${type} 복구 확인`, C.ok, 'ok')
      }
      return next
    })
  }

  const restore = () => {
    const rto = faultStartRef.current ? Math.floor((Date.now() - faultStartRef.current) / 1000) : 0
    if (rto > 0) {
      setRtoHistory(h => [...h, rto].slice(-10))
      setFaultHistory(h => h.map((f, i) => i === h.length - 1 ? { ...f, duration: rto } : f))
    }
    setSt({ sw1: true, sw2: true, wiki: true, pg: true })
    setFaultStart(null)
    faultStartRef.current = null
    setElapsed(0)
    setPrevDR(false)
    addTL(C.ok, `INFO   전체 복구 완료 — RTO: ${fmtTime(rto)}`)
    addToast(`복구 완료 — RTO ${fmtTime(rto)}`, C.ok, 'ok')
  }

  const f = isDR()
  const totalFaultSec = rtoHistory.reduce((a, b) => a + b, 0)
  const uptimePct = uptimeSec > 0 ? Math.max(0, ((uptimeSec - totalFaultSec) / uptimeSec * 100)).toFixed(1) : '100.0'
  const avgRto = rtoHistory.length ? Math.round(rtoHistory.reduce((a, b) => a + b, 0) / rtoHistory.length) : 0
  const histData = faultHistory.slice(-8).map(h => ({ name: h.time, rto: h.duration || 0 }))

  return (
    <div className="app">
      <Toast toasts={toasts} />

      <div className="topbar">
        <div className="logo">
          <i className="ti ti-shield-check" style={{ fontSize: 16 }} aria-hidden="true" />
          DR 모니터링
          <CauseBadge st={st} />
        </div>
        <div className="topbar-right">
          <span className={`route-pill ${f ? 'pill-dr' : 'pill-ok'}`}>
            {f ? '● AWS DR 운영 중' : '● 온프레미스 정상'}
          </span>
          <Clock />
        </div>
      </div>

      {/* Prometheus 연결 상태 */}
      <div className={`prometheus-status ${promConnected ? 'connected' : 'disconnected'}`}>
        <i className={`ti ${promConnected ? 'ti-activity' : 'ti-wifi-off'}`} style={{ fontSize: 13 }} aria-hidden="true" />
        {promConnected
          ? 'Prometheus 연결됨 — 15초마다 실데이터 수집 중'
          : 'Prometheus 미연결 — 시뮬레이션 모드 (WireGuard 연결 후 자동 전환)'}
      </div>

      {/* 메트릭 */}
      <div className="metric-grid">
        <div className="mc">
          <div className="mc-label">DS SW 상태</div>
          <div className="mc-val" style={{ color: (!st.sw1 && !st.sw2) ? C.err : (!st.sw1 || !st.sw2) ? C.warn : C.ok }}>
            {(!st.sw1 && !st.sw2) ? '전체 장애' : (!st.sw1 || !st.sw2) ? '단독 장애' : '이중화'}
          </div>
          <div className="mc-sub">HSRP Active-Active</div>
        </div>
        <div className="mc">
          <div className="mc-label">Wiki.js</div>
          <div className="mc-val" style={{ color: st.wiki && (st.sw1 || st.sw2) ? C.ok : C.err }}>
            {st.wiki && (st.sw1 || st.sw2) ? '200 OK' : 'FAIL'}
          </div>
          <div className="mc-sub">HTTP health check</div>
        </div>
        <div className="mc">
          <div className="mc-label">PostgreSQL</div>
          <div className="mc-val" style={{ color: st.pg && (st.sw1 || st.sw2) ? C.ok : C.err }}>
            {st.pg && (st.sw1 || st.sw2) ? 'UP' : 'DOWN'}
          </div>
          <div className="mc-sub">TCP :5432</div>
        </div>
        <div className="mc">
          <div className="mc-label">업타임</div>
          <div className="mc-val" style={{ color: C.ok }}>{uptimePct}%</div>
          <div className="mc-sub">{fmtUptime(uptimeSec)}</div>
        </div>
      </div>

      {/* 인프라 맵 */}
      <div className="map-wrap">
        <canvas ref={canvasRef} height={290} />
      </div>

      {/* 장애 판단 */}
      <div className="judge">
        <span className="judge-label">장애 판단</span>
        <span className={`jtag ${st.sw1 ? 'ok' : 'ng'}`}>DS SW1 {st.sw1 ? 'UP' : 'DOWN'}</span>
        <span className={`jtag ${st.sw2 ? 'ok' : 'ng'}`}>DS SW2 {st.sw2 ? 'UP' : 'DOWN'}</span>
        <span className={`jtag ${st.wiki && (st.sw1 || st.sw2) ? 'ok' : 'ng'}`}>Wiki.js {st.wiki && (st.sw1 || st.sw2) ? 'OK' : 'FAIL'}</span>
        <span className={`jtag ${st.pg && (st.sw1 || st.sw2) ? 'ok' : 'ng'}`}>PostgreSQL {st.pg && (st.sw1 || st.sw2) ? 'OK' : 'FAIL'}</span>
        <span className={`jtag ${f ? 'ng' : (!st.sw1 || !st.sw2) ? 'warn' : 'ok'}`}>
          {f ? 'DR 전환 실행 중' : (!st.sw1 || !st.sw2) ? 'HSRP 처리 중' : 'DR 전환 불필요'}
        </span>
      </div>

      {/* RTO 통계 */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">현재 RTO</div>
          <div className="stat-val" style={{ color: faultStart ? C.err : C.ok }}>{fmtTime(elapsed)}</div>
          <div className="stat-sub">{faultStart ? '장애 경과 중' : '정상 운영'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">평균 RTO</div>
          <div className="stat-val">{rtoHistory.length ? fmtTime(avgRto) : '—'}</div>
          <div className="stat-sub">DR 전환 {switchCount}회</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">최단 / 최장</div>
          <div className="stat-val" style={{ fontSize: 16 }}>
            {rtoHistory.length ? `${fmtTime(Math.min(...rtoHistory))} / ${fmtTime(Math.max(...rtoHistory))}` : '—'}
          </div>
          <div className="stat-sub">복구 시간 범위</div>
        </div>
      </div>

      {/* 업타임 */}
      <div className="uptime-wrap">
        <div className="card-title">서비스 업타임</div>
        <div className="uptime-bar">
          <div className="uptime-fill" style={{ width: `${uptimePct}%` }} />
        </div>
        <div className="uptime-labels">
          <span>0%</span>
          <span style={{ color: C.ok }}>{uptimePct}% 가용</span>
          <span>100%</span>
        </div>
      </div>

      {/* 히스토리 그래프 */}
      <div className="history-card">
        <div className="history-title">
          <i className="ti ti-chart-bar" style={{ fontSize: 12, marginRight: 5 }} aria-hidden="true" />
          장애 히스토리 — RTO (초)
        </div>
        {histData.length > 0 ? (
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={histData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: 'var(--color-text-secondary)' }}
                itemStyle={{ color: C.pub }}
                formatter={v => [`${v}초`, 'RTO']}
              />
              <Bar dataKey="rto" radius={[4, 4, 0, 0]}>
                {histData.map((_, i) => <Cell key={i} fill={C.pub} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-history">
            <i className="ti ti-chart-bar" style={{ fontSize: 24, display: 'block', margin: '0 auto 6px' }} aria-hidden="true" />
            장애 시뮬레이션 후 복구하면 RTO 히스토리가 표시돼요
          </div>
        )}
      </div>

      {/* 하단 */}
      <div className="bottom">
        <div className="card">
          <div className="card-title">서버 상태</div>
          <div className="rto">
            <div className="rto-label">{faultStart ? '장애 경과 시간' : '정상 운영'}</div>
            <div className="rto-val" style={{ color: faultStart ? C.err : C.ok }}>{fmtTime(elapsed)}</div>
          </div>
          {[
            { key: 'sw1',  label: 'DS SW1',     val: st.sw1 ? 'UP — 192.168.56.1' : 'DOWN', ok: st.sw1 },
            { key: 'sw2',  label: 'DS SW2',      val: st.sw2 ? 'UP — 192.168.56.2' : 'DOWN', ok: st.sw2 },
            { key: 'wiki', label: 'Wiki.js',     val: st.wiki && (st.sw1 || st.sw2) ? '200 OK' : 'FAIL', ok: st.wiki && (st.sw1 || st.sw2) },
            { key: 'pg',   label: 'PostgreSQL',  val: st.pg && (st.sw1 || st.sw2) ? 'TCP OK :5432' : 'TCP FAIL', ok: st.pg && (st.sw1 || st.sw2) },
            { key: 'aws',  label: 'AWS DR',      val: f ? '활성 — DR 운영 중' : '대기 중', ok: f, pub: true },
          ].map(({ key, label, val, ok, pub }) => (
            <div className="sr" key={key}>
              <span className="sl">
                <span className="dot" style={{ background: pub ? (ok ? C.pub : 'rgba(128,128,128,0.3)') : (ok ? C.ok : C.err) }} />
                {label}
              </span>
              <span className="sv" style={{ color: pub ? (ok ? C.pub : 'var(--color-text-tertiary)') : (ok ? C.ok : C.err) }}>
                {val}
              </span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">이벤트 타임라인</div>
          {timeline.map((t, i) => (
            <div className="tl" key={i}>
              <span className="dot" style={{ background: t.color, marginTop: 5, flexShrink: 0 }} />
              <span className="tt">{t.time}</span>
              <span className="tm">{t.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 장애 주입 */}
      <div className="ctrl-row">
        <span className="ctrl-label">장애 시뮬레이션</span>
        {[
          { key: 'sw1',  label: 'DS SW1 장애' },
          { key: 'sw2',  label: 'DS SW2 장애' },
          { key: 'wiki', label: 'Wiki.js 장애' },
          { key: 'pg',   label: 'PostgreSQL 장애' },
        ].map(({ key, label }) => (
          <button key={key} className={`btn ${!st[key] ? 'on' : ''}`} onClick={() => fault(key)}>
            {label}
          </button>
        ))}
        <button className="btn restore" onClick={restore}>전체 복구</button>
      </div>
    </div>
  )
}