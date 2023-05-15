'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var fetch = require('node-fetch');
var fs = require('fs');
var crypto = require('crypto');
var locko = require('locko');
var stream = require('stream');
var cacache = require('cacache');

const responseInternalSymbol = Object.getOwnPropertySymbols(new fetch.Response())[1];

class NFCResponse extends fetch.Response {
  constructor(bodyStream, metaData, ejectFromCache, fromCache) {
    super(bodyStream, metaData);
    this.ejectFromCache = ejectFromCache;
    this.fromCache = fromCache;
  }

  static serializeMetaFromNodeFetchResponse(res) {
    const metaData = {
      url: res.url,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers.raw(),
      size: res.size,
      timeout: res.timeout,
      counter: res[responseInternalSymbol].counter,
    };

    return metaData;
  }

  ejectFromCache() {
    return this.ejectSelfFromCache();
  }
}

class KeyTimeout {
  constructor() {
    this.timeoutHandleForKey = {};
  }

  clearTimeout(key) {
    clearTimeout(this.timeoutHandleForKey[key]);
  }

  updateTimeout(key, durationMs, callback) {
    this.clearTimeout(key);
    this.timeoutHandleForKey[key] = setTimeout(() => {
      callback();
    }, durationMs);
  }
}

function streamToBuffer(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

class MemoryCache {
  constructor(options = {}) {
    this.ttl = options.ttl;
    this.keyTimeout = new KeyTimeout();
    this.cache = {};
  }

  get(key) {
    const cachedValue = this.cache[key];
    if (cachedValue) {
      return {
        bodyStream: stream.Readable.from(cachedValue.bodyBuffer),
        metaData: cachedValue.metaData,
      };
    }

    return undefined;
  }

  remove(key) {
    this.keyTimeout.clearTimeout(key);
    delete this.cache[key];
  }

  async set(key, bodyStream, metaData) {
    const bodyBuffer = await streamToBuffer(bodyStream);
    this.cache[key] = { bodyBuffer, metaData };

    if (typeof this.ttl === 'number') {
      this.keyTimeout.updateTimeout(key, this.ttl, () => this.remove(key));
    }

    return this.get(key);
  }
}

function getBodyAndMetaKeys(key) {
  return [`${key}body`, `${key}meta`];
}

class FileSystemCache {
  constructor(options = {}) {
    this.ttl = options.ttl;
    this.cacheDirectory = options.cacheDirectory || '.cache';
  }

  async get(key) {
    const [, metaKey] = getBodyAndMetaKeys(key);

    const metaInfo = await cacache.get.info(this.cacheDirectory, metaKey);

    if (!metaInfo) {
      return undefined;
    }

    const metaBuffer = await cacache.get.byDigest(this.cacheDirectory, metaInfo.integrity);
    const metaData = JSON.parse(metaBuffer);
    const { bodyStreamIntegrity, empty, expiration } = metaData;

    delete metaData.bodyStreamIntegrity;
    delete metaData.empty;
    delete metaData.expiration;

    if (expiration && expiration < Date.now()) {
      return undefined;
    }

    const bodyStream = empty
      ? stream.Readable.from(Buffer.alloc(0))
      : cacache.get.stream.byDigest(this.cacheDirectory, bodyStreamIntegrity);

    return {
      bodyStream,
      metaData,
    };
  }

  remove(key) {
    const [bodyKey, metaKey] = getBodyAndMetaKeys(key);

    return Promise.all([
      cacache.rm.entry(this.cacheDirectory, bodyKey),
      cacache.rm.entry(this.cacheDirectory, metaKey),
    ]);
  }

  async set(key, bodyStream, metaData) {
    const [bodyKey, metaKey] = getBodyAndMetaKeys(key);
    const metaCopy = { ...metaData };

    if (typeof this.ttl === 'number') {
      metaCopy.expiration = Date.now() + this.ttl;
    }

    try {
      metaCopy.bodyStreamIntegrity = await new Promise((fulfill, reject) => {
        bodyStream.pipe(cacache.put.stream(this.cacheDirectory, bodyKey))
          .on('integrity', (i) => fulfill(i))
          .on('error', (e) => {
            reject(e);
          });
      });
    } catch (err) {
      if (err.code !== 'ENODATA') {
        throw err;
      }

      metaCopy.empty = true;
    }

    const metaBuffer = Buffer.from(JSON.stringify(metaCopy));
    await cacache.put(this.cacheDirectory, metaKey, metaBuffer);
    const cachedData = await this.get(key);

    return cachedData;
  }
}

const CACHE_VERSION = 4;
const DEFAULT_KEY_FLAGS = {
  cache: true,
  credentials: true,
  destination: true,
  headers: true,
  integrity: true,
  method: true,
  redirect: true,
  referrer: true,
  referrerPolicy: true,
  url: true,
  body: true,
};

let keyFlags = DEFAULT_KEY_FLAGS;

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

// Since the bounday in FormData is random,
// we ignore it for purposes of calculating
// the cache key.
function getFormDataCacheKey(formData) {
  const cacheKey = { ...formData };
  const boundary = formData.getBoundary();

  // eslint-disable-next-line no-underscore-dangle
  delete cacheKey._boundary;

  const boundaryReplaceRegex = new RegExp(boundary, 'g');

  // eslint-disable-next-line no-underscore-dangle
  cacheKey._streams = cacheKey._streams.map((s) => {
    if (typeof s === 'string') {
      return s.replace(boundaryReplaceRegex, '');
    }

    return s;
  });

  return cacheKey;
}

function getHeadersCacheKeyJson(headersObj) {
  return Object.fromEntries(
    Object.entries(headersObj)
      .map(([key, value]) => [key.toLowerCase(), value])
      .filter(([key, value]) => (key !== 'cache-control' || value !== 'only-if-cached')
        /* Either:
          * we're just including headers entire (if key_flags.headers == false
            we shouldn't be here anyway),
          * or key_flags.headers is an object and doesn't include a directive for this header key
            (in which case include it by default),
          * or key_flags.headers is an object and we're not explicitly excluding this header key
          */
        && (typeof keyFlags.headers === 'boolean' || !Object.prototype.hasOwnProperty.call(keyFlags.headers, key) || keyFlags.headers[key])),
  );
}

function getBodyCacheKeyJson(body) {
  if (!body) {
    return body;
  } if (typeof body === 'string') {
    return body;
  } if (body instanceof URLSearchParams) {
    return body.toString();
  } if (body instanceof fs.ReadStream) {
    return body.path;
  } if (body.toString && body.toString() === '[object FormData]') {
    return getFormDataCacheKey(body);
  } if (body instanceof Buffer) {
    return body.toString();
  }

  throw new Error('Unsupported body type. Supported body types are: string, number, undefined, null, url.URLSearchParams, fs.ReadStream, FormData');
}

function getRequestCacheKey(req) {
  const headersPojo = Object.fromEntries([...req.headers.entries()]);

  return {
    cache: keyFlags.cache ? req.cache : '',
    credentials: keyFlags.credentials ? req.credentials : '',
    destination: keyFlags.destination ? req.destination : '',
    headers: keyFlags.headers ? getHeadersCacheKeyJson(headersPojo) : '',
    integrity: keyFlags.integrity ? req.integrity : '',
    method: keyFlags.method ? req.method : '',
    redirect: keyFlags.redirect ? req.redirect : '',
    referrer: keyFlags.referrer ? req.referrer : '',
    referrerPolicy: keyFlags.referrerPolicy ? req.referrerPolicy : '',
    url: keyFlags.url ? req.url : '',
    body: keyFlags.body ? getBodyCacheKeyJson(req.body) : '',
  };
}

function getCacheKey(resource, init = {}) {
  const resourceCacheKeyJson = resource instanceof fetch.Request
    ? getRequestCacheKey(resource)
    : { url: resource };

  const initCacheKeyJson = {
    ...init,
    headers: keyFlags.headers ? getHeadersCacheKeyJson(init.headers || {}) : '',
  };

  resourceCacheKeyJson.body = getBodyCacheKeyJson(resourceCacheKeyJson.body);
  initCacheKeyJson.body = getBodyCacheKeyJson(initCacheKeyJson.body);

  delete initCacheKeyJson.agent;

  return md5(JSON.stringify([resourceCacheKeyJson, initCacheKeyJson, CACHE_VERSION]));
}

function hasOnlyWithCacheOption(resource, init) {
  if (
    init
    && init.headers
    && Object.entries(init.headers)
      .some(([key, value]) => key.toLowerCase() === 'cache-control' && value === 'only-if-cached')
  ) {
    return true;
  }

  if (resource instanceof fetch.Request && resource.headers.get('Cache-Control') === 'only-if-cached') {
    return true;
  }

  return false;
}

async function getResponse(cache, requestArguments) {
  const cacheKey = getCacheKey(...requestArguments);
  let cachedValue = await cache.get(cacheKey);

  const ejectSelfFromCache = () => cache.remove(cacheKey);

  if (cachedValue) {
    return new NFCResponse(
      cachedValue.bodyStream,
      cachedValue.metaData,
      ejectSelfFromCache,
      true,
    );
  }

  if (hasOnlyWithCacheOption(...requestArguments)) {
    return undefined;
  }

  await locko.lock(cacheKey);
  try {
    cachedValue = await cache.get(cacheKey);
    if (cachedValue) {
      return new NFCResponse(
        cachedValue.bodyStream,
        cachedValue.metaData,
        ejectSelfFromCache,
        true,
      );
    }

    const fetchResponse = await fetch(...requestArguments);
    const serializedMeta = NFCResponse.serializeMetaFromNodeFetchResponse(fetchResponse);

    const newlyCachedData = await cache.set(
      cacheKey,
      fetchResponse.body,
      serializedMeta,
    );

    return new NFCResponse(
      newlyCachedData.bodyStream,
      newlyCachedData.metaData,
      ejectSelfFromCache,
      false,
    );
  } finally {
    locko.unlock(cacheKey);
  }
}

function createFetchWithCache(cache, options = {}) {
  const fetchCache = (...args) => getResponse(cache, args);
  fetchCache.withCache = createFetchWithCache;

  keyFlags = Object.assign(DEFAULT_KEY_FLAGS, options.keyFlags);
  return fetchCache;
}

const defaultFetch = createFetchWithCache(new MemoryCache());
const fetchBuilder = defaultFetch;

exports.FileSystemCache = FileSystemCache;
exports.MemoryCache = MemoryCache;
exports.default = defaultFetch;
exports.fetchBuilder = fetchBuilder;
exports.getCacheKey = getCacheKey;
