/**
 * The meter as a circle: one dot per eighth on the outside, a gap between groups, the sounding step
 * glowing. Inside, one ring per drum with a cell for every sixteenth (click to cycle off, hit, accent).
 */
export interface Ring { id: string; color: string; cells: number[]; muted: boolean }

export function Wheel({ groups, sig, current, countIn, rings = [], onCell, size = 600 }: {
  groups: number[]; sig: string; current: number | null; countIn: boolean; rings?: Ring[]
  onCell?: (ring: string, cell: number) => void; size?: number
}): React.JSX.Element {
  const C = size / 2
  const R = size * 0.44
  const n = groups.reduce((a, b) => a + b, 0)
  const gap = 0.6
  const units = n + groups.length * gap
  const uOf: number[] = []
  const starts: number[] = []
  let u = 0, s = 0
  for (const g of groups) {
    starts.push(s)
    for (let i = 0; i < g; i++) { uOf.push(u); u += 1 }
    u += gap
    s += g
  }
  const angle = (uu: number): number => -90 + (360 * (uu + 0.3)) / units
  const pos = (r: number, a: number): [number, number] => [C + r * Math.cos((a * Math.PI) / 180), C + r * Math.sin((a * Math.PI) / 180)]
  const ringR = (i: number): number => size * (0.37 - i * 0.058)
  return (
    <svg className="wheel" viewBox={`0 0 ${size} ${size}`} role="group" aria-label={`Meter ${groups.join('+')}`}>
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--seam)" strokeWidth={1} />
      {rings.map((rg, ri) => <circle key={rg.id} cx={C} cy={C} r={ringR(ri)} fill="none" stroke="#33203A" strokeWidth={1} />)}
      {groups.map((g, gi) => {
        const mid = starts[gi] + (g - 1) / 2
        const a = angle((uOf[Math.floor(mid)] + uOf[Math.ceil(mid)]) / 2)
        const [x, y] = pos(R + size * 0.04, a)
        return <text key={gi} x={x} y={y} className="wheel-group" textAnchor="middle" dominantBaseline="middle">{g}</text>
      })}
      {uOf.map((uu, i) => {
        const [x, y] = pos(R, angle(uu))
        const head = starts.includes(i)
        const on = current === i
        const r = on ? size * 0.026 : head ? size * 0.017 : size * 0.011
        return (
          <circle key={i} cx={x} cy={y} r={r}
            fill={on ? (countIn ? 'var(--brass)' : 'var(--varnish)') : head ? 'var(--rosin)' : 'transparent'}
            stroke={on ? 'none' : head ? 'var(--rosin)' : 'var(--mute)'} strokeWidth={1.5}
            style={on ? { filter: `drop-shadow(0 0 ${size * 0.02}px ${countIn ? 'var(--brass)' : 'var(--varnish)'})` } : undefined} />
        )
      })}
      {rings.map((rg, ri) => rg.cells.map((v, j) => {
        const eighth = Math.floor(j / 2)
        const [x, y] = pos(ringR(ri), angle(uOf[eighth] + (j % 2) * 0.5))
        const now = current === eighth && v > 0 && !countIn
        const r = v === 2 ? size * 0.017 : v === 1 ? size * 0.012 : j % 2 ? size * 0.004 : size * 0.007
        return (
          <circle key={`${rg.id}${j}`} cx={x} cy={y} r={r} className="cell" role="button" tabIndex={-1}
            aria-label={`${rg.id} sixteenth ${j + 1}: ${v === 2 ? 'accent' : v === 1 ? 'hit' : 'off'}`}
            fill={v ? rg.color : 'transparent'} stroke={v ? rg.color : '#5C3E5A'} strokeWidth={1.2}
            opacity={rg.muted ? 0.3 : 1}
            style={now ? { filter: `drop-shadow(0 0 ${size * 0.018}px ${rg.color})` } : undefined}
            onClick={() => onCell?.(rg.id, j)} />
        )
      }))}
      <text x={C} y={C - size * 0.005} className="wheel-sig" textAnchor="middle" dominantBaseline="middle">{sig.split('/')[0]}<tspan className="wheel-den">/{sig.split('/')[1]}</tspan></text>
      <text x={C} y={C + size * 0.06} className="wheel-sub" textAnchor="middle">{countIn ? 'count-in' : groups.join(' + ')}</text>
    </svg>
  )
}
