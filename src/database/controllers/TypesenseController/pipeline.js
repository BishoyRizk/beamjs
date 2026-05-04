/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var bunyan = require("bunyan");
var {
    QueryExpression
} = require("backend-js");
var {
    resolveConstraints
} = require("./schema");
var {
    adapter,
    getQueryUniqueArray
} = require("./query");

var log = bunyan.createLogger({

    name: "beam:pipeline",
    streams: [{

        path: "./logs/error.log",
        level: "error"
    }],
    serializers: bunyan.stdSerializers
});

var getPipeline = function (features) {

    var pipeline = {};
    var {
        nl,
        conversation,
        voice,
        vector
    } = features;
    // 1. Natural Language Query
    if (nl) {

        pipeline.nl_query = true;
        let isObject = typeof nl === "object";
        let isString = typeof nl === "string";
        if (isObject && nl.model_id) {

            pipeline.nl_model_id = nl.model_id;
        } else if (isString) {

            pipeline.nl_model_id = features.nl;
        }
    }
    // 2. Conversation / RAG Chat
    if (conversation) {

        pipeline.conversation = true;
        let isObject = typeof conversation === "object";
        let isString = typeof conversation === "string";
        if (isObject) {

            var {
                model_id,
                conversation_id
            } = conversation;
            if (model_id) {

                pipeline.conversation_model_id = model_id;
            }
            if (conversation_id) {

                pipeline.conversation_id = conversation_id;
            }
        } else if (isString) {

            pipeline.conversation_model_id = conversation;
        }
    }
    // 3. Voice Search
    if (voice) {

        let isObject = typeof voice === "object";
        let isString = typeof voice === "string";
        if (isObject && voice.voice_query) {

            pipeline.voice_query = voice.voice_query;
        } else if (isString) {

            pipeline.voice_query = voice;
        }
    }
    // 4. Vector Query
    if (vector) {

        let isObject = typeof vector === "object";
        let isString = typeof vector === "string";
        if (isObject && vector.vector_query) {

            pipeline.vector_query = vector.vector_query;
        } else if (isString) {

            pipeline.vector_query = vector;
        }
    }
    return pipeline;
};

var getExecutePipeline = function (session, getExecuteQuery) {

    return function () {

        var queryExpressions = arguments[0];
        var filterExpressions = arguments[1];
        var ObjectConstructor = arguments[2];
        var features = arguments[3];
        var callback = arguments[4];
        var output = features.output;
        var collectionName = ObjectConstructor.collectionName;
        // Step 1: Initial Filter (Hybrid Search without the output target)
        var step1Features = Object.assign({}, features);
        delete step1Features.output;
        delete step1Features[output];
        getExecuteQuery(session)(...[
            queryExpressions,
            filterExpressions,
            ObjectConstructor,
            step1Features,
            function (result, step1Err) {

                if (step1Err) {

                    var cbErr = null;
                    if (callback) {

                        callback(null, step1Err);
                    }
                    return cbErr;
                }
                var docs = result;
                if (step1Features.paginate) {

                    docs = result.rows;
                }
                var count = docs.length;
                if (step1Features.paginate) {

                    count = result.count;
                }
                if (count === 0) {

                    var cbZero = null;
                    if (callback) {

                        callback(step1Features.paginate ? {

                            rows: [],
                            count: 0,
                            page: 1
                        } : []);
                    }
                    return cbZero;
                }
                if (count > 1000) {

                    var queryUniqueArray = getQueryUniqueArray(...[
                        filterExpressions,
                        queryExpressions,
                        features
                    ]);
                    var queryHash = JSON.stringify(...[
                        queryUniqueArray
                    ]).split("").reduce(function (number, string) {

                        return number / string.codePointAt(0);
                    }, 9999).toString().replace("e-", "").slice(-4);
                    var prefix = output.charAt(0).toUpperCase();
                    prefix += output.slice(1);
                    var tempCollection = prefix;
                    tempCollection += collectionName.toUpperCase();
                    tempCollection += queryHash;
                    var schemaDef = session.collections[
                        collectionName
                    ];
                    var schemaClone = Object.assign(...[
                        {},
                        schemaDef.schemaWrapper,
                        { name: tempCollection }
                    ]);
                    session.client.collections().create(...[
                        schemaClone
                    ]).then(function () {

                        var documents = docs.map(function (doc) {

                            return resolveConstraints(...[
                                doc, schemaDef.schemaMapping
                            ]);
                        });
                        return session.client.collections(...[
                            tempCollection
                        ]).documents().import(...[
                            documents,
                            { action: "create" }
                        ]);
                    }).then(function () {

                        var step2Features = Object.assign(...[
                            {}, features
                        ]);
                        var step2Query = adapter.constructQuery(...[
                            [], step2Features
                        ]);
                        return session.client.collections(...[
                            tempCollection
                        ]).documents().search(step2Query);
                    }).then(function (step2Result) {

                        session.client.collections(...[
                            tempCollection
                        ]).delete().catch(function (e) {

                            log.error({ err: e });
                        });
                        var finalDocs = [...[
                            step2Result.hits || []
                        ]].map(function (hit) {

                            return new ObjectConstructor(...[
                                hit.document
                            ]);
                        });
                        if (features.paginate) {

                            callback({

                                rows: finalDocs,
                                count: step2Result.out_of,
                                page: step2Result.page
                            });
                        } else callback(finalDocs);
                    }).catch(function (tempErr) {

                        if (callback) {

                            callback(null, tempErr);
                        }
                    });
                } else {

                    // Standard id:IN[...] fallback
                    var ids = docs.map(function (doc) {

                        return doc.id || doc._id;
                    });
                    var step2Features = Object.assign(...[
                        {}, features
                    ]);
                    var step2Expressions = [
                        new QueryExpression({
                            fieldName: "id",
                            comparisonOperator: ":",
                            fieldValue: ids
                        })
                    ];
                    getExecuteQuery(session)(...[
                        step2Expressions,
                        [],
                        ObjectConstructor,
                        step2Features,
                        callback
                    ]);
                }
            }]
        );
    };
};

module.exports = {

    getPipeline,
    getExecutePipeline
};
