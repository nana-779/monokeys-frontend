'use client'

import { useState } from 'react'
import type { KeycapSpecMeta } from '@/features/products/custom-keycap-types'

interface KeyboardMountPreviewProps {
  meta: KeycapSpecMeta
  previewDataUrl: string | null
  backgroundColor: string
}

type CaseFinish = {
  id: 'obsidian' | 'silver' | 'cream'
  label: string
  frameClass: string
  keycapBg: string
  keycapText: string
}

const CASE_FINISHES: CaseFinish[] = [
  {
    id: 'obsidian',
    label: '옵시디언 블랙',
    frameClass: 'bg-[#18181B] border-[#3F3F46]',
    keycapBg: 'bg-[#27272A] border-[#3F3F46]',
    keycapText: 'text-[#D4D4D8]',
  },
  {
    id: 'silver',
    label: '실버 아노다이징',
    frameClass: 'bg-zinc-200 border-zinc-300',
    keycapBg: 'bg-white border-zinc-300',
    keycapText: 'text-zinc-600',
  },
  {
    id: 'cream',
    label: '레트로 크림',
    frameClass: 'bg-stone-200 border-stone-300',
    keycapBg: 'bg-stone-50 border-stone-300',
    keycapText: 'text-stone-600',
  },
]

const ROW_BADGES = [
  { keyType: 'R1', label: '1행 · ESC / 숫자열 (1u)' },
  { keyType: 'R2', label: '2행 · QWERTY 열 (1u)' },
  { keyType: 'R3', label: '3행 · ASDF 열 / Enter (2.25u)' },
  { keyType: 'R4', label: '4행 · ZXCV / Shift (2.25u) / Space (6.25u)' },
] as const

function resolveTargetSlot(keyType: string): {
  row: number
  slotId: string
  description: string
} {
  if (keyType === 'R1') return { row: 1, slotId: 'ESC', description: '좌측 상단 1행(ESC) 자리' }
  if (keyType === 'R2') return { row: 2, slotId: 'Q', description: '2행(QWERTY 상단열) 자리' }
  if (keyType === 'R3') return { row: 3, slotId: 'A', description: '3행(ASDF 홈로우) 자리' }
  if (keyType === 'Enter')
    return { row: 3, slotId: 'ENTER', description: '3행 우측 Enter(2.25u) 자리' }
  if (keyType === 'Left Shift')
    return { row: 4, slotId: 'LSHIFT', description: '4행 좌측 Shift(2.25u) 자리' }
  if (keyType === 'Space Bar')
    return { row: 5, slotId: 'SPACE', description: '최하단 Space Bar(6.25u) 자리' }
  return { row: 4, slotId: 'Z', description: '4행(ZXCV 하단열) 자리' }
}

/**
 * 내가 디자인한 키캡을 실제 기계식 키보드 배열에 실시간 장착해 보여주는 미리보기 컴포넌트입니다.
 */
