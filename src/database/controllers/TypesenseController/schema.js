/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var DataType = function (datatype) {

    if (typeof datatype === "function") {

        if (datatype === String) return "string";
        if (datatype === Number) return "float";
        if (datatype === Boolean) return "bool";
        if (datatype === Date) return "int64";
        if (datatype === Object) return "object";
        if (datatype === Array) return "auto";
        return "string";
    }
    if (Array.isArray(datatype)) {

        if (datatype.length > 0) {

            if (datatype[0] === String) return "string[]";
            if (datatype[0] === Number) return "float[]";
            if (datatype[0] === Boolean) return "bool[]";
            if (typeof datatype[0] === "function") {

                return "auto";
            }
            if (typeof datatype[0] === "object") {

                return "object[]";
            }
        }
        return "auto";
    }
    if (typeof datatype === "string") {

        return datatype;
    }
    if (typeof datatype === "object" && datatype !== null) {

        return "object";
    }
    return "auto";
};

var resolveAttributes = function (attributes, prefix) {

    if (!prefix) prefix = "";
    var fields = [];
    var schemaMapping = {};
    Object.keys(attributes).forEach(function (key) {

        var attr = attributes[key];
        var fieldName = key;
        if (prefix) {

            fieldName = prefix + "." + key;
        }
        var fieldSchema = { name: fieldName };
        if (typeof attr === "function") {

            fieldSchema.type = DataType(attr);
            fieldSchema.optional = true;
            schemaMapping[fieldName] = { type: attr };
            fields.push(fieldSchema);
        } else if (Array.isArray(attr) && attr.length > 0) {

            let isMany = typeof attr[0] === "object";
            isMany &= attr[0] !== null;
            isMany &= !attr[0].type;
            isMany &= !attr[0].foreignKey;
            if (isMany) {

                fieldSchema.type = "object[]";
                fieldSchema.optional = true;
                fields.push(fieldSchema);
                schemaMapping[fieldName] = {

                    type: "object[]",
                    schema: attr[0]
                };
                var nested = resolveAttributes(...[
                    attr[0], fieldName
                ]);
                fields = fields.concat(nested.fields);
                Object.assign(...[
                    schemaMapping, nested.schemaMapping
                ]);
            } else {

                fieldSchema.type = DataType(attr);
                fieldSchema.optional = true;
                schemaMapping[fieldName] = { type: attr };
                fields.push(fieldSchema);
            }
        } else if (typeof attr === "object" && attr !== null) {

            fieldSchema.type = "object";
            fieldSchema.optional = true;
            fields.push(fieldSchema);
            schemaMapping[fieldName] = {

                type: "object",
                schema: attr
            };
            var nestedDoc = resolveAttributes(...[
                attr, fieldName
            ]);
            fields = fields.concat(nestedDoc.fields);
            Object.assign(...[
                schemaMapping, nestedDoc.schemaMapping
            ]);
        }
        var isId = fieldName === "id";
        isId |= fieldName === "_id";
        if (isId) {

            var existed = fields.find(function (field) {

                return field.name === fieldName;
            });
            if (existed) {

                existed.name = "id";
                existed.type = "string";
                existed.optional = false;
            }
        }
    });
    var hasId = fields.some(function (field) {

        return field.name === "id";
    });
    if (!prefix && !hasId) {

        fields.push({

            name: "id",
            type: "string",
            optional: false
        });
    }
    return { fields: fields, schemaMapping: schemaMapping };
};

var resolveConstraints = function () {

    var [schema, constraints, schemaMapping] = arguments;
    if (!constraints) return;
    Object.keys(constraints).forEach(function (property) {

        var constraint = constraints[property];
        var constraining = typeof constraint === "object";
        constraining &= constraint !== null;
        if (!constraining) return;
        var field = schema.fields.find(function (field) {

            return field.name === property;
        });
        if (field) {

            if (constraint.type) {

                field.type = DataType(constraint.type);
            }
            if (constraint.required !== undefined) {

                field.optional = !constraint.required;
            }
            if (constraint.facet !== undefined) {

                field.facet = constraint.facet;
            }
            if (constraint.index !== undefined) {

                field.index = constraint.index;
            }
            if (constraint.sort !== undefined) {

                field.sort = constraint.sort;
            }
            if (constraint.locale !== undefined) {

                field.locale = constraint.locale;
            }
            if (constraint.infix !== undefined) {

                field.infix = constraint.infix;
            }
            if (constraint.stem !== undefined) {

                field.stem = constraint.stem;
            }
            if (constraint.num_dim !== undefined) {

                field.num_dim = constraint.num_dim;
            }
            if (constraint.store !== undefined) {

                field.store = constraint.store;
            }
            if (constraint.range_index !== undefined) {

                field.range_index = constraint.range_index;
            }
            if (constraint.embed !== undefined) {

                field.embed = constraint.embed;
            }
            if (schemaMapping) {

                if (!schemaMapping[property]) {

                    schemaMapping[property] = {};
                }
                Object.assign(...[
                    schemaMapping[property], constraint
                ]);
            }
        } else {

            // Collection-level settings
            if ([
                "synonyms", "overrides", "stopwords",
                "conversation_models", "nl_search_models"
            ].includes(property)) {
                schema[property] = constraints[property];
            } else if (property === "default_sorting_field") {

                schema.default_sorting_field = constraint;
            } else if (property === "symbols_to_index") {

                schema.symbols_to_index = constraint;
            } else if (property === "token_separators") {

                schema.token_separators = constraint;
            } else if (property === "enable_nested_fields") {

                schema.enable_nested_fields = constraint;
            } else if (property === "voice_query_model") {

                schema.voice_query_model = constraint;
            }
        }
    });
};

