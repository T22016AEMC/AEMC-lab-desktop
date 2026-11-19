import { gameApps } from '../config/registry'
import { useWindowStore } from '../store/windowStore'
import { AppIcon } from './AppIcon'

const GAME_HALL_ID = 'game-hall'
const ICON_SIZE = 64

/**
 * 遊戲館：鐘塔的門打開之後的視窗（用一般的桌面視窗）。5 個內建小遊戲只放在這裡，
 * 不在啟動台。點圖示開啟遊戲視窗，遊戲館視窗自己關掉。
 */
export default function GameHall() {
  const openApp = useWindowStore((s) => s.openApp)
  const closeWindow = useWindowStore((s) => s.closeWindow)

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto bg-gradient-to-b from-[#3a2a1c] to-[#241a12] px-5 py-5 text-[#fff3d0]">
      <div className="mb-4 text-center text-sm font-bold tracking-widest text-[#ffd98a]">遊戲館</div>
      <div className="grid w-full max-w-md grid-cols-3 gap-x-3 gap-y-5" data-testid="game-hall">
        {gameApps.map((g) => (
          <button
            key={g.id}
            type="button"
            data-app-id={g.id}
            onClick={() => {
              openApp(g)
              closeWindow(GAME_HALL_ID)
            }}
            className="flex flex-col items-center gap-2 rounded-xl p-2 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
          >
            <AppIcon app={g} size={ICON_SIZE} />
            <span className="max-w-full truncate text-sm [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{g.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
