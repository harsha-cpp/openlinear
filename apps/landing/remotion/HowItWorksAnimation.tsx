import React from "react"
import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion"

// ─── Canvas ────────────────────────────────────────────────────────────────
const W = 1920
const H = 1080
const FPS = 30

// ─── Exact product palette ──────────────────────────────────────────────────
const C = {
  boardBg: "#111111",
  cardBg: "rgba(255,255,255,0.03)",
  cardBorder: "rgba(255,255,255,0.08)",
  dialogBg: "#1a1a1a",
  dialogBorder: "#2a2a2a",
  colDivider: "rgba(255,255,255,0.06)",
  colHeaderBg: "rgba(255,255,255,0.02)",
  colBorderB: "rgba(255,255,255,0.04)",
  textPrimary: "#f5f5f5",
  textSecondary: "#a0a0a0",
  textTertiary: "#71717a",
  placeholder: "#6a6a6a",
  colHeader: "#a1a1aa",
  blue: "#3b82f6",
  green: "#22c55e",
  amber: "#f59e0b",
  purple: "#a855f7",
  statusTodo: "#a0a0a0",
  statusInProgress: "#f59e0b",
  statusDone: "#22c55e",
}

const TASK_TITLE = "Add user authentication"
const TASK_DESC = "Implement OAuth2 login with GitHub"
const TASK_ID = "OL-142"

// ─── Layout constants ───────────────────────────────────────────────────────
const SB_W = 220
const CONTENT_X = SB_W
const CONTENT_W = W - SB_W
const TOPBAR_H = 40
const CFG_H = 32
const COL_COUNT = 3
const COL_W = Math.floor(CONTENT_W / COL_COUNT)
const COL_Y = TOPBAR_H + CFG_H
const COL_H = H - COL_Y
const COL_HEADER_H = 44

const CARD_W = COL_W - 24
const CARD_H = 88
const CARD_X_TODO = CONTENT_X + 12
const CARD_X_INPROG = CONTENT_X + COL_W + 12
const CARD_X_DONE = CONTENT_X + COL_W * 2 + 12
const CARD_Y_BASE = COL_Y + COL_HEADER_H + 12

const DLG_W = 520
const DLG_H = 236
const DLG_X = (W - DLG_W) / 2
const DLG_Y = (H - DLG_H) / 2

