/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var crypto = require("crypto");

/**
 * Typesense Secret Plugin
 * Automatically generates a 32-byte cryptographic random hex `secret`
 * during beforeSave if one doesn't exist.
 */
var TypesenseSecret = function (schema, options) {

    var hasSecret = schema.fields.some(function (f) {

        return f.name === 'secret';
    });
    if (!hasSecret) {

        schema.fields.push({

            name: 'secret',
            type: 'string',
            optional: true,
            index: false
        });
    }
    schema.hooks = schema.hooks || {};
    var oldBeforeSave = schema.hooks.beforeSave;
    if (!oldBeforeSave) {

        oldBeforeSave = function () { };
    }
    schema.hooks.beforeSave = function (data) {

        oldBeforeSave(data);
        if (!data.secret) {

            data.secret = crypto.randomBytes(32).toString("hex");
        }
    };
    schema.methods.generateNewSecret = function (callback) {

        this.secret = crypto.randomBytes(32).toString("hex");
        if (typeof callback === "function") {

            callback(null, this.secret);
        }
        return this.secret;
    };
};

module.exports = TypesenseSecret;
