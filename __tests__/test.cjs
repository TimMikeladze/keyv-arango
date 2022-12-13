const test = require('ava')
const keyvTestSuite = require('@keyv/test-suite').default
const Keyv = require('keyv')
const { KeyvArango } = require('../dist/index.cjs')

const config = {
  url: process.env.ARANGO_URL || 'http://localhost:8529',
  retryOnConflict: 5
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

keyvTestSuite(
  test,
  Keyv,
  () =>
    new KeyvArango({
      config
    })
)

test.serial(
  'test that arango removes a key after a period of time',
  async (t) => {
    const keyv = new KeyvArango({
      config,
      collection: 'keyv-arango'
    })

    const key = 'test'
    const value = 'test'

    await keyv.set(key, value, 100)

    // Note: arangodb does not guarantee that the key will be removed at the exact time,
    // so we need to wait a bit longer for the key to be removed as part of the test.
    // By default, arangodb will clean up ttl keys every 30 seconds, however in the docker-compose file in this repo it is overwritten to 1 second.

    await sleep(1000 * 2)

    t.is(await keyv.get(key), undefined)
  }
)
