# SVGA protobuf decoder provenance

- Schema: `https://raw.githubusercontent.com/svga/SVGA-Format/master/proto/svga.proto`
- Schema SHA-256: `12f395148ae23ff04bcf0e39937b3f804edad5d57fbd7b7e6b5e04e49adb17b8`
- Generator: `protobufjs-cli@2.6.2`
- Runtime: `protobufjs@^8.7.2` minimal runtime
- Command:

  `npx --yes --package protobufjs-cli@2.6.2 pbjs --target static-module --wrap es6 --no-create --no-encode --no-verify --no-convert --no-delimited --no-typeurl --no-service --no-comments --force-number src/parser/svga.proto -o src/parser/svga.generated.ts`

The generated file is decode-only. `// @ts-nocheck` is prepended because the
official generator emits JavaScript rather than TypeScript source.
