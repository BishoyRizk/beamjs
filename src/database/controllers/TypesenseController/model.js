/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var Typesense = require("typesense");
var bunyan = require("bunyan");
var define = require("define-js");
var backend = require("backend-js");
var {
    ModelEntity: Entity
} = backend;
var {
    resolveAttributes,
    resolveConstraints,
    validateConstraints,
    resolvePaths
} = require("./schema");
var {
    adapter
} = require("./query");
var {
    getExecutePipeline
} = require("./pipeline");

var log = bunyan.createLogger({

    name: "beam",
    streams: [{

        path: "./logs/error.log",
        level: "error"
    }],
    serializers: bunyan.stdSerializers
});

var sessions = {};

var NullIfUndefined = function (value) {

    return value === undefined ? null : value;
};

var getExecuteQuery = function (session) {

    return function () {

        var queryExpressions = arguments[0];
        var filterExpressions = arguments[1];
        let ObjectConstructor = arguments[2];
        var features = arguments[3];
        var callback = arguments[4];
        var {
            distinct,
            readonly,
            paginate
        } = features;
        var allExpressions = [
            ...(Array.isArray(queryExpressions) ? queryExpressions : []),
            ...(Array.isArray(filterExpressions) ? filterExpressions : [])
        ];
        var query = session.adapter.constructQuery(...[
            allExpressions, features
        ]);
        let { collectionName } = ObjectConstructor;
        session.client.collections(...[
            collectionName
        ]).documents().search(...[
            query
        ]).then(function (result) {

            if (typeof distinct === "string") {

                return callback([...(
                    result.grouped_hits || []
                )].map(function (hit) {

                    return hit.group_key[0];
                }));
            }
            var makeObject = function (doc) {

                if (doc.id && !doc._id) {

                    doc._id = doc.id;
                }
                if (readonly) {

                    return Object.assign({}, doc);
                }
                return new ObjectConstructor(doc);
            };
            var modelObjects = [];
            if (result.hits) {

                modelObjects = result.hits.map(...[
                    function (hit) {

                        return makeObject(...[
                            hit.document
                        ]);
                    }
                ]);
            }
            if (paginate) callback({

                rows: modelObjects,
                count: result.out_of,
                page: result.page
            }); else callback(modelObjects);
        }).catch(function (err) {

            log.error({

                database: session.database,
                err,
                collectionName,
                method: "search"
            });
            callback(null, err);
        });
    };
};

