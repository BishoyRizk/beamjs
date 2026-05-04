/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var bcrypt = require("bcrypt");

/**
 * Typesense Hashed Property Plugin
 * Automatically intercepts the specified field (default: 'password')
 * and cryptographically encodes it using bcrypt during beforeSave.
 * The plaintext field is removed; a `hashed_<field>` field is stored instead.
 */
var TypesenseHashedProperty = function (schema, options) {

    var fieldName = (options && options.field) || "password";
    var hashedFieldName = "hashed_" + fieldName;
    var hasHashedField = schema.fields.some(function (f) {

        return f.name === hashedFieldName;
    });
    if (!hasHashedField) {

        schema.fields.push({

            name: hashedFieldName,
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
        if (data[fieldName]) {

            data[
                hashedFieldName
            ] = bcrypt.hashSync(data[fieldName], 10);
            delete data[fieldName];
        }
    };
    schema.methods.verifyPassword = function (plaintext) {

        var hashed = this[hashedFieldName];
        if (!hashed) return false;
        return bcrypt.compareSync(plaintext, hashed);
    };
};

module.exports = TypesenseHashedProperty;
