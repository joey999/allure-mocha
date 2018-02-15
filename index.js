"use strict";
var Base = require("mocha").reporters.Base;
var Allure = require("allure-js-commons");
var allureReporter = new Allure();
var Runtime = require("allure-js-commons/runtime");
var utils = require("./utils.js");
var diff = require('diff');

global.allure = new Runtime(allureReporter);

var objToString = Object.prototype.toString;

function sameType (a, b) {
    return objToString.call(a) === objToString.call(b);
}

function color(type, str) {
    //if (!exports.useColors) {
        return String(str);
    //}
    //return '\u001b[' + exports.colors[type] + 'm' + str + '\u001b[0m';
};

function colorLines (name, str) {
    return str.split('\n').map(function (str) {
        return color(name, str);
    }).join('\n');
}

function unifiedDiff (err, escape) {
    var indent = '      ';
    function cleanUp (line) {
        if (escape) {
            line = escapeInvisibles(line);
        }
        if (line[0] === '+') {
            return indent + colorLines('diff added', line);
        }
        if (line[0] === '-') {
            return indent + colorLines('diff removed', line);
        }
        if (line.match(/@@/)) {
            return null;
        }
        if (line.match(/\\ No newline/)) {
            return null;
        }
        return indent + line;
    }
    function notBlank (line) {
        return typeof line !== 'undefined' && line !== null;
    }
    var msg = diff.createPatch('string', err.actual, err.expected);
    var lines = msg.split('\n').splice(4);
    return '\n      ' +
        colorLines('diff added', '+ expected') + ' ' +
        colorLines('diff removed', '- actual') +
        '\n\n' +
        lines.map(cleanUp).filter(notBlank).join('\n');
}

function FormatError(err) {
    var fmt = color('error title', '  %s) %s:\n') +
        color('error message', '     %s') +
        color('error stack', '\n%s\n');

    var msg;
    var message;

    if (err.message && typeof err.message.toString === 'function') {
        message = err.message + '';
    } else if (typeof err.inspect === 'function') {
        message = err.inspect() + '';
    } else {
        message = '';
    }
    var stack = err.stack || message;
    var index = message ? stack.indexOf(message) : -1;
    var actual = err.actual;
    var expected = err.expected;
    var escape = true;

    var actual = err.actual;
    var expected = err.expected;
    var escape = true;

    if (index === -1) {
        msg = message;
    } else {
        index += message.length;
        msg = stack.slice(0, index);
        // remove msg from stack
        stack = stack.slice(index + 1);
    }

    // uncaught
    if (err.uncaught) {
        msg = 'Uncaught ' + msg;
    }
    // explicitly show diff
    if (err.showDiff !== false && sameType(actual, expected) && expected !== undefined) {
        escape = false;
        if (!(utils.isString(actual) && utils.isString(expected))) {
            err.actual = actual = utils.stringify(actual);
            err.expected = expected = utils.stringify(expected);
        }

        fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
        var match = message.match(/^([^:]+): expected/);
        msg = '\n      ' + color('error message', match ? match[1] : msg);

        if (exports.inlineDiffs) {
            msg += inlineDiff(err, escape);
        } else {
            msg += unifiedDiff(err, escape);
        }
    }

    // indent stack trace
    stack = stack.replace(/^/gm, '  ');

    return { message: msg, stack: stack }
}

/**
 * Initialize a new `Allure` test reporter.
 *
 * @param {Runner} runner
 * @param {Object} opts mocha options
 * @api public
 */
function AllureReporter(runner, opts) {
    Base.call(this, runner);
    allureReporter.setOptions(opts.reporterOptions || {});

    function invokeHanlder(handler) {
        return function() {
            try {
                return handler.apply(this, arguments);
            } catch(error) {
                console.error("Internal error in Allure:", error); // eslint-disable-line no-console
            }
        };
    }

    runner.on("suite", invokeHanlder(function (suite) {
        allureReporter.startSuite(suite.fullTitle());
    }));

    runner.on("suite end", invokeHanlder(function () {
        allureReporter.endSuite();
    }));

    runner.on("test", invokeHanlder(function(test) {
        if (typeof test.currentRetry !== "function" || !test.currentRetry()) {
          allureReporter.startCase(test.title);
        }
    }));

    runner.on("pending", invokeHanlder(function(test) {
        var currentTest = allureReporter.getCurrentTest();
        if(currentTest && currentTest.name === test.title) {
            allureReporter.endCase("skipped");
        } else {
            allureReporter.pendingCase(test.title);
        }
    }));

    runner.on("pass", invokeHanlder(function() {
        allureReporter.endCase("passed");
    }));

    runner.on("fail", invokeHanlder(function(test, err) {
        if(!allureReporter.getCurrentTest()) {
            allureReporter.startCase(test.title);
        }
        var status = err.name === "AssertionError" ? "failed" : "broken";
        if(global.onError) {
            global.onError(err);
        }
        allureReporter.endCase(status, FormatError(err));
    }));

    runner.on("hook end", invokeHanlder(function(hook) {
        if(hook.title.indexOf('"after each" hook') === 0) {
            allureReporter.endCase("passed");
        }
    }));
}

module.exports = AllureReporter;
