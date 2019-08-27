var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

;(!self.btoa) && (self.btoa = function (string) {
  string = String(string)
  var bitmap
  var a
  var b
  var c
  var result = ''
  var i = 0
  var rest = string.length % 3

  for (; i < string.length;) {
    if ((a = string.charCodeAt(i++)) > 255 ||
        (b = string.charCodeAt(i++)) > 255 ||
        (c = string.charCodeAt(i++)) > 255) {
      throw new TypeError("Failed to execute 'btoa' on 'Window': The string to be encoded contains characters outside of the Latin1 range.")
    }

    bitmap = (a << 16) | (b << 8) | c
    result += b64.charAt(bitmap >> 18 & 63) + b64.charAt(bitmap >> 12 & 63) +
              b64.charAt(bitmap >> 6 & 63) + b64.charAt(bitmap & 63)
  }

  return rest ? result.slice(0, rest - 3) + '==='.substring(rest) : result
})
