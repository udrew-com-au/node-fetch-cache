import fetch, { Request } from 'node-fetch';
import fs from 'fs';
import crypto from 'crypto';
import locko from 'locko';
import { NFCResponse } from './classes/response.js';
import { MemoryCache } from './classes/caching/memory_cache.js';

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

export function getCacheKey(resource, init = {}) {
  const resourceCacheKeyJson = resource instanceof Request
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

  if (resource instanceof Request && resource.headers.get('Cache-Control') === 'only-if-cached') {
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

export default defaultFetch;
export const fetchBuilder = defaultFetch;
export { MemoryCache } from './classes/caching/memory_cache.js';
export { FileSystemCache } from './classes/caching/file_system_cache.js';
