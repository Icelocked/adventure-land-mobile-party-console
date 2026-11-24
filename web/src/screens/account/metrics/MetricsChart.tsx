import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { linearTicks, logTicks, metricFormat, type GraphPoint, type GraphSeries } from '@/lib/metrics'
import { MetricsSelect, metricsControl } from './MetricsControls'
import { cn } from '@/lib/utils'

export interface BarCategory { label: string; total: number; rate: string; detailLabel?: string }
interface Props {
  title: string
  data: GraphPoint[]
  series: GraphSeries[]
  yLabel: string
  xFormat?: (value: number) => string
  type?: 'line' | 'bar'
  /** Horizontal bars, one row per category (the loot breakdown). */
  categoryAxis?: boolean
  logarithmic?: boolean
  logarithmicX?: boolean
  currentValue?: { amount: number | null; unit: string; label?: string; exact?: boolean }
  barCategories?: BarCategory[]
  onReset(): void
  resetDisabled?: boolean
  resetting?: boolean
  resetTitle?: string
  /** Shown in the options sheet. */
  controls?: ReactNode
  optionDetails?: ReactNode
  /** Shown on the card itself, above and below the chart. */
  inlineControls?: ReactNode
  footer?: ReactNode
  empty?: string
  references?: { value: number; label: string }[]
  yDomain?: [number, number]
}

