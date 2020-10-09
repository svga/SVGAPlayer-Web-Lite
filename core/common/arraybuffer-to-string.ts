export default function (buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('utf8')
}
