var async = require('async');
var redis = require('redis').createClient();
var store = require('..')({ client: redis });
var cache = require('autocache')({ store: store });

require('autocache/test/core')(cache, finalise);

function finalise(t) {
  t.test('finalise', function (t) {
    t.plan(5);

    function setKey(key) {
      return function (done) {
        redis.set('autocache:' + key, 'ok', function (er) {
          if (er) {
            return t.fail('failed to create test item');
          }
          t.pass('test item inserted');
          done();
        });
      };
    }

    async.waterfall([
      setKey('TEST'),
      setKey('TEST1'),
      setKey('TEST2'),
      setKey('TEST3'),
      function (done) {
        cache.clear(function () {
          setTimeout(function () {
            redis.keys('autocache:*', function (error, key) {
              t.equal(key.length, 0, 'keys remaining in redis: ' + key.length);
              redis.end();
              done();
            });
          }, 200);
        });
      },
    ]);
  });
}