const BAR = '#4b665a'
const valueText = (value: number | null | undefined) => (typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '-')
const timeLabel = (at: number, seconds: boolean) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) })

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(Math.max(200, element.clientWidth)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** The dashboard's metrics-chart.tsx card, drawn without a chart library. A tap selects a
 *  bar or the nearest time and shows its values in the readout line, in place of a hover
 *  tooltip. */
export function MetricsChart(props: Props) {
  const id = useId()
  const [scale, setScale] = useState<'linear' | 'logY' | 'logX'>('linear')
  const [hidden, setHidden] = useState<string[]>([])
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const active = props.series.filter((line) => !hidden.includes(line.key))
  const numbers = props.resetting ? [] : props.data.flatMap((point) => active.map((line) => point[line.key])).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const positive = numbers.filter((value) => value > 0)
  const hasNegative = numbers.some((value) => value < 0)
  const useLog = !!props.logarithmic && scale === 'logY' && !hasNegative && positive.length > 0
  const xValues = props.data.map((point) => point.at).filter((value) => value > 0)
  const useLogX = !!props.logarithmicX && scale === 'logX' && xValues.length > 0
  const visible = useLogX ? props.data.filter((point) => point.at > 0) : props.data
  const span = props.data.length > 1 ? props.data[props.data.length - 1].at - props.data[0].at : 0
  const spansDays = span >= 86_400_000
  const xText = (at: number) => (props.xFormat ? props.xFormat(at) : new Date(at).toLocaleString())
  const tickText = (at: number) => (props.xFormat ? props.xFormat(at) : spansDays ? new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : timeLabel(at, span < 300_000))

  // The y scale, shared by every chart shape.
  const maximum = numbers.reduce((high, value) => Math.max(high, value), 0)
  const minimum = numbers.reduce((low, value) => Math.min(low, value), 0)
  const yTicks = useLog
    ? logTicks(positive.reduce((low, value) => Math.min(low, value), Infinity), maximum)
    : props.yDomain ? linearTicks(props.yDomain[0], props.yDomain[1]).filter((tick) => tick <= props.yDomain![1]) : linearTicks(hasNegative ? minimum : 0, Math.max(props.type === 'bar' ? 1 : 0, maximum))
  const yLow = yTicks[0], yHigh = yTicks[yTicks.length - 1]
  const yFraction = (value: number) => {
    if (useLog) return value > 0 ? Math.max(0, (Math.log10(value) - Math.log10(yLow)) / (Math.log10(yHigh) - Math.log10(yLow))) : 0
    return yHigh > yLow ? (value - yLow) / (yHigh - yLow) : 0
  }

  const point = picked !== null ? visible[picked] : undefined
  const readout = point
    ? `${xText(point.at)}: ${active.map((line) => (active.length > 1 ? `${line.label} ` : '') + valueText(point[line.key])).join(', ')}`
    : ''

  let body: ReactNode
  if (!numbers.length)
    body = <div className="grid h-48 place-items-center text-sm text-muted-foreground">{props.resetting ? 'Resetting...' : props.empty || (active.length ? 'No data' : 'Select a series')}</div>
  else if (props.barCategories) {
    const line = active[0]
    body = (
      <div className="overflow-x-auto">
        <div style={{ minWidth: props.barCategories.length * 76 + 44 }}>
          {/* The top padding leaves room for the tallest bar's rate label. */}
          <div className="relative mt-6 h-44 pl-11">
            {yTicks.map((tick) => (
              <div key={tick} className="absolute right-0 left-0 border-t border-border/60" style={{ bottom: `${yFraction(tick) * 100}%` }}>
                <span className="absolute -top-2 left-0 w-10 text-right text-[10px] text-muted-foreground tabular-nums">{metricFormat(tick)}</span>
              </div>
            ))}
            <div className="relative flex h-full gap-2">
              {visible.map((row, index) => {
                const value = row[line.key]
                const height = typeof value === 'number' && value > 0 ? Math.max(1.5, yFraction(value) * 100) : 0
                const category = props.barCategories![index]
                return (
                  <button key={index} type="button" aria-label={category?.label ?? xText(row.at)} aria-pressed={picked === index} onClick={() => setPicked(picked === index ? null : index)}
                    className={cn('relative h-full w-[68px] shrink-0 rounded-sm', picked === index && 'bg-accent/40')}>
                    <span className="absolute inset-x-0 text-center text-xs font-medium text-emerald-300 tabular-nums" style={{ bottom: `calc(${height}% + 2px)` }}>{category?.rate}</span>
                    <span className="absolute bottom-0 left-1/2 w-9 -translate-x-1/2 rounded-t-sm" style={{ height: `${height}%`, background: line.color }} />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-2 pl-11 pt-1">
            {props.barCategories.map((category, index) => (
              <div key={index} className="flex w-[68px] shrink-0 flex-col items-center text-center text-[11px] leading-tight">
                <span className="w-full truncate text-muted-foreground" title={category.label}>{category.label}</span>
                <span className="w-full truncate font-medium tabular-nums">{`${category.detailLabel || 'Total'} ${category.detailLabel === 'Damage' ? metricFormat(category.total) : category.total.toLocaleString()}`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  } else if (props.categoryAxis) {
    const line = active[0]
    body = (
      <div className="max-h-80 space-y-0.5 overflow-y-auto">
        {visible.map((row, index) => {
          const value = row[line.key]
          return (
            <button key={index} type="button" aria-label={xText(row.at)} aria-pressed={picked === index} onClick={() => setPicked(picked === index ? null : index)}
              className={cn('grid w-full grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 rounded-sm px-1 py-0.5 text-left text-xs', picked === index && 'bg-accent/40')}>
              <span className="truncate text-muted-foreground">{xText(row.at)}</span>
              <span className="h-3"><span className="block h-full rounded-r-sm" style={{ width: `${typeof value === 'number' ? Math.max(1, yFraction(value) * 100) : 0}%`, background: line.color }} /></span>
              <span className="text-right tabular-nums">{valueText(value)}</span>
            </button>
          )
        })}
      </div>
    )
  } else body = <LinePlot {...{ points: visible, active, yTicks, yFraction, useLog, useLogX, tickText, picked, setPicked, references: props.references }} />

  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex min-h-9 items-center gap-2">
        <h3 id={id} className="min-w-0 flex-1 truncate font-medium">{props.title}</h3>
        {props.currentValue && (
          <div className="flex shrink-0 flex-col text-right leading-tight tabular-nums" aria-label={props.currentValue.label || `Current ${props.title}`}>
            <span className="font-semibold text-cyan-300">
              {props.resetting || props.currentValue.amount === null ? '-' : props.currentValue.exact ? props.currentValue.amount.toLocaleString() : metricFormat(props.currentValue.amount)}
            </span>
            <span className="text-xs text-muted-foreground">{props.currentValue.unit}</span>
          </div>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={`${props.title} options`} onClick={() => setOptionsOpen(true)}>
          <SlidersHorizontal className="size-4" />
        </Button>
      </div>
      {props.inlineControls && <div className="flex flex-wrap items-center gap-2">{props.inlineControls}</div>}
      <p className="text-[11px] text-muted-foreground">{props.yLabel}</p>
      <div className="min-w-0">{body}</div>
      <p role="status" className="min-h-4 truncate text-xs tabular-nums">{readout}</p>
      {props.footer}
      <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
          <SheetTitle>{props.title}</SheetTitle>
          {props.controls && <div className="flex flex-wrap items-center gap-2">{props.controls}</div>}
          {(props.logarithmic || props.logarithmicX) && (
            <MetricsSelect label="Graph scale" className="w-full max-w-none" value={useLog ? 'logY' : useLogX ? 'logX' : 'linear'}
              onChange={(value) => setScale(value === 'logX' ? 'logX' : value === 'logY' ? 'logY' : 'linear')}
              options={[
                { value: 'linear', label: 'Linear scale' },
                ...(props.logarithmicX ? [{ value: 'logX', label: 'Log X', disabled: !xValues.length }] : []),
                ...(props.logarithmic ? [{ value: 'logY', label: props.logarithmicX ? 'Log Y' : 'Log scale', disabled: hasNegative || !positive.length }] : []),
              ]} />
          )}
          {props.series.length > 1 && (
            <div className="max-h-64 overflow-auto border-t border-border pt-2" aria-label="Graph series">
              {props.series.map((line) => (
                <label key={line.key} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
                  <input type="checkbox" checked={!hidden.includes(line.key)} onChange={() => setHidden(hidden.includes(line.key) ? hidden.filter((key) => key !== line.key) : [...hidden, line.key])} />
                  <span className="size-2 shrink-0 rounded-full" style={{ background: line.color }} />
                  <span className="truncate">{line.label}</span>
                </label>
              ))}
            </div>
          )}
          {props.optionDetails}
          <div className="border-t border-border pt-3">
            <button className={cn(metricsControl, 'w-full')} title={props.resetTitle || 'Reset stored data'} disabled={props.resetDisabled || props.resetting} onClick={props.onReset}>
              {props.resetting ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {props.resetting ? 'Resetting...' : 'Reset graph'}
            </button>
            {props.resetTitle && <p className="mt-1 text-xs text-muted-foreground">{props.resetTitle}</p>}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}

function LinePlot({ points, active, yTicks, yFraction, useLog, useLogX, tickText, picked, setPicked, references }: {
  points: GraphPoint[]; active: GraphSeries[]; yTicks: number[]; yFraction(value: number): number; useLog: boolean; useLogX: boolean
  tickText(at: number): string; picked: number | null; setPicked(index: number | null): void
  references?: { value: number; label: string }[]
}) {
  const [ref, width] = useWidth()
  const height = 200, left = 44, right = 10, top = 8, bottom = 22
  const plotWidth = width - left - right, plotHeight = height - top - bottom
  const xs = points.map((point) => point.at)
  let xLow = Math.min(...xs), xHigh = Math.max(...xs)
  if (useLogX) {
    xLow = 10 ** Math.floor(Math.log10(xLow))
    xHigh = 10 ** Math.max(Math.log10(xLow) + 1, Math.ceil(Math.log10(xHigh)))
  } else if (xHigh === xLow) {
    xLow -= 1
    xHigh += 1
  }
  const xFraction = (at: number) => (useLogX ? (Math.log10(at) - Math.log10(xLow)) / (Math.log10(xHigh) - Math.log10(xLow)) : (at - xLow) / (xHigh - xLow))
  const x = (at: number) => left + xFraction(at) * plotWidth
  const y = (value: number) => top + (1 - yFraction(value)) * plotHeight
  const xTicks = useLogX ? logTicks(xLow, xHigh) : Array.from({ length: 4 }, (_, i) => xLow + ((xHigh - xLow) * i) / 3)
  // A log scale has no place for zero, so those values become gaps.
  const usable = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && (!useLog || value > 0)
  const path = (key: string) => {
    let d = '', open = false
    for (const point of points) {
      const value = point[key]
      if (!usable(value)) { open = false; continue }
      d += `${open ? 'L' : 'M'}${x(point.at).toFixed(1)},${y(value).toFixed(1)}`
      open = true
    }
    return d
  }
  const pick = (clientX: number, element: SVGRectElement) => {
    const box = element.getBoundingClientRect()
    const target = clientX - box.left + left
    let best = 0
    points.forEach((point, index) => { if (Math.abs(x(point.at) - target) < Math.abs(x(points[best].at) - target)) best = index })
    setPicked(picked === best ? null : best)
  }
  const chosen = picked !== null ? points[picked] : undefined
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} className="block select-none" role="img" aria-label="Chart">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={left - 4} y={y(tick) + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.6}>{metricFormat(tick)}</text>
          </g>
        ))}
        {xTicks.map((tick, index) => (
          <text key={index} x={x(tick)} y={height - 6} textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'} fontSize={10} fill="currentColor" fillOpacity={0.6}>{tickText(tick)}</text>
        ))}
        {/* Labels alternate ends so close lines such as 90% and 95% stay readable. */}
        {references?.map((reference, index) => (
          <g key={reference.value}>
            <line x1={left} x2={width - right} y1={y(reference.value)} y2={y(reference.value)} stroke={BAR} strokeDasharray="4 4" />
            <text x={index % 2 ? left + 4 : width - right} y={y(reference.value) - 3} textAnchor={index % 2 ? 'start' : 'end'} fontSize={10} fill="#94ad9e">{reference.label}</text>
          </g>
        ))}
        {active.map((line) => <path key={line.key} d={path(line.key)} fill="none" stroke={line.color} strokeWidth={2} />)}
        {/* A value with a gap on both sides draws no line segment, so it gets a dot. */}
        {active.map((line) => points.map((point, index) => {
          const value = point[line.key]
          const lone = usable(value) && !usable(points[index - 1]?.[line.key]) && !usable(points[index + 1]?.[line.key])
          return lone ? <circle key={`${line.key}:${index}`} cx={x(point.at)} cy={y(value)} r={2.5} fill={line.color} /> : null
        }))}
        {chosen && (
          <g>
            <line x1={x(chosen.at)} x2={x(chosen.at)} y1={top} y2={top + plotHeight} stroke="currentColor" strokeOpacity={0.4} />
            {active.map((line) => {
              const value = chosen[line.key]
              return usable(value) ? <circle key={line.key} cx={x(chosen.at)} cy={y(value)} r={3.5} fill={line.color} /> : null
            })}
          </g>
        )}
        <rect x={left} y={top} width={Math.max(0, plotWidth)} height={plotHeight} fill="transparent" onClick={(event) => pick(event.clientX, event.currentTarget)} />
      </svg>
    </div>
  )
}
