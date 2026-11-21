/** The three playing rows, by physical key (works with any keyboard language, Arabic included). */
export const HIGH_ROW: [string, string][] = [
  ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'], ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P']
]
export const LOW_ROW: [string, string][] = [
  ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyH', 'H'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', ';']
]
export const CHORD_ROW: [string, string][] = [
  ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'], ['KeyN', 'N'], ['KeyM', 'M'], ['Comma', ','], ['Period', '.'], ['Slash', '/']
]

export type RowKey = { row: 'high' | 'low'; index: number } | { row: 'chord'; index: number }
export const KEY_BY_CODE = new Map<string, RowKey>([
  ...HIGH_ROW.map(([c], i) => [c, { row: 'high' as const, index: i }] as const),
  ...LOW_ROW.map(([c], i) => [c, { row: 'low' as const, index: i }] as const),
  ...CHORD_ROW.map(([c], i) => [c, { row: 'chord' as const, index: i }] as const)
])

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
export function noteName(midi: number): string {
  return NAMES[((midi % 12) + 12) % 12] + String(Math.floor(midi / 12) - 1)
}
export function octaveOf(midi: number): number { return Math.floor(midi / 12) - 1 }
