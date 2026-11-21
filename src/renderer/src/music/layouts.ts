/** Where instruments sit on the stage, per layout. x: -1 left .. 1 right, y: 0 front .. 1 back. */
import type { Spot } from '../audio/stage'

const CONCERT: Record<string, Spot> = {
  'Solo violin': { x: -0.15, y: 0.08 }, 'Grand piano': { x: -0.4, y: 0.22 },
  'Violins': { x: -0.6, y: 0.35 }, 'Violas': { x: 0.15, y: 0.4 }, 'Cellos': { x: 0.5, y: 0.35 }, 'Double bass': { x: 0.8, y: 0.6 },
  'Harp': { x: -0.82, y: 0.6 }, 'Flute': { x: -0.2, y: 0.62 }, 'Oboe': { x: 0.08, y: 0.62 }, 'Clarinet': { x: -0.25, y: 0.74 },
  'Bassoon': { x: 0.15, y: 0.74 }, 'French horn': { x: -0.5, y: 0.86 }, 'Trumpet': { x: 0.15, y: 0.9 }, 'Trombone': { x: 0.42, y: 0.9 },
  'Tuba': { x: 0.62, y: 0.9 }, 'Glockenspiel': { x: 0.68, y: 0.97 }, 'Marimba': { x: 0.55, y: 0.97 }, 'Xylophone': { x: 0.75, y: 0.97 },
  'Drums': { x: 0.1, y: 1 }
}

export const LAYOUTS: { id: string; name: string; hint: string; place: (group: string) => Spot }[] = [
  { id: 'concert', name: 'Concert hall', hint: 'The classic orchestra: violins left, cellos and basses right, winds and brass behind.',
    place: (g) => CONCERT[g] ?? { x: 0, y: 0.5 } },
  { id: 'wide', name: 'Wide stage', hint: 'Spread out like a big live show: everything wider, the soloist up front.',
    place: (g) => { const p = CONCERT[g] ?? { x: 0, y: 0.5 }; return g === 'Solo violin' ? { x: 0, y: 0.05 } : { x: Math.max(-1, Math.min(1, p.x * 1.35)), y: p.y * 0.85 } } },
  { id: 'close', name: 'Close room', hint: 'A small room: everyone near you, little echo.',
    place: (g) => { const p = CONCERT[g] ?? { x: 0, y: 0.5 }; return { x: p.x * 0.7, y: p.y * 0.35 } } },
  { id: 'takht', name: 'Takht', hint: 'An Arabic ensemble in a half circle in front of you.',
    place: (g) => {
      const order = ['Double bass', 'Cellos', 'Flute', 'Solo violin', 'Violins', 'Grand piano', 'Harp', 'Drums']
      const i = order.indexOf(g)
      const a = i < 0 ? 0 : -70 + (140 * i) / (order.length - 1)
      return { x: Math.sin((a * Math.PI) / 180) * 0.8, y: g === 'Drums' ? 0.3 : 0.18 + Math.abs(a) / 300 }
    } }
]
export const layoutById = (id: string): typeof LAYOUTS[number] => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]
