/*jslint node: true, indent: 4 */
/* eslint-disable no-console */
'use strict';
var fs = require('fs'),
    async = require('async'),
    config = require('./configuration'),
    admin = require('./admin'),
    commands = require('./commands'),
    database = require('./database');
var browser,
    messageBus,
    sockModules = [];

async.waterfall([
    admin.load,
    function (cb) {
        fs.readdir('./sock_modules/', cb);
    },
    function (files, cb) {
        files.filter(function (name) {
            return name[0] !== '.' && /[.]js$/.test(name);
        }).forEach(function (name) {
            var module;
            try {
                module = require('./sock_modules/' + name);
            } catch (e) {
                console.log('Error in Module ' + name + ': ' + e.message);
                return;
            }
            if (isNaN(module.priority)) {
                module.priority = 50;
            }
            if (!module.configuration || module.configuration.enabled) {
                console.warn('Ignoring module: `' + (module.name || name) +
                    '` Does not default to disabled');
            } else {
                sockModules.push(module);
                console.log('Loaded module: ' +
                    module.name + ' v' + module.version);
            }
        });
        sockModules.sort(function (a, b) {
            return a.priority - b.priority;
        });
        cb();
    },
    function (cb) {
        config = config.loadConfiguration(sockModules, admin,
            process.argv[2]);
        browser = require('./discourse');
        messageBus = require('./messageBus');
        sockModules = sockModules.filter(function (module) {
            return config.modules[module.name].enabled;
        });
        sockModules.unshift(admin);
        sockModules.unshift(commands);
        commands.loadModules(sockModules);
        admin.setModules(sockModules);
        cb();
    },
    function (cb) {
        browser.login(function () {
            cb();
        });
    },
    function (cb) {
        if (!config.user) {
            // login failed. what can we do?
            throw 'Login failed';
        }
        console.log('Logged in as: ' + config.user.user.username);
        database.begin(browser, config);
        sockModules.forEach(function (module) {
            if (typeof module.begin !== 'function') {
                return;
            }
            console.log('Starting module: ' + module.name);
            module.begin(browser, config);
        });
        messageBus.begin(sockModules, admin);
        cb();
    }
]);
