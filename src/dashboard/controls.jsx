// Controles reutilizables del dashboard.

export function SecLabel({ children }) {
  return <div className="sec-label">{children}</div>
}

export function Slider({ label, value, onChange, hint }) {
  return (
    <div className="ctrl">
      <div className="ctrl-top">
        <span>{label}</span>
        <span className="val">{value}</span>
      </div>
      <input type="range" min="1" max="5" value={value}
        onChange={e => onChange(Number(e.target.value))} />
      <div className="hint">{hint}</div>
    </div>
  )
}

export function NumInput({ label, value, onChange, unit, step = 1000, accent }) {
  return (
    <div className="ctrl">
      <div className="ctrl-label">{label}</div>
      <input className="num" type="number" value={value} step={step}
        style={accent ? { color: accent } : undefined}
        onChange={e => onChange(Number(e.target.value))} />
      <div className="hint">{unit}</div>
    </div>
  )
}
