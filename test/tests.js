import { dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import FormData from 'form-data';
import assert from 'assert';
import rimraf from 'rimraf';
import path from 'path';
import { URLSearchParams } from 'url';
import standardFetch from 'node-fetch';
import FetchCache, { MemoryCache, FileSystemCache, getCacheKey } from '../src/index.js';
import { Agent } from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CACHE_PATH = path.join(__dirname, '..', '.cache');
const expectedPngBuffer = fs.readFileSync(path.join(__dirname, 'expected_png.png'));

const TWO_HUNDRED_URL = 'http://localhost:8080/status/200';
const FOUR_HUNDRED_URL = 'http://localhost:8080/status/400';
const THREE_HUNDRED_TWO_URL = 'http://localhost:8080/status/302';
const TEXT_BODY_URL = 'http://localhost:8080/robots.txt';
const JSON_BODY_URL = 'http://localhost:8080/json';
const PNG_BODY_URL = 'http://localhost:8080/image/png';

const TEXT_BODY_EXPECTED = 'User-agent: *\nDisallow: /deny\n';

let cachedFetch;
let body;

function post(body) {
  return { method: 'POST', body };
}

function removeDates(arrOrObj) {
  if (arrOrObj.date) {
    const copy = { ...arrOrObj };
    delete copy.date;
    return copy;
  }

  if (Array.isArray(arrOrObj)) {
    if (Array.isArray(arrOrObj[0])) {
      return arrOrObj.filter(e => e[0] !== 'date');
    }

    return arrOrObj.filter(e => !Date.parse(e));
  }

  return arrOrObj;
}

function wait(ms) {
  return new Promise((fulfill) => setTimeout(fulfill, ms));
}

async function dualFetch(...args) {
  const [cachedFetchResponse, standardFetchResponse] = await Promise.all([
    cachedFetch(...args),
    standardFetch(...args),
  ]);

  return { cachedFetchResponse, standardFetchResponse };
}

beforeEach(async function() {
  rimraf.sync(CACHE_PATH);
  cachedFetch = FetchCache.withCache(new MemoryCache());
});

let res;

describe('Basic property tests', function() {
  it('Has a status property', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.strictEqual(cachedFetchResponse.status, standardFetchResponse.status);

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.strictEqual(cachedFetchResponse.status, standardFetchResponse.status);

        done();
      })
    })
  });

  it('Has a statusText property', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.strictEqual(cachedFetchResponse.statusText, standardFetchResponse.statusText);

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.strictEqual(cachedFetchResponse.statusText, standardFetchResponse.statusText);

        done();
      })
    })
  });

  it('Has a url property', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.strictEqual(cachedFetchResponse.url, standardFetchResponse.url);

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.strictEqual(cachedFetchResponse.url, standardFetchResponse.url);
        
        done();
      })
    })
  });

  it('Has an ok property', (done) => {
    dualFetch(FOUR_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.strictEqual(cachedFetchResponse.ok, standardFetchResponse.ok);
      assert.strictEqual(cachedFetchResponse.status, standardFetchResponse.status);

      cachedFetch(FOUR_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.strictEqual(cachedFetchResponse.ok, standardFetchResponse.ok);
        assert.strictEqual(cachedFetchResponse.status, standardFetchResponse.status);
        
        done();
      })
    })
  });

  it('Has a redirected property', (done) => {
    dualFetch(THREE_HUNDRED_TWO_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.strictEqual(cachedFetchResponse.redirected, standardFetchResponse.redirected);

      cachedFetch(THREE_HUNDRED_TWO_URL).then((cachedFetchResponse) => {
        assert.strictEqual(cachedFetchResponse.redirected, standardFetchResponse.redirected);
        
        done();
      });
    });
  });
}).timeout(10000);

