export default class DB {
  public db?: any

  constructor ({ name, version, desc, size } = { name: 'SVGA.Lite.DB', version: '1.0', desc: '', size: 3 * 1024 * 1024 }) {
    if (window.openDatabase) {
      this.db = window.openDatabase(name, version, desc, size)
      this.db.transaction((tx: any) => {
        tx.executeSql('CREATE TABLE IF NOT EXISTS SVGA (id unique, data, time)')
      })
    } else {
      throw new Error('[SVGA.Lite.DB] openDatabase undefined')
    }
  }

  find (id: string) {
    return new Promise((resolve, reject) => {
      this.db.transaction((tx: any) => {
        tx.executeSql('SELECT * FROM SVGA WHERE id = ?', [id], (tx: any, results: any) => {
          if (results.rows.length === 0) {
            resolve([])
          } else {
            resolve(results.rows)
          }
        }, null)
      })
    })
  }

  insert (id: string, data: string) {
    return new Promise((resolve, reject) => {
      this.db.transaction((tx: any) => {
        tx.executeSql('INSERT INTO SVGA (id, data, time) VALUES (?, ?, ?)', [id, data, new Date().getTime().toString()])
        resolve()
      })
    })
  }

  delete (id: string) {
    return new Promise((resolve, reject) => {
      this.db.transaction((tx: any) => {
        tx.executeSql('DELETE FROM SVGA WHERE id = ?', [id])
        resolve()
      })
    })
  }
}
