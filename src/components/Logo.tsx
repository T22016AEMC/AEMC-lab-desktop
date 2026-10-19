/** 桌面 Logo（原子軌道圖形），顏色跟隨 currentColor */
export function Logo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={26}
      aria-hidden
    >
      <ellipse cx="256" cy="256" rx="200" ry="82" />
      <ellipse cx="256" cy="256" rx="200" ry="82" transform="rotate(60 256 256)" />
      <ellipse cx="256" cy="256" rx="200" ry="82" transform="rotate(120 256 256)" />
      <circle cx="256" cy="256" r="38" fill="currentColor" stroke="none" />
    </svg>
  )
}
