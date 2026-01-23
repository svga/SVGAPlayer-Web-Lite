import { createParserOnMessage, type ParserWorkerHost } from './worker-core'

const host = self as unknown as ParserWorkerHost

self.onmessage = createParserOnMessage(host)