export function KeyboardMountPreview({
  meta,
  previewDataUrl,
  backgroundColor,
}: KeyboardMountPreviewProps) {
  const [caseFinish, setCaseFinish] = useState<CaseFinish>(CASE_FINISHES[0])
  const target = resolveTargetSlot(meta.keyType)

  const renderKeySlot = (id: string, label: string, spanUnits: number, isTarget: boolean) => {
    const flexStyle = { flexGrow: spanUnits, flexBasis: 0 }
    if (isTarget) {
      return (
        <div
          className="relative flex h-10 items-center justify-center overflow-hidden rounded-[5px] border border-[#A1A1AA] bg-white p-[3px] shadow-xs max-sm:h-7 max-sm:p-[2px]"
          key={id}
          style={flexStyle}
          title={`내 커스텀 키캡 (${meta.keyType})`}
        >
          <div
            className="flex h-full w-full items-center justify-center overflow-hidden rounded-[3px]"
            style={{ backgroundColor }}
          >
            {previewDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="커스텀 키캡 장착 미리보기"
                className="h-full w-full object-cover"
                src={previewDataUrl}
              />
            ) : (
              <span className="text-[10px] font-bold text-[#18181B] max-sm:text-[7px]">
                {label}
              </span>
            )}
          </div>
        </div>
      )
    }

    return (
      <div
        className={`flex h-10 items-center justify-center rounded-[5px] border text-[11px] font-medium select-none max-sm:h-7 max-sm:text-[7px] ${caseFinish.keycapBg} ${caseFinish.keycapText}`}
        key={id}
        style={flexStyle}
      >
        {label}
      </div>
    )
  }

  return (
    <div className="mt-6 border-t border-[#E4E4E7] pt-5">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#18181B]">실시간 키보드 장착 미리보기</p>
          <p className="mt-0.5 text-xs text-[#52525B]">
            흰색 테두리 위치({target.description})에 내 디자인이 실시간 반영됩니다.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-[4px] p-0.5 text-xs">
          {CASE_FINISHES.map((finish) => (
            <button
              className={`h-7 rounded-[4px] px-3 transition ${
                caseFinish.id === finish.id
                  ? 'bg-[#F0F0F1] font-bold text-[#18181B]'
                  : 'font-medium text-[#52525B] hover:text-[#18181B]'
              }`}
              key={finish.id}
              onClick={() => setCaseFinish(finish)}
              type="button"
            >
              {finish.label}
            </button>
          ))}
        </div>
      </div>

      {/* 60% 기계식 키보드 하우징 & 5행 키캡 배열 */}
      <div
        className={`rounded-[11px] border p-3.5 transition-colors max-sm:p-2 ${caseFinish.frameClass}`}
      >
        <div className="space-y-1">
          {/* Row 1 (R1) */}
          <div className="flex gap-1">
            {renderKeySlot('ESC', 'ESC', 1, target.slotId === 'ESC')}
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].map((k) =>
              renderKeySlot(k, k, 1, false),
            )}
            {renderKeySlot('BS', 'BACK', 2, false)}
          </div>

          {/* Row 2 (R2) */}
          <div className="flex gap-1">
            {renderKeySlot('TAB', 'TAB', 1.5, false)}
            {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'].map((k) =>
              renderKeySlot(k, k, 1, k === 'Q' && target.slotId === 'Q'),
            )}
            {renderKeySlot('BSL', '\\', 1.5, false)}
          </div>

          {/* Row 3 (R3 + Enter) */}
          <div className="flex gap-1">
            {renderKeySlot('CAPS', 'CAPS', 1.75, false)}
            {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'"].map((k) =>
              renderKeySlot(k, k, 1, k === 'A' && target.slotId === 'A'),
            )}
            {renderKeySlot('ENTER', 'ENTER', 2.25, target.slotId === 'ENTER')}
          </div>

          {/* Row 4 (Left Shift + R4) */}
          <div className="flex gap-1">
            {renderKeySlot('LSHIFT', 'SHIFT', 2.25, target.slotId === 'LSHIFT')}
            {['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'].map((k) =>
              renderKeySlot(k, k, 1, k === 'Z' && target.slotId === 'Z'),
            )}
            {renderKeySlot('RSHIFT', 'SHIFT', 2.75, false)}
          </div>

          {/* Row 5 (Space Bar) */}
          <div className="flex gap-1">
            {renderKeySlot('LCTRL', 'CTRL', 1.25, false)}
            {renderKeySlot('WIN', 'WIN', 1.25, false)}
            {renderKeySlot('LALT', 'ALT', 1.25, false)}
            {renderKeySlot('SPACE', 'SPACE BAR (6.25u)', 6.25, target.slotId === 'SPACE')}
            {renderKeySlot('RALT', 'ALT', 1.25, false)}
            {renderKeySlot('FN', 'FN', 1.25, false)}
            {renderKeySlot('MENU', 'MENU', 1.25, false)}
            {renderKeySlot('RCTRL', 'CTRL', 1.25, false)}
          </div>
        </div>
      </div>

      {/* R1~R4 행 위치 뱃지 */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
        {ROW_BADGES.map((badge) => {
          const isCurrent =
            (badge.keyType === 'R1' && meta.keyType === 'R1') ||
            (badge.keyType === 'R2' && meta.keyType === 'R2') ||
            (badge.keyType === 'R3' && (meta.keyType === 'R3' || meta.keyType === 'Enter')) ||
            (badge.keyType === 'R4' &&
              (meta.keyType === 'R4' ||
                meta.keyType === 'Left Shift' ||
                meta.keyType === 'Space Bar'))
          return (
            <span
              className={`inline-flex h-7 items-center rounded-[4px] px-3 transition ${
                isCurrent ? 'bg-[#F0F0F1] font-bold text-[#18181B]' : 'font-medium text-[#18181B]'
              }`}
              key={badge.keyType}
            >
              {badge.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
