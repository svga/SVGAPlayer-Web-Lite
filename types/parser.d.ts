interface Parser {
  constructor ({ worker }: { worker: Boolean })

  do (data: ArrayBuffer): Promise<Object>
}
