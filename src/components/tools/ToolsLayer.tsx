import { useUIStore } from '../../store/uiStore'
import { CalculatorDialog } from './CalculatorDialog'
import { NotesDialog } from './NotesDialog'
import { TimerDialog } from './TimerDialog'

/** 目前開著的工具視窗（一次一個）。計算機的狀態在視窗裡（關閉就清空）；碼表與倒數的狀態在 timerStore（關閉後繼續跑） */
export function ToolsLayer() {
  const tool = useUIStore((s) => s.toolOpen)
  if (tool === 'calc') return <CalculatorDialog />
  if (tool === 'timer') return <TimerDialog />
  if (tool === 'notes') return <NotesDialog />
  return null
}
