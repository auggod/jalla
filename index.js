var path = require('path')
var assert = require('assert')
var crypto = require('crypto')
var {get} = require('koa-route')
var serve = require('koa-static')
var ui = require('./lib/ui')
var App = require('./lib/app')
var defer = require('./lib/defer')
var style = require('./lib/style')
var script = require('./lib/script')
var render = require('./lib/render')
var manifest = require('./lib/manifest')
var serviceWorker = require('./lib/service-worker')

module.exports = start

function start (entry, opts = {}) {
  assert(typeof entry === 'string', 'jalla: entry should be type string')
  entry = absolute(entry)

  var dir = path.dirname(entry)
  var sw = opts.sw && absolute(opts.sw, dir)
  var css = opts.css && absolute(opts.css, dir)
  var app = new App()
  app.entry = entry
  app.silent = true
  app.base = opts.base || ''
  app.context.assets = {}

  if (!opts.quiet) ui(app)

  app.on('progress', onprogress)
  app.on('bundle:script', onbundle)
  app.on('bundle:style', onbundle)

  app.use(async function (ctx, next) {
    var start = Date.now()
    await next()
    app.emit('timing', Date.now() - start, ctx)
  })

  app.use(require('koa-conditional-get')())
  app.use(require('koa-etag')())

  if (process.env.NODE_ENV !== 'development') {
    app.use(defer(app, (ctx, next) => next()))
  }

  if (sw) app.use(serviceWorker(sw, path.basename(sw, '.js'), app))
  app.use(style(css, 'bundle', app))
  app.use(script(entry, 'bundle', app))

  if (app.env === 'development') app.use(serve(dir, {maxage: 0}))
  app.use(serve(path.resolve(dir, 'assets'), {maxage: 1000 * 60 * 60 * 24 * 365}))
  app.use(get('/manifest.json', manifest(app)))

  app.use(render(entry, app))

  return app

  // add to context asset directory
  function onprogress (file, uri, progress) {
    app.context.assets[uri] = { file: file }
  }

  // add bundle output to context asset directory
  function onbundle (file, uri, buff) {
    var hash = crypto.createHash('sha512').update(buff).digest('buffer')
    var path = app.env === 'development' ? 'dev' : hash.toString('hex').slice(0, 16)
    app.context.assets[uri].url = `${app.base}/${path}/${uri}`
    app.context.assets[uri].hash = hash
    app.context.assets[uri].buffer = buff
  }
}

// resolve file path (relative to dir) to absolute path
// (str, str?) -> str
function absolute (file, dir = '') {
  if (path.isAbsolute(file)) return file
  return path.resolve(dir, file)
}
