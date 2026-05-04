/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var backend = require("backend-js");
var { QueryExpression } = backend;
var {
    getPipeline
} = require("./pipeline");

module.exports.LogicalOperators = {

    AND: "&&",
    OR: "||",
    NOT: "!"
};

var ComparisonOperators = module.exports.ComparisonOperators = {

    EQUAL: ":",
    EQUALIGNORECASE: function (value) {

        return { operator: ":", value: value, ignoreCase: true };
    },
    NE: ":!=",
    NEIGNORECASE: function (value) {

        return { operator: ":!=", value: value, ignoreCase: true };
    },
    LT: ":<",
    LE: ":<=",
    GT: ":>",
    GE: ":>=",
    IN: ":",
    INIGNORECASE: function (value) {

        return { operator: ":", value: value, ignoreCase: true };
    },
    NIN: ":!=",
    NINIGNORECASE: function (value) {

        return { operator: ":!=", value: value, ignoreCase: true };
    },
    CONTAINS: ":",
    ANYMATCH: function (query) { return query; },
    CASEINSENSITIVECOMPARE: function (query) { return query; }
};

ComparisonOperators.IGNORECASE = ComparisonOperators.CASEINSENSITIVECOMPARE;

module.exports.ComputationOperators = {

    FIELD: function (fieldName) { return fieldName; },
    LITERAL: function (value) { return value; }
};