describe('Header tests', function() {
  it('Gets correct raw headers', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.deepStrictEqual(
        removeDates(cachedFetchResponse.headers.raw()),
        removeDates(standardFetchResponse.headers.raw()),
      );

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.deepStrictEqual(
          removeDates(cachedFetchResponse.headers.raw()),
          removeDates(standardFetchResponse.headers.raw()),
        );
        
        done();
      });
    });
  });

  it('Gets correct header keys', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.deepStrictEqual([...cachedFetchResponse.headers.keys()], [...standardFetchResponse.headers.keys()]);

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.deepStrictEqual([...cachedFetchResponse.headers.keys()], [...standardFetchResponse.headers.keys()]);
        
        done();
      });
    });
  });

  it('Gets correct header values', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.deepStrictEqual(
        removeDates([...cachedFetchResponse.headers.values()]),
        removeDates([...standardFetchResponse.headers.values()]),
      );

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.deepStrictEqual(
          removeDates([...cachedFetchResponse.headers.values()]),
          removeDates([...standardFetchResponse.headers.values()]),
        );
        
        done();
      });
    });
  });

  it('Gets correct header entries', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert.deepStrictEqual(
        removeDates([...cachedFetchResponse.headers.entries()]),
        removeDates([...standardFetchResponse.headers.entries()]),
      );

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.deepStrictEqual(
          removeDates([...cachedFetchResponse.headers.entries()]),
          removeDates([...standardFetchResponse.headers.entries()]),
        );
        
        done();
      });
    });
  });

  it('Can get a header by value', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert(standardFetchResponse.headers.get('content-length'));
      assert.deepStrictEqual(cachedFetchResponse.headers.get('content-length'), standardFetchResponse.headers.get('content-length'));

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.deepStrictEqual(cachedFetchResponse.headers.get('content-length'), standardFetchResponse.headers.get('content-length'));
        
        done();
      });
    });
  });

  it('Returns undefined for non-existent header', (done) => {
    const headerName = 'zzzz';
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert(!standardFetchResponse.headers.get(headerName));
      assert.deepStrictEqual(cachedFetchResponse.headers.get(headerName), standardFetchResponse.headers.get(headerName));

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.deepStrictEqual(cachedFetchResponse.headers.get(headerName), standardFetchResponse.headers.get(headerName));
        
        done();
      });
    });
  });

  it('Can get whether a header is present', (done) => {
    dualFetch(TWO_HUNDRED_URL).then(({cachedFetchResponse, standardFetchResponse}) => {
      assert(standardFetchResponse.headers.has('content-length'));
      assert.deepStrictEqual(cachedFetchResponse.headers.has('content-length'), standardFetchResponse.headers.has('content-length'));

      cachedFetch(TWO_HUNDRED_URL).then((cachedFetchResponse) => {
        assert.deepStrictEqual(cachedFetchResponse.headers.has('content-length'), standardFetchResponse.headers.has('content-length'));
        
        done();
      });
    });
  });
}).timeout(10000);

describe('Cache tests', function() {
  it('Uses cache', (done) => {
    cachedFetch(TWO_HUNDRED_URL).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL).then((res) => {
        assert.strictEqual(res.fromCache, true);
        
        done();
      });
    });
  });

  it('Can eject from cache', (done) => {
    cachedFetch(TWO_HUNDRED_URL).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL).then((res) => {
        assert.strictEqual(res.fromCache, true);

        res.ejectFromCache();

        cachedFetch(TWO_HUNDRED_URL).then((res) => {
          assert.strictEqual(res.fromCache, false);

          cachedFetch(TWO_HUNDRED_URL).then((res) => {
            assert.strictEqual(res.fromCache, true);
            
            done();
          });
        });
      });
    });
  });

  it('Does not error if ejecting from cache twice', (done) => {
    cachedFetch(TWO_HUNDRED_URL).then((res) => {
      assert.strictEqual(res.fromCache, false);

      res.ejectFromCache()
      res.ejectFromCache()
        
      done();
    });
  });

  it('Gives different string bodies different cache keys', (done) => {
    cachedFetch(TWO_HUNDRED_URL, post('a')).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL, post('b')).then((res) => {
        assert.strictEqual(res.fromCache, false);
        
        done();
      });
    });
  });

  it('Gives same string bodies same cache keys', (done) => {
    cachedFetch(TWO_HUNDRED_URL, post('a')).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL, post('a')).then((res) => {
        assert.strictEqual(res.fromCache, true);
        
        done();
      });
    });
  });

  it('Gives different URLSearchParams different cache keys', (done) => {
    cachedFetch(TWO_HUNDRED_URL, post(new URLSearchParams('a=a'))).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL, post(new URLSearchParams('a=b'))).then((res) => {
        assert.strictEqual(res.fromCache, false);
        
        done();
      });
    });
  });

  it('Gives same URLSearchParams same cache keys', (done) => {
    cachedFetch(TWO_HUNDRED_URL, post(new URLSearchParams('a=a'))).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL, post(new URLSearchParams('a=a'))).then((res) => {
        assert.strictEqual(res.fromCache, true);
        
        done();
      });
    });
  });

  it('Gives different read streams different cache keys', (done) => {
    const s1 = fs.createReadStream(path.join(__dirname, 'expected_png.png'));
    const s2 = fs.createReadStream(path.join(__dirname, '..', 'src', 'index.js'));

    cachedFetch(TWO_HUNDRED_URL, post(s1)).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL, post(s2)).then((res) => {
        assert.strictEqual(res.fromCache, false);
        
        done();
      });
    });
  });

  it('Gives the same read streams the same cache key', (done) => {
    const s1 = fs.createReadStream(path.join(__dirname, 'expected_png.png'));

    cachedFetch(TWO_HUNDRED_URL, post(s1)).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL, post(s1)).then((res) => {
        assert.strictEqual(res.fromCache, true);
        
        done();
      });
    });
  });

  it('Gives different form data different cache keys', (done) => {
    const data1 = new FormData();
    data1.append('a', 'a');

    const data2 = new FormData();
    data2.append('b', 'b');

    cachedFetch(TWO_HUNDRED_URL, post(data1)).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL, post(data2)).then((res) => {
        assert.strictEqual(res.fromCache, false);
        
        done();
      });
    });
  });

  it('Gives same form data same cache keys', (done) => {
    const data1 = new FormData();
    data1.append('a', 'a');

    const data2 = new FormData();
    data2.append('a', 'a');

    cachedFetch(TWO_HUNDRED_URL, post(data1)).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL, post(data2)).then((res) => {
        assert.strictEqual(res.fromCache, true);
        
        done();
      });
    });
  });

  it('Does not error with custom agent with circular properties', (done) => {
    const agent = new Agent();
    agent.agent = agent;

    cachedFetch(TWO_HUNDRED_URL, { agent }).then(() => {    
      done();
    })
  })
}).timeout(10000);