var ModelController = function (defaultURI, cb, options, KEY) {

    var self = this;
    self.type = "typesense";
    var Session = define(function (init) {

        return function () {

            var self = init.apply(this, arguments).self();
            self.database = KEY;
            self.adapter = Object.assign(...[
                {}, adapter, { database: KEY }
            ]);
        };
    }).extend(Array).defaults();
    var session = new Session();
    var client;
    if (!sessions[KEY]) {

        var nodes = (options || {}).nodes;
        var apiKey = (options || {}).apiKey;
        var {
            connectionTimeoutSeconds = 5,
            numRetries = 3,
            retryIntervalSeconds = 0.1,
            healthcheckIntervalSeconds = 60,
            useServerSideSearchCache = false,
            cacheSearchResultsForSeconds = 0
        } = options || {};
        client = new Typesense.Client({

            nodes: nodes || [{

                host: "127.0.0.1",
                port: "8108",
                protocol: "http"
            }],
            apiKey: apiKey || "xyz",
            connectionTimeoutSeconds,
            numRetries,
            retryIntervalSeconds,
            healthcheckIntervalSeconds,
            useServerSideSearchCache,
            cacheSearchResultsForSeconds
        });
        sessions[KEY] = {

            client: client,
            session: new Session(),
            collections: {}
        };
        client.health.retrieve().then(function () {

            if (cb) cb.apply(self, [null, KEY]);
        }).catch(function (err) {

            log.error({

                database: KEY,
                err: err,
                method: "healthcheck"
            });
            if (cb) cb.apply(self, err);
        });
    } else {

        client = sessions[KEY].client;
        session = sessions[KEY].session;
        if (cb) cb.apply(self, [null, KEY]);
    }
    self.save = function (callback, modelObjects) {

        var modelsToSave = modelObjects || session;
        if (modelsToSave.length === 0) {

            if (typeof callback === "function") {

                callback(null);
            }
            return;
        }
        var promises = modelsToSave.map(function (model) {

            let { collectionName } = model.constructor;
            var dbSession = sessions[KEY];
            var schemaDef = dbSession.collections[
                collectionName
            ];
            var data = resolveConstraints(...[
                model, schemaDef.schemaMapping
            ]);
            var id = model.id || model._id;
            let {
                hooks,
                autoIncrement,
                methods
            } = schemaDef.schemaWrapper || {};
            var executeSave = function (docId, docData) {

                if (hooks && hooks.beforeSave) {

                    hooks.beforeSave(docData);
                }
                if (docId) {

                    return client.collections(...[
                        collectionName
                    ]).documents().upsert(...[
                        docData
                    ]).then(function (res) {

                        if (res.id && !res._id) {

                            res._id = res.id;
                        }
                        Object.assign(model, res);
                        return model;
                    });
                } else return client.collections(...[
                    collectionName
                ]).documents().create(...[
                    docData
                ]).then(function (res) {

                    if (res.id && !res._id) {

                        res._id = res.id;
                    }
                    Object.assign(model, res);
                    return model;
                });
            };
            var hasAutoIncrement = !id;
            hasAutoIncrement &= !!autoIncrement;
            hasAutoIncrement &= !!methods;
            if (autoIncrement) {

                let {
                    generateAutoIncrementId: generateId
                } = methods;
                hasAutoIncrement &= !!generateId;
            }
            if (hasAutoIncrement) {

                return methods[
                    "generateAutoIncrementId"
                ]().then(function (newId) {

                    data.id = newId;
                    return executeSave(newId, data);
                });
            } else return executeSave(id, data);
        });
        Promise.all(promises).then(function () {

            if (typeof callback === "function") {

                callback(null);
            }
        }).catch(function (err) {

            if (typeof callback === "function") {

                callback(err);
            }
        });
    };
    self.removeObjects = function () {

        var objWrapper = arguments[0];
        var entity = arguments[1];
        var callback = arguments[2];
        if (!entity || !(entity instanceof Entity)) {

            throw new Error("Invalid entity");
        }
        if (typeof objWrapper !== "object") {

            throw new Error("Invalid query " +
                "expressions wrapper");
        }
        self.save(function (err) {

            if (err) {

                if (typeof callback === "function") {

                    callback(null, err);
                }
            } else {

                var queryExpressions = [
                    ...(objWrapper.getObjectQuery() || []),
                    ...(entity.getObjectQuery() || [])
                ];
                var features = entity.getObjectFeatures() || {};
                var query = session.adapter.constructQuery(...[
                    queryExpressions, features
                ]);
                let {
                    collectionName
                } = entity.getObjectConstructor(KEY);
                var filterBy = query.filter_by;
                if (!filterBy) filterBy = "id:!=__impossible__";
                client.collections(...[
                    collectionName
                ]).documents().delete({

                    filter_by: filterBy
                }).then(function (result) {

                    if (typeof callback === "function") {

                        return NullIfUndefined(callback(...[
                            result.num_deleted, null
                        ]));
                    }
                    return null;
                }).catch(function (error) {

                    if (typeof callback === "function") {

                        callback(null, error);
                    }
                });
            }
        }, session.filter(function (modelObject) {

            let { getObjectConstructor } = entity;
            let ObjectConstructor = getObjectConstructor(KEY);
            return modelObject instanceof ObjectConstructor;
        }));
    };
    self.addObjects = function () {

        var objsAttributes = arguments[0];
        var entity = arguments[1];
        var callback = arguments[2];
        if (!entity || !(entity instanceof Entity)) {

            throw new Error("Invalid entity");
        }
        var modelObjects = [];
        var addObject = function (objAttributes) {

            let { getObjectConstructor } = entity;
            let ObjectConstructor = getObjectConstructor(KEY);
            var modelObject = new ObjectConstructor(...[
                objAttributes
            ]);
            session.push(modelObject);
            modelObjects.push(modelObject);
        };
        if (Array.isArray(objsAttributes)) {

            objsAttributes.forEach(addObject);
        } else addObject(objsAttributes);
        if (typeof callback === "function") {

            callback(modelObjects);
        }
        if (modelObjects.length === 1) {

            return modelObjects[0];
        }
        return modelObjects;
    };
    self.getObjects = function () {

        var objWrapper = arguments[0];
        var entity = arguments[1];
        var callback = arguments[2];
        if (!entity || !(entity instanceof Entity)) {

            throw new Error("Invalid entity");
        }
        if (typeof objWrapper !== "object") {

            throw new Error("Invalid query " +
                "expressions wrapper");
        }
        self.save(function (error) {

            if (error) {

                if (typeof callback === "function") {

                    return NullIfUndefined(callback(...[
                        null, error
                    ]));
                }
            } else {

                var queryExpressions = [
                    ...(objWrapper.getObjectQuery() || []),
                    ...(entity.getObjectQuery() || [])
                ];
                var aggregateExpressions = [
                    ...(objWrapper.getObjectAggregate() || []),
                    ...(entity.getObjectAggregate() || [])
                ];
                var filterExpressions = [
                    ...(objWrapper.getObjectFilter() || [])
                ];
                var features = entity.getObjectFeatures() || {};
                var aggregate = features.aggregate;
                var mapReduce = features.mapReduce;
                var output = features.output;
                var aggregating = aggregateExpressions.length > 0;
                if (!aggregating) {

                    aggregating = typeof aggregate === "object";
                    if (aggregating) {

                        aggregating = Object.keys(...[
                            aggregate
                        ]).length > 0;
                    }
                }
                if (aggregating) {

                    if (typeof callback === "function") {

                        callback(null, new Error("This" +
                            " feature is not implemented" +
                            " yet for Typesense (aggregating)"));
                    }
                    return;
                }
                var mapReducing = typeof mapReduce === "object";
                if (mapReducing) {

                    var {
                        map,
                        reduce
                    } = mapReduce;
                    mapReducing &= typeof map === "function";
                    mapReducing &= typeof reduce === "function";
                }
                if (mapReducing) {

                    if (typeof callback === "function") {

                        callback(null, new Error("This" +
                            " feature is not implemented" +
                            " yet for Typesense (mapReduce)"));
                    }
                    return;
                }
                var piplelining = output === "conversation";
                piplelining |= output === "vector";
                piplelining |= output === "nl";
                if (piplelining) {

                    getExecutePipeline(...[
                        sessions[KEY], getExecuteQuery
                    ])(...[
                        queryExpressions,
                        filterExpressions,
                        entity.getObjectConstructor(KEY),
                        features,
                        callback
                    ]);
                } else getExecuteQuery(sessions[KEY])(...[
                    queryExpressions,
                    filterExpressions,
                    entity.getObjectConstructor(KEY),
                    features,
                    callback
                ]);
            }
        }, session.filter(function (modelObject) {

            let { getObjectConstructor } = entity;
            let ObjectConstructor = getObjectConstructor(KEY);
            return modelObject instanceof ObjectConstructor;
        }));
    };
};

