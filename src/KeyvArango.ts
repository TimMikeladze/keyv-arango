import { Collection, CreateCollectionOptions } from 'arangojs/collection'
import { Config } from 'arangojs/connection'
import Keyv, { Store } from 'keyv'
import { Database } from 'arangojs/database'
import { aql } from 'arangojs/aql'

export interface KeyvArangoOptions {
  collectionName?: string
  config: Config
  expireAfter?: number
  field?: string
  namespace?: string
}

const getCollection = async <T extends object = any>(
  database: Database,
  collectionName: string,
  indexes: any[] = [],
  options?: CreateCollectionOptions
): Promise<any> => {
  let c
  try {
    c = await database.createCollection<T>(collectionName, options)
  } catch {
    c = database.collection(collectionName)
  }

  for (const index of indexes) {
    await c.ensureIndex(index)
  }

  return c
}

export class KeyvArango implements Store<any> {
  config: Config
  databaseName: string
  namespace: string
  collectionName: string
  expireAfter: number
  field: string
  opts: any = {}

  constructor(options: KeyvArangoOptions) {
    this.config = options.config
    this.databaseName = this.config.databaseName || '_system'
    this.namespace = options.namespace || this.namespace
    this.collectionName = options.collectionName || 'keyv'
    this.expireAfter = options.expireAfter || 0
    this.field = options.field || 'expireDate'
  }

  private async getDatabase(): Promise<{
    collection: Collection
    database: Database
  }> {
    let database = new Database({
      ...this.config,
      databaseName: '_system'
    })

    try {
      database = await database.createDatabase(this.databaseName)
    } catch (err) {
      database = database.database(this.databaseName)
    }

    const collection = await getCollection(database, this.collectionName, [
      {
        type: 'persistent',
        fields: ['key', 'namespace']
      },
      {
        type: 'ttl',
        fields: [this.field],
        expireAfter: this.expireAfter
      }
    ])

    return {
      collection,
      database
    }
  }

  private namespaceAql() {
    return this.namespace
      ? aql`FILTER doc.namespace == ${this.namespace}`
      : aql``
  }

  public async clear(): Promise<void> {
    const { database } = await this.getDatabase()
    await database.query(aql`
      FOR doc IN ${database.collection(this.collectionName)}
        ${this.namespaceAql()}
      REMOVE doc IN ${database.collection(this.collectionName)}
    `)
  }

  public async delete(key: string): Promise<boolean> {
    const { database } = await this.getDatabase()
    try {
      if (await this.has(key)) {
        await database.query(aql`
          FOR doc IN ${database.collection(this.collectionName)}
            ${this.namespaceAql()}
            FILTER doc.key == ${key}
            REMOVE doc IN ${database.collection(this.collectionName)}`)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  public async get(key: string): Promise<any> {
    const { database } = await this.getDatabase()
    const doc = await (
      await database.query(aql`
    FOR doc IN ${database.collection(this.collectionName)}
      ${this.namespaceAql()}
      FILTER doc.key == ${key}
      RETURN doc
    `)
    ).next()

    return doc?.value
  }

  public async getMany(
    keys: string[]
  ): Promise<Array<Keyv.StoredData<any>>> | undefined {
    const { database } = await this.getDatabase()
    const cursor = await (
      await database.query(aql`
    FOR doc IN ${database.collection(this.collectionName)}
      ${this.namespaceAql()}
      FILTER doc.key IN ${keys}
      RETURN doc
    `)
    ).all()

    return keys.map((x) => {
      const found = cursor.find((y) => y.key === x)?.value
      if (!found) {
        return undefined
      }
      return found
    })
  }

  public async has(key: string): Promise<boolean> {
    return !!(await this.get(key))
  }

  public async set(key: string, value: any, ttl?: number): Promise<any> {
    const { collection } = await this.getDatabase()

    const now = new Date().getTime()

    const fieldValue = ttl
      ? parseInt(Number((now + ttl) / 1000).toFixed())
      : undefined

    await collection.save({
      key,
      value,
      [this.field]: fieldValue,
      namespace: this.namespace
    })

    return value
  }
}