var validateConstraints = function () {

    var [data, schemaMapping, prefix] = arguments;
    if (!prefix) prefix = "";
    var processed = {};
    for (var key in data) {

        var fieldName = key;
        if (prefix) {

            fieldName = prefix + "." + key;
        }
        var mapping = schemaMapping[fieldName];
        var val = data[key];
        if (mapping) {

            var isOne = mapping.type === "object";
            isOne &= typeof mapping.schema === "object";
            isOne &= typeof val === "object";
            isOne &= val !== null;
            if (isOne) {

                processed[key] = validateConstraints(...[
                    val, mapping.schema, fieldName
                ]);
                continue;
            }
            let isMany = mapping.type === "object[]";
            isMany &= Array.isArray(val);
            if (isMany) {

                processed[key] = val;
                continue;
            }
            var required = !!mapping.required;
            required &= val === undefined || val === null;
            if (required) {

                throw new Error("Field " + fieldName +
                    " is required");
            }
            var typeFn = mapping.type || mapping;
            if (val !== undefined && val !== null) {

                if (typeFn === String) {

                    val = String(val);
                } else if (typeFn === Number) {

                    val = Number(val);
                } else if (typeFn === Boolean) {

                    val = Boolean(val);
                } else if (typeFn === Date) {

                    val = new Date(val).getTime();
                } else if (typeof typeFn === "function") {

                    val = typeFn(val);
                }
                if (typeFn === Number) {

                    var isMin = mapping.min !== undefined;
                    isMin &= val < mapping.min;
                    if (isMin) {

                        throw new Error(fieldName +
                            " below min " + mapping.min);
                    }
                    var isMax = mapping.max !== undefined;
                    isMax &= val > mapping.max;
                    if (isMax) {

                        throw new Error(fieldName +
                            " above max " + mapping.max);
                    }
                }
                if (typeFn === String) {

                    let invalid = !!mapping.enum;
                    invalid &= !mapping.enum.includes(val);
                    if (invalid) {

                        throw new Error(fieldName +
                            " not in enum");
                    }
                    invalid = !!mapping.match;
                    invalid &= !mapping.match.test(val);
                    if (invalid) {

                        throw new Error(fieldName +
                            " fails regex match");
                    }
                }
                var outputKey = key;
                if (key === "_id" && !prefix) {

                    outputKey = "id";
                }
                processed[outputKey] = val;
            }
        }
    }
    return processed;
};

var resolvePaths = function () {

    var attributes = arguments[0];
    var Model = arguments[1];
    var getModelObjects = function () {

        var wrapper = arguments[0];
        var wrapperCtx = arguments[1];
        var properties = arguments[2];
        var property = arguments[3];
        var index = arguments[4];
        var value = arguments[5];
        var toMany = arguments[6];
        return wrapper.reduce(function () {

            var modelObjects = arguments[0];
            var modelObject = arguments[1];
            if (typeof modelObject !== "object") {

                return modelObjects;
            }
            if (modelObject instanceof Date) {

                return modelObjects;
            }
            var many = Array.isArray(modelObject);
            var integer = Number.isInteger(...[
                Number(property)
            ]);
            if (many && !integer) {

                return [
                    ...modelObjects,
                    ...getModelObjects(...[
                        modelObject,
                        wrapperCtx,
                        properties,
                        property,
                        index,
                        value,
                        toMany
                    ])
                ];
            }
            if (index === properties.length - 1) {

                var Type = wrapperCtx.attributes;
                var castable = typeof Type === "function";
                if (castable) {

                    modelObject[property] = new Type(value);
                } else modelObject[property] = value;
            } else if (!modelObject[property]) {

                modelObject[property] = toMany ? [{}] : {};
            }
            if (toMany) {

                return [
                    ...modelObjects,
                    ...[].concat(modelObject[property])
                ];
            } else modelObjects.push(modelObject[property]);
            return modelObjects;
        }, []);
    };
    Object.defineProperty(Model.prototype, "self", {

        enumerable: true,
        get() {

            var self = this;
            return {

                set(path, value) {

                    var setting = typeof path === "string";
                    if (setting) setting &= path.length > 0;
                    if (setting) {

                        path.split(".").reduce(function () {

                            var wrapper = arguments[0];
                            var property = arguments[1];
                            var index = arguments[2];
                            var properties = arguments[3];
                            var Type = wrapper.attributes;
                            var toMany = Array.isArray(Type);
                            if (toMany) Type = Type[0];
                            if (typeof Type !== "object") {

                                return wrapper;
                            }
                            if (Type instanceof Date) {

                                return wrapper;
                            }
                            var integer = Number.isInteger(...[
                                Number(property)
                            ]);
                            if (!toMany || !integer) {

                                Type = Type[property];
                            }
                            return {

                                modelObjects: getModelObjects(...[
                                    wrapper.modelObjects,
                                    wrapper,
                                    properties,
                                    property,
                                    index,
                                    value,
                                    toMany
                                ]),
                                attributes: Type || {}
                            };
                        }, {

                            modelObjects: [self],
                            attributes: attributes
                        });
                    }
                }
            };
        }
    });
};

module.exports = {

    resolveAttributes,
    resolveConstraints,
    validateConstraints,
    resolvePaths
};
