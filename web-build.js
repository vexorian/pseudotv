var fs = require('fs');
var path = require('path');
var browserify = require('browserify');
var watchify = require('watchify');
var babelify = require('babelify');
var sass = require('sass');


const plugin = [];

const WATCH = process.argv[2] && process.argv[2] === '--watch';

if(WATCH) {
  console.log('Running on Watch Mode...')
  plugin.push(watchify);
}

var browserifyRunner = browserify({
  entries: ['web/app.js'],
  cache: {},
  packageCache: {},
  plugin
}).transform(babelify);

if(WATCH) {
  browserifyRunner.on('update', bundle);
}

function bundle() {
  console.log('update...');
  browserifyRunner.bundle()
    .on('error', console.error)
    .pipe(fs.createWriteStream('web/public/bundle.js'));
}

function bundleStyles() {
  sass.render({file: 'web/public/styles/main.scss'}, (err, result) => {
    if(err) {
      console.error(err);
    } else {
      // console.log(result);
      fs.writeFileSync(path.join(__dirname, 'web', 'public', 'style.css'), result.css)
    }
  });
}

function watchStylesChanges() {
  fs.watch(path.join(__dirname, 'web', 'public', 'styles'), () => {
    bundleStyles();
  });
}

if(WATCH) {
  watchStylesChanges();
}

bundle();
bundleStyles();