ModelController.defineEntity = function () {

    var name = arguments[0];
    var attributes = arguments[1];
    var plugins = arguments[2];
    var constraints = arguments[3];
    var database = arguments[4];
    if (typeof name !== "string") {

        throw new Error("Invalid entity name");
    }
    if (!sessions[database]) {

        throw new Error("Typesense client is" +
            " not initialized");
    }
    var dbSession = sessions[database];
    var client = dbSession.client;
    var resolved = resolveAttributes(attributes);
    var fields = resolved.fields;
    var schemaMapping = resolved.schemaMapping;
    var schema = {

        name: name,
        fields: fields
    };
    resolveConstraints(...[
        schema, constraints, schemaMapping
    ]);
    // Schema wrapper to mimic mongoose Schema plugin interface
    var schemaWrapper = {

        name: name,
        fields: fields,
        methods: {},
        statics: {},
        hooks: {},
        plugin: function (pluginFn, options) {

            pluginFn(this, options);
        }
    };
    if (Array.isArray(plugins)) {

        for (var i = 0; i < plugins.length; i++) {

            if (typeof plugins[i] === "function") {

                schemaWrapper.plugin(plugins[i], {

                    database,
                    client,
                    collectionName: name
                });
            }
        }
    }
    dbSession.collections[name] = {

        schemaMapping,
        schemaWrapper
    };
    client.collections(...[
        name
    ]).retrieve().catch(function () {

        return client.collections().create(schema);
    }).then(function () {

        if (constraints) {

            var {
                synonyms,
                overrides,
                stopwords
            } = constraints;
            // Sync Synonyms
            if (Array.isArray(synonyms)) {

                synonyms.forEach(function (syn) {

                    if (syn.id) {

                        client.collections(...[
                            name
                        ]).synonyms(syn.id).upsert(...[
                            syn
                        ]).catch(function (e) {

                            log.error({ err: e });
                        });
                    }
                });
            }
            // Sync Overrides (Curation)
            if (Array.isArray(overrides)) {

                overrides.forEach(function (ovr) {

                    if (ovr.id) {

                        client.collections(...[
                            name
                        ]).overrides(ovr.id).upsert(...[
                            ovr
                        ]).catch(function (e) {

                            log.error({ err: e });
                        });
                    }
                });
            }
            // Sync Stopwords
            var hasStopwords = !!stopwords;
            if (hasStopwords) {

                hasStopwords &= !!stopwords.id;
            }
            if (hasStopwords) client.stopwords(...[
                stopwords.id
            ]).upsert({

                stopwords: stopwords.words
            }).catch(function (e) {

                log.error({ err: e });
            });
        }
    }).catch(function (err) {

        log.error({

            database,
            err,
            method: "createCollection",
            collectionName: name
        });
    });
    let {
        methods,
        statics
    } = schemaWrapper;
    class Model {

        constructor(data) {

            Object.assign(this, validateConstraints(...[
                data || {}, schemaMapping
            ]));
        }
    }
    for (var method in methods) {

        if (methods.hasOwnProperty(method)) {

            Model.prototype[method] = methods[method];
        }
    }
    Model.collectionName = name;
    Model.database = database;
    for (var staticMethod in statics) {

        if (statics.hasOwnProperty(staticMethod)) {

            Model[staticMethod] = statics[
                staticMethod
            ].bind(Model);
        }
    }
    resolvePaths(attributes, Model);
    return Model;
};

ModelController.prototype.constructor = ModelController;

module.exports = { ModelController };
