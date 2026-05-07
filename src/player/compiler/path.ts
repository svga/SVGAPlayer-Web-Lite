import { PathCommand } from './types'

interface CurrentPoint {
  x: number
  y: number
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ParsedPath {
  commands: PathCommand[]
  contourCount: number
  hasHoles: boolean
  hasUnsupportedCommands: boolean
}

const validMethods = 'MLHVCSQRZmlhvcsqrzAa'

function numbersFromArgs (args: string[]): number[] {
  return args
    .filter(arg => arg.length > 0)
    .map(arg => Number(arg))
}

function pushUnsupported (commands: PathCommand[], method: string): void {
  commands.push({ type: 'unsupported', method })
}

function parseElement (
  commands: PathCommand[],
  currentPoint: CurrentPoint,
  method: string,
  args: string[]
): void {
  const values = numbersFromArgs(args)

  switch (method) {
    case 'M':
      currentPoint.x = values[0]
      currentPoint.y = values[1]
      commands.push({ type: 'moveTo', x: currentPoint.x, y: currentPoint.y })
      break
    case 'm':
      currentPoint.x += values[0]
      currentPoint.y += values[1]
      commands.push({ type: 'moveTo', x: currentPoint.x, y: currentPoint.y })
      break
    case 'L':
      currentPoint.x = values[0]
      currentPoint.y = values[1]
      commands.push({ type: 'lineTo', x: currentPoint.x, y: currentPoint.y })
      break
    case 'l':
      currentPoint.x += values[0]
      currentPoint.y += values[1]
      commands.push({ type: 'lineTo', x: currentPoint.x, y: currentPoint.y })
      break
    case 'H':
      currentPoint.x = values[0]
      commands.push({ type: 'lineTo', x: currentPoint.x, y: currentPoint.y })
      break
    case 'h':
      currentPoint.x += values[0]
      commands.push({ type: 'lineTo', x: currentPoint.x, y: currentPoint.y })
      break
    case 'V':
      currentPoint.y = values[0]
      commands.push({ type: 'lineTo', x: currentPoint.x, y: currentPoint.y })
      break
    case 'v':
      currentPoint.y += values[0]
      commands.push({ type: 'lineTo', x: currentPoint.x, y: currentPoint.y })
      break
    case 'C':
      currentPoint.x1 = values[0]
      currentPoint.y1 = values[1]
      currentPoint.x2 = values[2]
      currentPoint.y2 = values[3]
      currentPoint.x = values[4]
      currentPoint.y = values[5]
      commands.push({
        type: 'bezierCurveTo',
        x1: currentPoint.x1,
        y1: currentPoint.y1,
        x2: currentPoint.x2,
        y2: currentPoint.y2,
        x: currentPoint.x,
        y: currentPoint.y
      })
      break
    case 'c':
      currentPoint.x1 = currentPoint.x + values[0]
      currentPoint.y1 = currentPoint.y + values[1]
      currentPoint.x2 = currentPoint.x + values[2]
      currentPoint.y2 = currentPoint.y + values[3]
      currentPoint.x += values[4]
      currentPoint.y += values[5]
      commands.push({
        type: 'bezierCurveTo',
        x1: currentPoint.x1,
        y1: currentPoint.y1,
        x2: currentPoint.x2,
        y2: currentPoint.y2,
        x: currentPoint.x,
        y: currentPoint.y
      })
      break
    case 'S':
      currentPoint.x1 = currentPoint.x - currentPoint.x2 + currentPoint.x
      currentPoint.y1 = currentPoint.y - currentPoint.y2 + currentPoint.y
      currentPoint.x2 = values[0]
      currentPoint.y2 = values[1]
      currentPoint.x = values[2]
      currentPoint.y = values[3]
      commands.push({
        type: 'bezierCurveTo',
        x1: currentPoint.x1,
        y1: currentPoint.y1,
        x2: currentPoint.x2,
        y2: currentPoint.y2,
        x: currentPoint.x,
        y: currentPoint.y
      })
      break
    case 's':
      currentPoint.x1 = currentPoint.x - currentPoint.x2 + currentPoint.x
      currentPoint.y1 = currentPoint.y - currentPoint.y2 + currentPoint.y
      currentPoint.x2 = currentPoint.x + values[0]
      currentPoint.y2 = currentPoint.y + values[1]
      currentPoint.x += values[2]
      currentPoint.y += values[3]
      commands.push({
        type: 'bezierCurveTo',
        x1: currentPoint.x1,
        y1: currentPoint.y1,
        x2: currentPoint.x2,
        y2: currentPoint.y2,
        x: currentPoint.x,
        y: currentPoint.y
      })
      break
    case 'Q':
      currentPoint.x1 = values[0]
      currentPoint.y1 = values[1]
      currentPoint.x = values[2]
      currentPoint.y = values[3]
      commands.push({
        type: 'quadraticCurveTo',
        x1: currentPoint.x1,
        y1: currentPoint.y1,
        x: currentPoint.x,
        y: currentPoint.y
      })
      break
    case 'q':
      currentPoint.x1 = currentPoint.x + values[0]
      currentPoint.y1 = currentPoint.y + values[1]
      currentPoint.x += values[2]
      currentPoint.y += values[3]
      commands.push({
        type: 'quadraticCurveTo',
        x1: currentPoint.x1,
        y1: currentPoint.y1,
        x: currentPoint.x,
        y: currentPoint.y
      })
      break
    case 'Z':
    case 'z':
      commands.push({ type: 'closePath' })
      break
    default:
      pushUnsupported(commands, method)
      break
  }
}

export function parsePath (d: string | undefined): ParsedPath {
  const commands: PathCommand[] = []
  const currentPoint: CurrentPoint = { x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0 }

  if (d === undefined) {
    return {
      commands,
      contourCount: 0,
      hasHoles: false,
      hasUnsupportedCommands: false
    }
  }

  d
    .replace(/([a-zA-Z])/g, '|||$1 ')
    .replace(/,/g, ' ')
    .split('|||')
    .forEach(segment => {
      if (segment.length === 0) return
      const method = segment.substr(0, 1)
      if (!validMethods.includes(method)) {
        pushUnsupported(commands, method)
        return
      }
      parseElement(commands, currentPoint, method, segment.substr(1).trim().split(' '))
    })

  const contourCount = commands.filter(command => command.type === 'moveTo').length

  return {
    commands,
    contourCount,
    hasHoles: contourCount > 1,
    hasUnsupportedCommands: commands.some(command => command.type === 'unsupported')
  }
}
