const getVersion = (data: ArrayBuffer | ArrayBufferView): number => {
  const headerLength = Math.min(4, data.byteLength)
  const header = data instanceof ArrayBuffer
    ? new Uint8Array(data, 0, headerLength)
    : new Uint8Array(data.buffer, data.byteOffset, headerLength)

  if (header.length < 4) {
    return 0
  }

  // SVGA 1.x format has PK\x03\x04 signature
  if (header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04) {
    return 1
  }

  // Invalid headers: all zeros or all 0xFF
  if (header.every(byte => byte === 0x00 || byte === 0xFF)) {
    return 0
  }

  // All other valid 4-byte headers are SVGA 2.x
  return 2
}

export const Utils = {
  getVersion
}
