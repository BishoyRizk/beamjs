/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var bunyan = require("bunyan");

var log = bunyan.createLogger({

    name: "beam:autoincrement",
    streams: [{

        path: "./logs/error.log",
        level: "error"
    }],
    serializers: bunyan.stdSerializers
});

var SEQUENCES_COLLECTION = "__typesense_sequences";

/**
 * Typesense AutoIncrement Plugin
 * Replicates mongodb-autoincrement behavior using a dedicated
 * `__typesense_sequences` collection to track auto-increment counters.
 */
var TypesenseAutoIncrement = function (schema, options) {

    var { collectionName } = options || {};
    if (!collectionName) collectionName = schema.name;
    var client = options && options.client;
    if (!client) {

        throw new Error("TypesenseAutoIncrement" +
            " plugin requires a Typesense client in options");
    }
    // Mark schema wrapper as auto-increment enabled
    schema.autoIncrement = true;
    // Ensure the sequences collection exists
    client.collections(...[
        SEQUENCES_COLLECTION
    ]).retrieve().catch(function () {

        return client.collections().create({

            name: SEQUENCES_COLLECTION,
            fields: [{

                name: "id",
                type: "string",
                optional: false
            }, {

                name: "seq",
                type: "int64",
                optional: false
            }]
        });
    }).then(function () {

        // Initialize sequence entry for this collection if missing
        return client.collections(...[
            SEQUENCES_COLLECTION
        ]).documents(...[
            collectionName
        ]).retrieve().catch(function () {

            return client.collections(...[
                SEQUENCES_COLLECTION
            ]).documents().create({

                id: collectionName,
                seq: 0
            });
        });
    }).catch(function (e) {

        log.error({

            err: e,
            method: "autoincrement:init",
            collectionName
        });
    });
    schema.methods.generateAutoIncrementId = function () {

        return client.collections(...[
            SEQUENCES_COLLECTION
        ]).documents(...[
            collectionName
        ]).retrieve().then(function (doc) {

            var nextSeq = (doc.seq || 0) + 1;
            return client.collections(...[
                SEQUENCES_COLLECTION
            ]).documents(collectionName).update({

                seq: nextSeq
            }).then(function () {

                return String(nextSeq);
            });
        }).catch(function (e) {

            log.error({

                err: e,
                method: "autoincrement:generate",
                collectionName
            });
            throw e;
        });
    };
};

module.exports = TypesenseAutoIncrement;
