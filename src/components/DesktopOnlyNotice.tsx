import { Logo } from './Logo'

/** 可視寬度太小時蓋住整個畫面（此時不載入桌面與養殖場） */
export function DesktopOnlyNotice() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black px-8 text-center text-white"
      role="alert"
      data-testid="desktop-only"
    >
      <Logo size={64} className="text-white/90" />
      <div className="text-xl font-medium leading-relaxed">本網站僅支援電腦瀏覽，請使用電腦開啟</div>
      <div className="text-sm text-white/50">AEMC Lab Desktop</div>
    </div>
  )
}