function ramp(frame: number, a: number, b: number) {
  return interpolate(frame, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
}

function easeOut(frame: number, a: number, b: number) {
  const t = ramp(frame, a, b)
  return 1 - (1 - t) * (1 - t)
}

function Sidebar({ opacity }: { opacity: number }) {
  const navItems = [
    { label: "Home", active: false },
    { label: "My Issues", active: true },
    { label: "Inbox", active: false },
    { label: "Archived", active: false },
  ]

  return (
    <g opacity={opacity}>
      <rect x={0} y={0} width={SB_W} height={H} fill="#0e0e0e" />
      <line x1={SB_W} y1={0} x2={SB_W} y2={H} stroke={C.colDivider} strokeWidth={1} />
      <rect x={0} y={0} width={SB_W} height={TOPBAR_H} fill="rgba(255,255,255,0.01)" />
      <line x1={0} y1={TOPBAR_H} x2={SB_W} y2={TOPBAR_H} stroke={C.colBorderB} strokeWidth={1} />
      <circle cx={18} cy={TOPBAR_H / 2} r={7} fill={C.blue} />
      <text x={32} y={TOPBAR_H / 2 + 5} fill={C.textPrimary} fontSize={12} fontWeight={600} fontFamily="system-ui,-apple-system,sans-serif">
        OpenLinear
      </text>
      {navItems.map((item, i) => (
        <g key={item.label}>
          {item.active && (
            <rect x={0} y={TOPBAR_H + 8 + i * 32} width={SB_W} height={26} fill="rgba(255,255,255,0.05)" />
          )}
          <text x={16} y={TOPBAR_H + 25 + i * 32}
            fill={item.active ? C.textPrimary : C.textTertiary}
            fontSize={12} fontFamily="system-ui,-apple-system,sans-serif">
            {item.label}
          </text>
        </g>
      ))}
    </g>
  )
}

function TopBar({ opacity }: { opacity: number }) {
  return (
    <g opacity={opacity}>
      <rect x={CONTENT_X} y={0} width={CONTENT_W} height={TOPBAR_H} fill="#111111" />
      <line x1={CONTENT_X} y1={TOPBAR_H} x2={W} y2={TOPBAR_H} stroke={C.colBorderB} strokeWidth={1} />
      <text x={CONTENT_X + 16} y={TOPBAR_H / 2 + 5} fill={C.textPrimary} fontSize={13} fontWeight={500} fontFamily="system-ui,-apple-system,sans-serif">
        Board
      </text>
    </g>
  )
}

function ConfigStrip({ opacity }: { opacity: number }) {
  const cfgItems = [
    { label: "SOURCE", value: "kaizen403/openlinear" },
    { label: "BRANCH", value: "main" },
    { label: "SCOPE", value: "3 issues" },
    { label: "WORKFLOW", value: "Idle" },
  ]
  const itemW = CONTENT_W / cfgItems.length

  return (
    <g opacity={opacity}>
      <rect x={CONTENT_X} y={TOPBAR_H} width={CONTENT_W} height={CFG_H} fill="rgba(255,255,255,0.01)" />
      <line x1={CONTENT_X} y1={TOPBAR_H + CFG_H} x2={W} y2={TOPBAR_H + CFG_H} stroke={C.colBorderB} strokeWidth={1} />
      {cfgItems.map((item, i) => {
        const ix = CONTENT_X + i * itemW
        return (
          <g key={item.label}>
            {i > 0 && (
              <line x1={ix} y1={TOPBAR_H} x2={ix} y2={TOPBAR_H + CFG_H} stroke={C.colDivider} strokeWidth={1} />
            )}
            <text x={ix + 10} y={TOPBAR_H + 11} fill={C.textTertiary} fontSize={8} letterSpacing={1.2} fontFamily="system-ui,-apple-system,sans-serif">
              {item.label}
            </text>
            <text x={ix + 10} y={TOPBAR_H + 24} fill={C.textSecondary} fontSize={10} fontWeight={500} fontFamily="system-ui,-apple-system,sans-serif">
              {item.value}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function ColHeader({ x, title, count, plusHighlight = 0 }: {
  x: number; title: string; count: number; plusHighlight?: number
}) {
  const titleLen = title.length
  const badgeX = x + 14 + titleLen * 6.5 + 8
  const plusX = x + COL_W - 25

  return (
    <g>
      <rect x={x} y={COL_Y} width={COL_W} height={COL_HEADER_H} fill={C.colHeaderBg} />
      <line x1={x} y1={COL_Y + COL_HEADER_H} x2={x + COL_W} y2={COL_Y + COL_HEADER_H} stroke={C.colBorderB} strokeWidth={1} />
      <text x={x + 14} y={COL_Y + 26} fill={C.colHeader} fontSize={10} fontWeight={500} letterSpacing={1.4} fontFamily="system-ui,-apple-system,sans-serif">
        {title.toUpperCase()}
      </text>
      <rect x={badgeX} y={COL_Y + 14} width={22} height={16} rx={4}
        fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <text x={badgeX + 11} y={COL_Y + 25} fill={C.colHeader} fontSize={10} fontWeight={500} textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif">
        {count}
      </text>
      <rect x={plusX - 11} y={COL_Y + 12} width={22} height={22} rx={5}
        fill={plusHighlight > 0.01 ? `rgba(255,255,255,${0.04 + plusHighlight * 0.08})` : "transparent"} />
      <text x={plusX} y={COL_Y + 27} fill={plusHighlight > 0.01 ? `rgba(255,255,255,${0.5 + plusHighlight * 0.45})` : C.textTertiary}
        fontSize={16} textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif">
        +
      </text>
    </g>
  )
}

function EmptyState({ x }: { x: number }) {
  const cx = x + COL_W / 2
  const cy = COL_Y + COL_HEADER_H + 72

  return (
    <g>
      <circle cx={cx} cy={cy} r={20} fill="rgba(255,255,255,0.04)" />
      <text x={cx} y={cy + 7} textAnchor="middle" fill={C.textTertiary} fontSize={16} fontFamily="system-ui,-apple-system,sans-serif">+</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fill={C.textTertiary} fontSize={12} fontFamily="system-ui,-apple-system,sans-serif">Add task</text>
    </g>
  )
}

type ProgressState = "cloning" | "executing" | "creating_pr" | "done" | null

function TaskCard({
  x, y, opacity = 1, title, identifier, labelText, labelColor,
  showExecuteBtn = false, executeHighlight = 0,
  progressState = null, showViewPR = false, isDone = false,
}: {
  x: number; y: number; opacity?: number
  title: string; identifier: string
  labelText?: string; labelColor?: string
  showExecuteBtn?: boolean; executeHighlight?: number
  progressState?: ProgressState; showViewPR?: boolean; isDone?: boolean
}) {
  const progMap = {
    cloning:      { text: "Cloning...",      color: "#60a5fa" },
    executing:    { text: "Executing...",     color: C.blue },
    creating_pr:  { text: "Creating PR...",   color: "#c084fc" },
    done:         { text: "Done \u2713",       color: C.green },
  }
  const prog = progressState ? progMap[progressState] : null
  const extraH = (prog || showViewPR) ? 28 : 0
  const cardH = CARD_H + extraH

  return (
    <g opacity={opacity}>
      <rect x={x + 1} y={y + 2} width={CARD_W} height={cardH} rx={11} fill="rgba(0,0,0,0.25)" />
      <rect x={x} y={y} width={CARD_W} height={cardH} rx={11}
        fill={isDone ? "rgba(34,197,94,0.04)" : C.cardBg}
        stroke={isDone ? "rgba(34,197,94,0.12)" : C.cardBorder}
        strokeWidth={1} />
      <rect x={x + 1} y={y + 1} width={CARD_W - 2} height={1} fill="rgba(255,255,255,0.04)" />
      <text x={x + 12} y={y + 22} fill={C.textPrimary} fontSize={12} fontWeight={300} fontFamily="system-ui,-apple-system,sans-serif">
        {title.length > 32 ? title.slice(0, 32) + "\u2026" : title}
      </text>
      {labelText && labelColor && (
        <g>
          <rect x={x + 12} y={y + 30} width={labelText.length * 5.8 + 14} height={16} rx={4}
            fill={`${labelColor}20`} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
          <text x={x + 12 + (labelText.length * 5.8 + 14) / 2} y={y + 41}
            textAnchor="middle" fill={labelColor} fontSize={9} fontWeight={500} fontFamily="system-ui,-apple-system,sans-serif">
            {labelText}
          </text>
        </g>
      )}
      {prog && (
        <g>
          <rect x={x + 12} y={y + 52} width={CARD_W - 24} height={22} rx={4} fill="rgba(255,255,255,0.03)" />
          <circle cx={x + 22} cy={y + 63} r={4} fill="none" stroke={prog.color} strokeWidth={1.5} strokeDasharray="10 5" />
          <text x={x + 33} y={y + 67} fill={C.textSecondary} fontSize={10} fontFamily="system-ui,-apple-system,sans-serif">
            {prog.text}
          </text>
        </g>
      )}
      {showViewPR && (
        <text x={x + 12} y={y + (prog ? 92 : 64)} fill={C.blue} fontSize={10} fontFamily="system-ui,-apple-system,sans-serif">
          \u2387 View PR
        </text>
      )}
      <text x={x + 12} y={y + cardH - 12} fill={C.textTertiary} fontSize={9} fontFamily="ui-monospace,SFMono-Regular,monospace">
        {identifier}
      </text>
      {showExecuteBtn && (
        <g>
          <rect x={x + CARD_W - 34} y={y + cardH - 26} width={22} height={22} rx={5}
            fill={`rgba(59,130,246,${0.10 + executeHighlight * 0.15})`}
            stroke={`rgba(59,130,246,${0.30 + executeHighlight * 0.45})`}
            strokeWidth={1} />
          <polygon
            points={`${x + CARD_W - 27},${y + cardH - 22} ${x + CARD_W - 27},${y + cardH - 10} ${x + CARD_W - 17},${y + cardH - 16}`}
            fill={C.blue}
          />
        </g>
      )}
    </g>
  )
}

function TaskFormDialog({ scale, opacity, titleChars, descChars, buttonPulse = 0 }: {
  scale: number; opacity: number
  titleChars: number; descChars: number; buttonPulse?: number
}) {
  const titleText = TASK_TITLE.slice(0, titleChars)
  const descText = TASK_DESC.slice(0, descChars)
  const showCursorTitle = titleChars < TASK_TITLE.length && titleChars > 0
  const showCursorDesc = !showCursorTitle && descChars < TASK_DESC.length && descChars > 0
  const cx = DLG_X + DLG_W / 2
  const cy = DLG_Y + DLG_H / 2

  return (
    <g transform={`translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})`} opacity={opacity}>
      <rect x={DLG_X + 4} y={DLG_Y + 8} width={DLG_W} height={DLG_H} rx={12} fill="rgba(0,0,0,0.5)" filter="url(#dlg-shadow)" />
      <rect x={DLG_X} y={DLG_Y} width={DLG_W} height={DLG_H} rx={12} fill={C.dialogBg} stroke={C.dialogBorder} strokeWidth={1} />
      <rect x={DLG_X + 0.5} y={DLG_Y + 0.5} width={DLG_W - 1} height={DLG_H - 1} rx={11.5} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
      <text x={DLG_X + 20} y={DLG_Y + 34}
        fill={titleChars === 0 ? C.placeholder : C.textPrimary}
        fontSize={15} fontWeight={600} fontFamily="system-ui,-apple-system,sans-serif">
        {titleChars === 0 ? "Issue title" : titleText}
        {showCursorTitle && <tspan fill={C.blue}>|</tspan>}
      </text>
      <text x={DLG_X + 20} y={DLG_Y + 58}
        fill={descChars === 0 ? C.placeholder : C.textSecondary}
        fontSize={12} fontFamily="system-ui,-apple-system,sans-serif">
        {descChars === 0 ? "Add description..." : descText}
        {showCursorDesc && <tspan fill={C.blue}>|</tspan>}
      </text>
      <line x1={DLG_X} y1={DLG_Y + 74} x2={DLG_X + DLG_W} y2={DLG_Y + 74} stroke={C.dialogBorder} strokeWidth={1} />
      <circle cx={DLG_X + 26} cy={DLG_Y + 94} r={4} fill={C.statusTodo} opacity={0.8} />
      <text x={DLG_X + 36} y={DLG_Y + 98} fill={C.textSecondary} fontSize={11} fontFamily="system-ui,-apple-system,sans-serif">Todo</text>
      <text x={DLG_X + 90} y={DLG_Y + 98} fill={C.textSecondary} fontSize={11} fontFamily="system-ui,-apple-system,sans-serif">Labels</text>
      <text x={DLG_X + 148} y={DLG_Y + 98} fill={C.textSecondary} fontSize={11} fontFamily="system-ui,-apple-system,sans-serif">Due date</text>
      <line x1={DLG_X} y1={DLG_Y + 112} x2={DLG_X + DLG_W} y2={DLG_Y + 112} stroke={C.dialogBorder} strokeWidth={1} />
      <text x={DLG_X + DLG_W - 166} y={DLG_Y + DLG_H - 24} textAnchor="middle" fill={C.textSecondary} fontSize={11} fontFamily="system-ui,-apple-system,sans-serif">
        Cancel
      </text>
      <text x={DLG_X + DLG_W - 110} y={DLG_Y + DLG_H - 24} fill={C.placeholder} fontSize={9} fontFamily="system-ui,-apple-system,sans-serif">
        \u2318 Enter
      </text>
      <rect x={DLG_X + DLG_W - 106} y={DLG_Y + DLG_H - 42} width={88} height={26} rx={6}
        fill={`rgba(59,130,246,${0.9 + buttonPulse * 0.1})`}
        stroke={buttonPulse > 0.05 ? `rgba(59,130,246,0.8)` : "transparent"}
        strokeWidth={buttonPulse > 0.05 ? 2 : 0} />
      <text x={DLG_X + DLG_W - 62} y={DLG_Y + DLG_H - 25} textAnchor="middle" fill="#ffffff" fontSize={11} fontWeight={500} fontFamily="system-ui,-apple-system,sans-serif">
        Create Task
      </text>
    </g>
  )
}

function ArrowCursor({ x, y, opacity }: { x: number; y: number; opacity: number }) {
  return (
    <g opacity={opacity} transform={`translate(${x},${y})`}>
      <polygon points="0,0 0,16 4,12 7,18 9,17 6,11 12,11"
        fill="white" stroke="rgba(0,0,0,0.7)" strokeWidth={1.2} strokeLinejoin="round" />
    </g>
  )
}

function ColumnDividers() {
  return (
    <g>
      <line x1={CONTENT_X + COL_W} y1={COL_Y} x2={CONTENT_X + COL_W} y2={H} stroke={C.colDivider} strokeWidth={1} />
      <line x1={CONTENT_X + COL_W * 2} y1={COL_Y} x2={CONTENT_X + COL_W * 2} y2={H} stroke={C.colDivider} strokeWidth={1} />
    </g>
  )
}

export const HowItWorksAnimation: React.FC = () => {
  const frame = useCurrentFrame()

  const boardFadeIn = ramp(frame, 0, 30)
  const fadeOut = interpolate(frame, [390, 440], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const globalOpacity = Math.min(boardFadeIn, fadeOut)

  const plusHighlightTodo = interpolate(frame, [35, 45, 110, 120], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const plusBtnX = CONTENT_X + COL_W - 25
  const plusBtnY = COL_Y + 23
  const cursorX = interpolate(frame, [20, 42], [W / 2, plusBtnX], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const cursorY = interpolate(frame, [20, 42], [H / 2 + 100, plusBtnY], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const cursorOpacity1 = interpolate(frame, [15, 25, 43, 48], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const dialogSpring = spring({
    frame: Math.max(0, frame - 45),
    fps: FPS,
    config: { damping: 18, stiffness: 200, mass: 0.7 },
    durationInFrames: 25,
  })
  const dialogScale = interpolate(dialogSpring, [0, 1], [0.95, 1])
  const dialogOpacity = interpolate(frame, [45, 58, 110, 125], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const titleChars = Math.floor(
    interpolate(frame, [68, 100], [0, TASK_TITLE.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  )
  const descChars = Math.floor(
    interpolate(frame, [100, 112], [0, TASK_DESC.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  )

  const buttonPulse = interpolate(frame, [110, 115, 120, 125], [0, 1, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const cardSlideSpring = spring({
    frame: Math.max(0, frame - 125),
    fps: FPS,
    config: { damping: 20, stiffness: 180, mass: 0.8 },
    durationInFrames: 30,
  })
  const cardEntryY = interpolate(cardSlideSpring, [0, 1], [COL_Y, CARD_Y_BASE])
  const cardInTodoOpacity = interpolate(frame, [125, 138], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const slideToInProgT = easeOut(frame, 155, 180)
  const cardPhase1X = frame < 155 ? CARD_X_TODO : interpolate(slideToInProgT, [0, 1], [CARD_X_TODO, CARD_X_INPROG])
  const cardPhase1Y = frame < 125 ? CARD_Y_BASE : cardEntryY

  const showExecuteBtn = frame >= 180
  const executeHighlight = interpolate(frame, [195, 205, 215, 218], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const execBtnX = CARD_X_INPROG + CARD_W - 23
  const execBtnY = CARD_Y_BASE + CARD_H - 14
  const cursor2X = interpolate(frame, [182, 200], [W / 2 + 200, execBtnX], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const cursor2Y = interpolate(frame, [182, 200], [H / 2 + 50, execBtnY], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const cursor2Opacity = interpolate(frame, [180, 190, 213, 220], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const clickPress = interpolate(frame, [200, 206, 210, 215], [1, 0.88, 0.95, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const progressState: ProgressState =
    frame >= 215 && frame < 232 ? "cloning" :
    frame >= 232 && frame < 252 ? "executing" :
    frame >= 252 && frame < 262 ? "creating_pr" :
    frame >= 262 ? "done" :
    null

  const slideToDoneT = easeOut(frame, 262, 290)
  const finalCardX = frame >= 262
    ? interpolate(slideToDoneT, [0, 1], [CARD_X_INPROG, CARD_X_DONE])
    : cardPhase1X

  const showViewPR = frame >= 295

  const todoCount = frame >= 125 && frame < 155 ? 1 : 0
  const inProgCount = frame >= 155 && frame < 262 ? 1 : 0
  const doneCount = frame >= 262 ? 1 : 0

  const cardIsInTodo = frame >= 125 && frame < 155
  const cardIsInInProg = frame >= 155 && frame < 262
  const cardIsInDone = frame >= 262
  const cardVisible = frame >= 125

  const cardTransformOriginX = finalCardX + CARD_W / 2
  const cardTransformOriginY = CARD_Y_BASE + CARD_H / 2

  return (
    <AbsoluteFill style={{ backgroundColor: C.boardBg, opacity: globalOpacity }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <filter id="dlg-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="16" />
          </filter>
          {[0, 1, 2].map((i) => (
            <linearGradient key={`cg-def-${i}`} id={`col-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.015)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
          ))}
        </defs>

        <rect x={0} y={0} width={W} height={H} fill={C.boardBg} />

        {[0, 1, 2].map((i) => (
          <rect key={`col-bg-${i}`} x={CONTENT_X + i * COL_W} y={COL_Y} width={COL_W} height={COL_H} fill={`url(#col-grad-${i})`} />
        ))}

        <Sidebar opacity={1} />
        <TopBar opacity={1} />
        <ConfigStrip opacity={1} />
        <ColumnDividers />

        <ColHeader x={CONTENT_X} title="Todo" count={todoCount} plusHighlight={plusHighlightTodo} />
        <ColHeader x={CONTENT_X + COL_W} title="In Progress" count={inProgCount} />
        <ColHeader x={CONTENT_X + COL_W * 2} title="Done" count={doneCount} />

        {!cardIsInTodo && <EmptyState x={CONTENT_X} />}
        {!cardIsInInProg && <EmptyState x={CONTENT_X + COL_W} />}
        {!cardIsInDone && <EmptyState x={CONTENT_X + COL_W * 2} />}

        {cardVisible && (
          <g transform={`translate(${cardTransformOriginX},${cardTransformOriginY}) scale(${frame >= 200 && frame < 215 ? clickPress : 1}) translate(${-cardTransformOriginX},${-cardTransformOriginY})`}>
            <TaskCard
              x={finalCardX}
              y={cardPhase1Y}
              opacity={cardInTodoOpacity}
              title={TASK_TITLE}
              identifier={TASK_ID}
              labelText="frontend"
              labelColor={C.blue}
              showExecuteBtn={showExecuteBtn && frame < 262}
              executeHighlight={executeHighlight}
              progressState={progressState}
              showViewPR={showViewPR && frame >= 262}
              isDone={frame >= 262}
            />
          </g>
        )}

        {frame >= 45 && frame <= 128 && (
          <TaskFormDialog
            scale={dialogScale}
            opacity={dialogOpacity}
            titleChars={titleChars}
            descChars={descChars}
            buttonPulse={buttonPulse}
          />
        )}

        <ArrowCursor x={cursorX} y={cursorY} opacity={cursorOpacity1} />
        <ArrowCursor x={cursor2X} y={cursor2Y} opacity={cursor2Opacity} />
      </svg>
    </AbsoluteFill>
  )
}

export default HowItWorksAnimation
