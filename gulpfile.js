//
// Requires
//

const del = require('del');
const gulp = require('gulp');
const sourcemaps = require('gulp-sourcemaps');
const typescript = require('gulp-typescript');
const util = require('gulp-util');


//
// Constants
//

const RELEASE_MODE = 'production' in util.env;
const TS_INPUTS = ['src/**/*.ts'];
const RES_INPUTS = ['src/**/templates/**/*.yml'];
const DEST = 'dist';
const SOURCEMAPS = 'sourcemaps';


//
// Definitions
//

/**
 * Holds TypeScript compiler state for gulp-typescript.
 */
let tsProject = typescript.createProject('tsconfig.json');


//
// Tasks
//

function ts() {
    let tsResult = gulp.src(TS_INPUTS)
        .pipe(RELEASE_MODE ? util.noop() : sourcemaps.init())
        .pipe(tsProject());
    return tsResult.js
        .pipe(RELEASE_MODE ? util.noop() : sourcemaps.write(SOURCEMAPS))
        .pipe(gulp.dest(DEST));
}

function res() {
    return gulp.src(RES_INPUTS, { buffer: false })
        .pipe(gulp.dest(DEST));
}

function watch() {
    return gulp.watch(TS_INPUTS, ts);
}

function clean() {
    return del(DEST);
}

exports.ts = ts;
exports.res = res;
exports.watch = watch;
exports.clean = clean;
exports.default = gulp.series(ts, res);
