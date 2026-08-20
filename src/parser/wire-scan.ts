const invalid = (): never => { throw Error('Invalid SVGA protobuf wire data') }

export function scanMovieWire (source: Uint8Array): void {
  let offset = 0
  let sprites = 0
  let frames = 0
  let shapes = 0
  let images = 0
  let audios = 0
  let paths = 0

  const read = (end: number): number => {
    let value = 0
    let factor = 1
    for (let index = 0; index < 10; index++) {
      if (offset >= end) invalid()
      const byte = source[offset++]
      const digit = byte & 0x7f
      if (digit !== 0 && factor > (Number.MAX_SAFE_INTEGER - value) / digit) invalid()
      value += digit * factor
      if ((byte & 0x80) === 0) return value
      factor *= 128
    }
    return invalid()
  }

  const bounded = (value: number, maximum: number): void => { if (value > maximum) invalid() }
  const budgetField = (kind: number, field: number): boolean =>
    (kind === 0 && field >= 3 && field <= 5) ||
    (kind === 1 && field === 2) ||
    (kind === 2 && (field === 4 || field === 5)) ||
    (kind === 3 && field === 2) ||
    (kind === 4 && field === 1)

  const scan = (end: number, kind: number): void => {
    while (offset < end) {
      const tag = read(end)
      const field = Math.floor(tag / 8)
      const wire = tag & 7
      if (tag > 0xffff_ffff || field === 0 || wire === 3 || wire === 4 || wire > 5) invalid()
      if (budgetField(kind, field) && wire !== 2) invalid()
      if (wire === 0) read(end)
      else if (wire === 1 || wire === 5) {
        offset += wire === 1 ? 8 : 4
        if (offset > end) invalid()
      } else if (wire === 2) {
        const length = read(end)
        if (length > end - offset) invalid()
        const next = offset + length
        let nested = -1
        if (kind === 0) {
          if (field === 3) bounded(++images, 512)
          else if (field === 4) { bounded(++sprites, 2_000); nested = 1 }
          else if (field === 5) bounded(++audios, 512)
        } else if (kind === 1 && field === 2) { bounded(++frames, 500_000); nested = 2 }
        else if (kind === 2) {
          if (field === 4) bounded(paths += length, 1_048_576)
          else if (field === 5) { bounded(++shapes, 100_000); nested = 3 }
        } else if (kind === 3 && field === 2) nested = 4
        else if (kind === 4 && field === 1) bounded(paths += length, 1_048_576)
        if (nested < 0) offset = next
        else { scan(next, nested); if (offset !== next) invalid() }
      } else invalid()
    }
    if (offset !== end) invalid()
  }

  scan(source.length, 0)
}
