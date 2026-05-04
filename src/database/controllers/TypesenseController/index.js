/*jslint node: true */
/*jshint esversion: 6 */
"use strict";

var {
    LogicalOperators,
    ComparisonOperators,
    ComputationOperators
} = require("./query");
var {
    ModelController
} = require("./model");

module.exports.LogicalOperators = LogicalOperators;
module.exports.ComparisonOperators = ComparisonOperators;
module.exports.ComputationOperators = ComputationOperators;

module.exports.getModelControllerObject = function () {

    var options = arguments[0];
    var cb = arguments[1];
    var KEY = arguments[2];
    var nodes = (options || {}).nodes;
    var uri = (options || {}).uri;
    var apiKey = (options || {}).apiKey;
    var defaultNodes = [{

        host: "127.0.0.1",
        port: "8108",
        protocol: "http"
    }];
    // Parse URI into nodes if nodes not provided directly
    if (!nodes && uri) try {

        var parsedUrl = new URL(uri);
        var port = "80";
        if (parsedUrl.port || (parsedUrl.protocol === "https:")) {

            port = parsedUrl.port || "443";
        }
        nodes = [{

            host: parsedUrl.hostname,
            port,
            protocol: parsedUrl.protocol.replace(":", "")
        }];
    } catch (e) {

        nodes = defaultNodes;
    }
    if (!nodes) nodes = defaultNodes;
    if (!apiKey) apiKey = "xyz";
    if (!options) options = {};
    options.nodes = nodes;
    options.apiKey = apiKey;
    return new ModelController(null, function () {

        cb.apply(this, arguments);
    }, options, KEY);
};