describe('Data tests', function() {
  it('Supports request objects', (done) => {
    let request = new standardFetch.Request(TWO_HUNDRED_URL, { body: 'test', method: 'POST' });
    cachedFetch(request).then((res) => {
      assert.strictEqual(res.fromCache, false);

      request = new standardFetch.Request(TWO_HUNDRED_URL, { body: 'test', method: 'POST' });
      cachedFetch(request).then((res) => {
        assert.strictEqual(res.fromCache, true);
        
        done();
      });
    });
  });

  it('Supports request objects with custom headers', (done) => {
    const request1 = new standardFetch.Request(TWO_HUNDRED_URL, { headers: { 'XXX': 'YYY' } });
    const request2 = new standardFetch.Request(TWO_HUNDRED_URL, { headers: { 'XXX': 'ZZZ' } });

    cachedFetch(request1).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(request2).then((res) => {
        assert.strictEqual(res.fromCache, false);
        
        done();
      });
    });
  });

  it('Refuses to consume body twice', (done) => {
    cachedFetch(TEXT_BODY_URL).then((res) => {
      res.text().then((res) => {

        try {
          res.text().then(() => {
            throw new Error('The above line should have thrown.');
          });
        } catch (err) {
          assert(err.message.includes('body used already for:'));
        }
        
        done();
      });  
    })
  });

  it('Can get text body', (done) => {
    cachedFetch(TEXT_BODY_URL).then((res) => {
      res.text().then((body) => {
        assert.strictEqual(body, TEXT_BODY_EXPECTED);
        assert.strictEqual(res.fromCache, false);

        cachedFetch(TEXT_BODY_URL).then((res) => {
          res.text().then((body) => {
            assert.strictEqual(body, TEXT_BODY_EXPECTED);
            assert.strictEqual(res.fromCache, true);
            
            done();
          });
        });
      });
    });
  });

  it('Can get JSON body', (done) => {
    cachedFetch(JSON_BODY_URL).then((res) => {
        res.json().then((body) => {
        assert(body.slideshow);
        assert.strictEqual(res.fromCache, false);

        cachedFetch(JSON_BODY_URL).then((res) => {
          res.json().then((body) => {
            assert(body.slideshow);
            assert.strictEqual(res.fromCache, true);
            
            done();
          });
        });
      });
    });
  });

  it('Can get PNG buffer body', (done) => {
    cachedFetch(PNG_BODY_URL).then((res) => {
      res.buffer().then((body) => {
        assert.strictEqual(expectedPngBuffer.equals(body), true);
        assert.strictEqual(res.fromCache, false);

        cachedFetch(PNG_BODY_URL).then((res) => {
          res.buffer().then((body) => {
            assert.strictEqual(expectedPngBuffer.equals(body), true);
            assert.strictEqual(res.fromCache, true);
            
            done();
          });
        });
      });
    });
  });


  it('Errors if the body type is not supported', (done) => {
    try {
      cachedFetch(TEXT_BODY_URL, { body: {} }).then(() => {
        throw new Error('It was supposed to throw');
      })
    } catch (err) {
      assert(err.message.includes('Unsupported body type'));
    } finally {
      done();
    }
  });

  it('Uses cache even if you make multiple requests at the same time', (done) => {
    Promise.all([
      cachedFetch(TWO_HUNDRED_URL),
      cachedFetch(TWO_HUNDRED_URL),
    ]).then(([res1, res2]) => {

      // One should be false, the other should be true
      assert(res1.fromCache !== res2.fromCache);
      
      done();
    });
  });
}).timeout(10000);

