# keyv-arango

[ArangoDB](https://github.com/arangodb/arangodb) store for [Keyv](https://github.com/jaredwray/keyv): simple key-value storage with support for multiple backends.

## Install

```shell
npm install keyv-arango keyv arangojs
# or
yarn add keyv-arango keyv arangojs
# or
pnpm add keyv-arango keyv arangojs
```

## Usage

```ts
import Keyv from 'keyv'
import { KeyvArango, KeyvArangoOptions } from 'keyv-arango'

const options: KeyvArangoOptions = {
  // An ArangoDB database config object. This field is required.
  // If no database is specified, the default `_system` database will be used.
  config: {
    url: process.env.ARANGO_URL
  },
  // All fields below are optional.
  expireAfter: 0, // how long to wait before expiring a key (in milliseconds). Defaults to 0.
  field: 'expireDate', // the name of the field which will store the expiration date. Defaults to 'expireDate'.
  collectionName: 'keyv', // the name of the collection to use. Defaults to 'keyv'.
  namespace: null // the keyv namespace to use. Defaults to null.
}

const store = new KeyvArango(options)

const keyv = new Keyv({ store })

// From here on, you can use keyv as usual.

await keyv.set('foo', 'bar', 1000)

await keyv.get('foo')
```

## ArangoDB and TTL Indexes

When using TTL indexes in ArangoDB is no guarantee that a key will be deleted at the exact time specified, only that the key will be deleted. ArangoDB runs a background thread which is responsible for cleaning up keys. The frequency of this thread is configurable, but **defaults to 30 seconds**.

This is an important caveat to keep in mind when using this library and ArangoDB in general. **Without prior configuration, ArangoDB is not suitable for short-lived keys.** When starting an ArangoDB instance the `--ttl.frequency` option can be used to configure the frequency of the background thread. For more information, see the [ArangoDB documentation](https://www.arangodb.com/docs/stable/programs-arangod-options.html#ttl-frequency). In fact the CI tests for this library use a frequency of 1 second to ensure that the tests pass in a timely manner.