module.exports.adapter = {

    getValue: function (val) {

        var escape = function (val) {

            if (typeof val !== "string") {

                return val;
            }
            return val.replace(...[
                /`/g, "\\`"
            ]).replace(/[\n\r]/g, " ");
        };
        if (Array.isArray(val)) {

            var isString = val.length > 0;
            isString &= typeof val[0] === "string";
            var joined = val.map(function (value) {

                if (isString) {

                    return "`" + escape(value) + "`";
                }
                return value;
            }).join(", ");
            return "[" + joined + "]";
        }
        if (typeof val === "string") {

            return "`" + escape(val) + "`";
        }
        return val;
    },
    getQuery: function (queryExpressions, contextualLevel) {

        if (contextualLevel < 0) {

            throw new Error("Invalid contextual level");
        }
        if (Array.isArray(queryExpressions)) {

            if (queryExpressions.length === 1) {

                let queryExpression = queryExpressions[0];
                var {
                    fieldName,
                    fieldValue,
                    comparisonOperator: comparisonOp,
                    comparisonOperatorOptions: comparisonOpts
                } = queryExpression;
                var opStr = "";
                var valStr = "";
                if (typeof comparisonOp === "string") {

                    opStr = comparisonOp;
                    valStr = this.getValue(fieldValue);
                } else if (comparisonOp && typeof comparisonOp === "object") {

                    opStr = comparisonOp.operator;
                    valStr = this.getValue(comparisonOp.value);
                }
                if (typeof comparisonOpts === "function") {

                    var subFilter = {};
                    subFilter[opStr] = valStr;
                    subFilter = comparisonOpts.apply(...[
                        ComparisonOperators, [
                            subFilter,
                            queryExpression
                        ]
                    ]);
                    var keys = Object.keys(subFilter);
                    if (keys.length > 0) {

                        opStr = keys[0];
                        valStr = subFilter[opStr];
                    }
                }
                return "" + fieldName + opStr + valStr;
            }
            for (var j = 0; j <= contextualLevel; j++) {

                for (var i = 1; i < queryExpressions.length; i++) {

                    let queryExpression = queryExpressions[i];
                    var splitting = queryExpressions.length === 2;
                    splitting |= queryExpression.contextualLevel === j;
                    if (splitting) {

                        var { logicalOperator } = queryExpression;
                        var rightFilter = this.getQuery(...[
                            queryExpressions.splice(i),
                            contextualLevel + 1
                        ]);
                        var leftFilter = this.getQuery(...[
                            queryExpressions, contextualLevel + 1
                        ]);
                        var inducing = !!logicalOperator;
                        inducing &= !!leftFilter;
                        inducing &= !!rightFilter;
                        if (inducing) {

                            return "(" + leftFilter + " " +
                                logicalOperator + " " + rightFilter +
                                ")";
                        } else return leftFilter || rightFilter || null;
                    }
                }
            }
        }
        return null;
    },
    constructQuery: function (queryExpressions, features) {

        var many = Array.isArray(queryExpressions);
        var qValue = "*";
        var queryByFields = [];
        if (many) queryExpressions.forEach(function (queryExpression) {

            if (!(queryExpression instanceof QueryExpression)) {

                throw new Error("Invalid query expressions");
            }
            var {
                logicalOperator,
                contextualLevel,
                fieldName,
                fieldValue
            } = queryExpression;
            var index = queryExpressions.indexOf(queryExpression);
            if (index > 0 && !logicalOperator) {

                throw new Error("Query expression " +
                    "missing logical operator");
            }
            if (index > 0 && typeof contextualLevel !== "number") {

                throw new Error("Query expression " +
                    "missing contextual level");
            }
            var isQ = fieldName === "_q";
            isQ |= fieldName === "q";
            if (isQ) {

                qValue = fieldValue;
                queryExpression._ignore = true;
            }
            var queryBy = fieldName === "_query_by";
            queryBy |= fieldName === "query_by";
            if (queryBy) {

                if (Array.isArray(fieldValue)) {

                    queryByFields.push.apply(...[
                        queryByFields, fieldValue
                    ]);
                } else queryByFields.push(fieldValue);
                queryExpression._ignore = true;
            }
        });
        var queryExpressionsCopy = [];
        if (queryExpressions) {

            queryExpressionsCopy = queryExpressions.filter(function (qe) {

                return !qe._ignore;
            }).slice();
        }
        var filter_by = this.getQuery(queryExpressionsCopy, 0);
        var {
            distinct,
            include,
            exclude,
            sort,
            paginate,
            limit,
            page,
            cache
        } = features;
        var query = {

            q: qValue,
            query_by: "id"
        };
        if (queryByFields.length > 0) {

            query.query_by = queryByFields.join(",");
        }
        if (filter_by) {

            query.filter_by = filter_by;
        }
        if (typeof distinct === "string") {

            query.group_by = distinct;
            query.group_limit = 1;
        } else if (Array.isArray(include)) {

            query.include_fields = include.join(",");
        } else if (Array.isArray(exclude)) {

            query.exclude_fields = exclude.join(",");
        }
        if (Array.isArray(sort)) {

            query.sort_by = sort.map(function (opt) {

                if (typeof opt === "object") {

                    if (typeof opt.by !== "string") {

                        throw new Error("Invalid sort by" +
                            " field name");
                    }
                    var order = "asc";
                    var desc = typeof opt.order === "string";
                    desc &= opt.order.toLowerCase() === "desc";
                    if (desc) {

                        order = "desc";
                    }
                    return opt.by + ":" + order;
                }
                return opt;
            }).join(",");
        }
        if (paginate || typeof limit === "number") {

            query.per_page = limit || 10;
            query.page = page || 1;
        }
        if (cache) query.use_cache = true;
        Object.assign(query, getPipeline(features));
        return query;
    }
};

module.exports.getQueryUniqueArray = function () {

    var filterExpressions = arguments[0];
    var queryExpressions = arguments[1];
    var features = arguments[2];
    var uniqueArray = [];
    if (Array.isArray(filterExpressions)) {

        uniqueArray = uniqueArray.concat(filterExpressions);
    }
    if (Array.isArray(queryExpressions)) {

        uniqueArray = uniqueArray.concat(queryExpressions);
    }
    if (features && features.output) {

        uniqueArray.push(features.output);
    }
    return uniqueArray;
};
