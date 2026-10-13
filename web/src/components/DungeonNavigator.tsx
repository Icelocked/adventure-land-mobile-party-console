import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useDungeons } from '@/data/useDailyDungeon'

/** The dungeon controls (DungeonPanel) live only on the Party screen, and a
 *  Cave run waits there for a destination. When a dungeon starts, this jumps
 *  to the Party screen once; while one runs, every other screen shows a bar
 *  that leads back. Mounted once inside the router. */
export function DungeonNavigator() {
  const dungeon = useDungeons()
  const location = useLocation()
  const navigate = useNavigate()
  const phase = dungeon.data?.state.phase
  const running = !!phase && !['idle', 'held'].includes(phase)
  // Null until the first response, so opening the app mid-run never redirects.
  const wasRunning = useRef<boolean | null>(null)
  useEffect(() => {
    if (!dungeon.data) return
    if (wasRunning.current === false && running && location.pathname !== '/') navigate('/')
    wasRunning.current = running
  }, [dungeon.data, running, location.pathname, navigate])
  if (!running || location.pathname === '/') return null
  return (
    <div className="sticky top-0 z-[80] flex items-center justify-between gap-2 border-b border-orange-600 bg-orange-950 px-3 py-2 text-sm text-orange-100">
      <span>Cave of Many Dreams is running.</span>
      <Button size="xs" variant="outline" onClick={() => navigate('/')}>
        Dungeon controls
      </Button>
    </div>
  )
}