describe('Memory cache tests', function() {
  it('Supports TTL', (done) => {
    cachedFetch = FetchCache.withCache(new MemoryCache({ ttl: 100 }));
    cachedFetch(TWO_HUNDRED_URL).then((res) => {
      assert.strictEqual(res.fromCache, false);
      cachedFetch(TWO_HUNDRED_URL).then((res) => {
        assert.strictEqual(res.fromCache, true);

        wait(200).then(() => {

          cachedFetch(TWO_HUNDRED_URL).then((res) => {
            assert.strictEqual(res.fromCache, false);
            
            done();
          });
        });
      });
    });
  });
}).timeout(10000);

describe('File system cache tests', function() {
  it('Supports TTL', (done) => {
    cachedFetch = FetchCache.withCache(new FileSystemCache({ ttl: 100 }));
    cachedFetch(TWO_HUNDRED_URL).then((res) => {
      assert.strictEqual(res.fromCache, false);
      cachedFetch(TWO_HUNDRED_URL).then((res) => {
        assert.strictEqual(res.fromCache, true);

        wait(200).then(() => {

          cachedFetch(TWO_HUNDRED_URL).then((res) => {
            assert.strictEqual(res.fromCache, false);
            
            done();
          });
        });
      });
    });
  });

  it('Can get PNG buffer body', (done) => {
    cachedFetch = FetchCache.withCache(new FileSystemCache());
    cachedFetch(PNG_BODY_URL).then((res) => {
      res.buffer().then((body) => {
        assert.strictEqual(expectedPngBuffer.equals(body), true);
        assert.strictEqual(res.fromCache, false);

        cachedFetch(PNG_BODY_URL).then((res) => {
          res.buffer().then((body) => {
            assert.strictEqual(expectedPngBuffer.equals(body), true);
            assert.strictEqual(res.fromCache, true);
            
            done();
          });
        });
      });
    });
  });

  it('Can eject from cache', (done) => {
    cachedFetch = FetchCache.withCache(new FileSystemCache());

    cachedFetch(TWO_HUNDRED_URL).then((res) => {
      assert.strictEqual(res.fromCache, false);

      cachedFetch(TWO_HUNDRED_URL).then((res) => {
          assert.strictEqual(res.fromCache, true);

          res.ejectFromCache().then(() => {

          cachedFetch(TWO_HUNDRED_URL).then((res) => {
            assert.strictEqual(res.fromCache, false);

            cachedFetch(TWO_HUNDRED_URL).then((res) => {
              assert.strictEqual(res.fromCache, true);
              
              done();
            });
          });
        });
      });
    });
  });
});

describe('Cache mode tests', function() {
  it('Can use the only-if-cached cache control setting via init', (done) => {
    cachedFetch(TWO_HUNDRED_URL, { headers: { 'Cache-Control': 'only-if-cached' } }).then((res) => {
      assert(!res);
      cachedFetch(TWO_HUNDRED_URL, { headers: { 'Cache-Control': 'only-if-cached' } }).then((res) => {
        assert(!res);
        cachedFetch(TWO_HUNDRED_URL).then((res) => {
          assert(res && !res.fromCache);
          cachedFetch(TWO_HUNDRED_URL, { headers: { 'Cache-Control': 'only-if-cached' } }).then((res) => {
            assert(res && res.fromCache);
            res.ejectFromCache().then(() => {
              cachedFetch(TWO_HUNDRED_URL, { headers: { 'Cache-Control': 'only-if-cached' } }).then((res) => {
                assert(!res);
                
                done();
              });
            });
          });
        });
      });
    });
  });

  it('Can use the only-if-cached cache control setting via resource', (done) => {
    cachedFetch(new standardFetch.Request(TWO_HUNDRED_URL, { headers: { 'Cache-Control': 'only-if-cached' } })).then((res) => {
      assert(!res);
      cachedFetch(new standardFetch.Request(TWO_HUNDRED_URL)).then((res) => {
        assert(res && !res.fromCache);
        cachedFetch(new standardFetch.Request(TWO_HUNDRED_URL, { headers: { 'Cache-Control': 'only-if-cached' } })).then((res) => {
          assert(res && res.fromCache);
          
          done();
        });
      });
    });
  });
});

describe('Cache key tests', function() {
  it('Can calculate a cache key and check that it exists', (done) => {
    const cache = new MemoryCache();
    cachedFetch = FetchCache.withCache(cache);
    cachedFetch(TWO_HUNDRED_URL).then((x) => {

      const cacheKey = getCacheKey(TWO_HUNDRED_URL);
      const nonExistentCacheKey = getCacheKey(TEXT_BODY_URL);

      cache.get(cacheKey).then((cacheKeyResult) => {
        cache.get(nonExistentCacheKey).then((nonExistentCacheKeyResult) => {
  
          assert(cacheKeyResult);
          assert(!nonExistentCacheKeyResult);
          
          done();
        });
      });
    });
  });
});
