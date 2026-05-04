/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

/**
 * Typesense Timestamps Plugin
 * Automatically adds createdAt and updatedAt (int64) fields
 * and sets them during beforeSave.
 */
var TypesenseTimestamps = function (schema, options) {

    var hasCreatedAt = schema.fields.some(function (f) {

        return f.name === 'createdAt';
    });
    if (!hasCreatedAt) {

        schema.fields.push({

            name: 'createdAt',
            type: 'int64',
            optional: true
        });
    }
    var hasUpdatedAt = schema.fields.some(function (f) {

        return f.name === 'updatedAt';
    });
    if (!hasUpdatedAt) {

        schema.fields.push({

            name: 'updatedAt',
            type: 'int64',
            optional: true
        });
    }
    schema.hooks = schema.hooks || {};
    var oldBeforeSave = schema.hooks.beforeSave;
    if (!oldBeforeSave) {

        oldBeforeSave = function () { };
    }
    schema.hooks.beforeSave = function (data) {

        oldBeforeSave(data);
        var now = Date.now();
        if (!data.id && !data._id) {

            data.createdAt = now;
        }
        data.updatedAt = now;
    };
};

module.exports = TypesenseTimestamps;
