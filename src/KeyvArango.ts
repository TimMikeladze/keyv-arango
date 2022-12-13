import { Collection, CreateCollectionOptions } from 'arangojs/collection.js'
import { Config } from 'arangojs/connection.js'
import Keyv, { Store } from 'keyv'
import { Database } from 'arangojs/database.js'
import { aql } from 'arangojs/aql.js'

export interface KeyvArangoOptions {
  cacheCollection?: boolean
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
  private readonly config: Config
  private readonly databaseName: string
  private readonly namespace: string
  private readonly collectionName: string
  private readonly expireAfter: number
  private readonly field: string
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private opts: any = {}
  private collection: Collection
  private readonly cacheCollection: boolean

  constructor(options: KeyvArangoOptions) {
    this.config = options.config
    this.databaseName = this.config.databaseName || '_system'
    this.namespace = options.namespace || this.namespace
    this.collectionName = options.collectionName || 'keyv'
    this.expireAfter = options.expireAfter || 0
    this.field = options.field || 'expireDate'
    this.cacheCollection = options.cacheCollection ?? true
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

    const collection =
      this.cacheCollection && this.collection
        ? this.collection
        : await getCollection(database, this.collectionName, [
            {
              type: 'persistent',
              fields: ['key', 'namespace'],
              unique: true
            },
            {
              type: 'ttl',
              fields: [this.field],
              expireAfter: this.expireAfter
            }
          ])

    if (this.cacheCollection && !this.collection) {
      this.collection = collection
    }

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

  private async getDoc(key: string): Promise<{
    [x: string]: any
    _id: string
    _key: string
    key: string
    namespace: string | null
    value: any
  }> {
    const { database } = await this.getDatabase()
    return await (
      await database.query(aql`
    FOR doc IN ${database.collection(this.collectionName)}
      ${this.namespaceAql()}
      FILTER doc.key == ${key}
      RETURN doc
    `)
    ).next()
  }

  public async get(key: string): Promise<any> {
    const doc = await this.getDoc(key)

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

    const found = await this.getDoc(key)

    const now = new Date().getTime()

    const fieldValue = ttl
      ? parseInt(Number((now + ttl) / 1000).toFixed())
      : null

    const data = {
      key,
      value,
      [this.field]: fieldValue,
      namespace: this.namespace
    }

    if (found) {
      await collection.update(found._key, data)
    } else {
      await collection.save(data)
    }

    return value
  }
}
