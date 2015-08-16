/*!
 * Autocache Redis
 * Copyright(c) 2015 Remy Sharp
 * Based on connect-redis by Copyright(c) 2012 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

var debug = require('debug')('autocache:store');
var redis = require('redis');
var port = 6379;
var host = '127.0.0.1';
var noop = function () {};
/**
 * Initialize RedisStore with the given `options`.
 *
 * @param {Object} options
 * @api public
 */

var cache = null;
var connected = false;

function RedisStore(options) {
  if (!(this instanceof RedisStore)) {
    return new RedisStore(options);
  }

  debug('new store');

  if (typeof options === 'function') {
    cache = options;
    options = {
      cache: cache
    };
  }

  if (options.cache) {
    cache = options.cache;
    delete options.cache;
    cache.configure({ store: new RedisStore(options) });
    return RedisStore;
  }

  var self = this;

  options = options || {};
  this.prefix = !options.prefix ? 'autocache:' : options.prefix;

  /* istanbul ignore next */
  if (options.url) {
    console.error('Warning: "url" param is deprecated and will be removed in a later release: use redis-url module instead');
    var url = require('url').parse(options.url);
    if (url.protocol === 'redis:') {
      if (url.auth) {
        var userparts = url.auth.split(':');
        options.user = userparts[0];
        if (userparts.length === 2) {
          options.pass = userparts[1];
        }
      }
      options.host = url.hostname;
      options.port = url.port;
      if (url.pathname) {
        options.db = url.pathname.replace('/', '', 1);
      }
    }
  }

  // convert to redis connect params
  if (options.client) {
    this.client = options.client;
  } else if (options.socket) {
    this.client = redis.createClient(options.socket, options);
  } else if (options.port || options.host) {
    this.client = redis.createClient(
      options.port || port,
      options.host || host,
      options
    );
  } else {
    this.client = redis.createClient(options);
  }

  if (options.pass) {
    this.client.auth(options.pass, function (err) {
      if (err) {
        throw err;
      }
    });
  }

  // this.ttl = options.ttl;
  // this.disableTTL = options.disableTTL;

  if ('db' in options) {
    if (typeof options.db !== 'number') {
      console.error('Warning: connect-redis expects a number for the "db" option');
    }

    self.client.select(options.db);
    self.client.on('connect', function () {
      self.client.send_anyways = true; // jshint ignore:line
      self.client.select(options.db);
      self.client.send_anyways = false; // jshint ignore:line
    });
  }

  self.client.on('error', function (er) {
    connected = false;
    if (cache) {
      cache.emit('disconnect', er);
    }
  });

  self.client.on('disconnect', function (er) {
    connected = false;
    if (cache) {
      cache.emit('disconnect', er);
    }
  });

  self.client.on('connect', function () {
    connected = true;
    debug('connected');
    if (cache) {
      debug('emitted to cache');
      cache.emit('connect');
    }
  });
}

RedisStore.prototype.dock = function dock(c) {
  cache = c;
  if (connected) {
    debug('emitted to cache');
    cache.emit('connect');
  }
};

RedisStore.prototype.toString = function () {
  return 'RedisStore()';
};

/**
 * Attempt to fetch session by the given `sid`.
 *
 * @param {String} sid
 * @param {Function} fn
 * @api public
 */

RedisStore.prototype.get = function (sid, fn) {
  var store = this;
  var psid = store.prefix + sid;
  if (!fn) {
    fn = noop;
  }

  debug('-> get');

  store.client.get(psid, function (er, data) {
    debug('<- get');
    if (er) {
      return fn(er);
    }

    if (!data) {
      return fn();
    }

    var result;
    data = data.toString();

    try {
      result = JSON.parse(data);
    }
    catch (er) {
      return fn(er);
    }
    return fn(null, result);
  });
};

RedisStore.prototype.clear = function (fn) {
  if (!fn) {
    fn = noop;
  }
  debug('-> clear');
  this.client.keys(this.prefix + '*', function (error, key) {
    this.client.del(key, function (error) {
      debug('<- clear');
      fn(error);
    });
  }.bind(this));
};

/**
 * Commit the given `sess` object associated with the given `sid`.
 *
 * @param {String} sid
 * @param {Session} sess
 * @param {Function} fn
 * @api public
 */

RedisStore.prototype.set = function (sid, value, fn) {
  var store = this;
  var psid = store.prefix + sid;
  if (!fn) {
    fn = noop;
  }

  try {
    value = JSON.stringify(value);
  }
  catch (er) {
    return fn(er);
  }

  debug('-> set');

  store.client.set(psid, value, function (er) {
    debug('<- set');
    if (er) {
      return fn(er);
    }
    fn.apply(null, arguments);
  });
};

/**
 * Destroy the session associated with the given `sid`.
 *
 * @param {String} sid
 * @api public
 */

RedisStore.prototype.destroy = function (sid, fn) {
  sid = this.prefix + sid;
  debug('-> clear one');
  this.client.del(sid, function (error, result) {
    debug('<- clear one');
    if (fn) fn(error, !!result);
  });
};

module.exports = RedisStore;