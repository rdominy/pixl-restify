"use strict";
// PixlRestify Server Component
// Copyright (c) 2019 Robert Dominy
// Released under the MIT License

const Component = require("pixl-server/component");

class PixlRestify extends Component {
	constructor() {
		super();		
		this.__name = "PixlRestify";
		this.defaultConfig = {
			methodMap: {
				"get" : "get",
				"create" : "post",
				"update" : "put",
				"delete" : "delete"
			}
		};
	}
	
	/* 
		The dispatchMap is a map of maps where
		primary key:   http method (put, post, etc) 
		secondary key: URI Object as in /reel/rest/v1.0/Object?stuff (Batch, BatchList, etc.)
		value: method handler to call
	*/
	createEmptyDispatchMap() {
 		let dispatchMap = new Map();
		const methodMap = this.config.get('methodMap');
 		for (const method in methodMap) {
 			dispatchMap.set(methodMap[method], new Map());
 		}
		return dispatchMap;
	}
	
	/*
	 Converts an error or JSON result into standard JSON REST response
	 Errors: {"code": "err_code", "message":"someone put the foo into bar"}
	 Regular: {"code":0, yourResults...}
	*/
	static getResponseObject(err, resultObj) {
		let response = null;

		if (err) {
			response = {code: "unknown", message: "no details"};

			if (typeof err == "number") {
				response.code = err;
			}
			else if (typeof err == "string") {
				if (err.length > 15) {
					response.message = err;
				}
				else {
					response.code = err;
				}
			}
			else if (typeof err == "object") {
				if (err.code) {
					response.code = err.code;
				}
				if (err.message) {
					response.message = err.message;
				}
				else {
					response.message = JSON.stringify(err);
				}
			}
		}
		else {
			if (resultObj === true) {
				// true means the handler handled the http response itself, so just pass that up the chain
				response = true;
			}
			else if (["string", "number", "boolean"].includes(typeof resultObj) || resultObj==null) {
				response = {code: 0, message: resultObj}
			}
			else {
				response = resultObj;
				if (typeof response.code == "undefined") {
					response.code = 0;
				}
			}
		}
		return response;
	}
	
	/*
		Called during webserver startup, look for configured endpoints and register the URL handlers
	*/
	startup(callback) {
		this.logger = this.server.logger;

		if (this.server.WebServer && this.config.get('endpoints')) { 
			this.config.get('endpoints').forEach((item) =>  {
				this.registerEndpoints(this.server[item.name], this.server.WebServer, new RegExp(item.regex));
			})
		}

		callback();
	}
	
	//	Inspect component properties looking for methods with correct method prefix and create a mapping of endpoint handlers
	registerEndpoints(serviceObj, pixlWebServer, regex) {
		const names = Object.getOwnPropertyNames(Object.getPrototypeOf(serviceObj));
		let dispatchMap = this.createEmptyDispatchMap();

		names.forEach((method) => {
			if (typeof serviceObj[method] == 'function') {
				let mapping = this.mapMethod(method);
				if (mapping!=null) {
				dispatchMap.get(mapping.httpMethod).set(mapping.endPointName, {
						name: method,
						validate: (serviceObj.validate) ? serviceObj.validate.bind(serviceObj, method) : null,
						handler: serviceObj[method].bind(serviceObj)});
				}
			}
		});

		if (this.logger.shouldLog(6)) {
			let out = {};
			for (const [key, value] of dispatchMap) {
				out[key] = {};
				for (const [method, endpoint] of value) {
					out[key][method] = endpoint.name;
				}
			}
			this.logger.debug(6, "DispatchMap for " + regex.toString(), out);
		}

		pixlWebServer.addURIHandler(regex, serviceObj.__name, false, (args, httpCallback) => {
				this.dispatch(args, httpCallback, dispatchMap, regex);
			});	
	}
	
	// Test if method prefix is one of the configured HTTP methods and return info to be stored in the map
	mapMethod(methodName) {
		let results = null;
		const methodMap = this.config.get('methodMap');
		for (const methodPrefix in methodMap) {
			if (methodName.indexOf(methodPrefix)==0) {
				results = {
					httpMethod: methodMap[methodPrefix],
					endPointName: methodName.substring(methodPrefix.length)
				};
				break;
			}
		}
		return results;
	}
	
	// Called by pixl-server-web to handle HTTP requests
	// This method finds the matching handler, calls it and packages up the JSON response
	async dispatch(args, httpCallback, dispatchMap, regex) {
		const method = args.request.method.toLowerCase();
		// First find mappings the the HTTP method (GET, POST, etc.)
		if (dispatchMap.has(method)) {
			const matches = args.request.url.match(regex);
			
			// Next see if we have an endpoint that handles the operation for the extracted object
			if (matches && matches.length > 1 && dispatchMap.get(method).has(matches[1])) {
				const endpoint = dispatchMap.get(method).get(matches[1]);
				const destArgs = (method == 'get') ? args.query : args.params;
				
				this.logger.debug(8, "Dispatching HTTP call for " + args.request.url, destArgs);
				let results = null;
				let err = null;
				
				try {
					// If the endpoint has a validator pass the input arguments into that
					let isValid = true;
					if (endpoint.validate) {
						const validation = endpoint.validate(destArgs, args); // Method name is passed first by earlier binding
						if (validation!==true) {
							isValid = false;
							err = validation;
						}
					}
					
					if (isValid) {
						// Validation passed, attempt to call the handler
						results = await endpoint.handler(destArgs, args);
						this.logger.debug(8, "Results of HTTP call for " + args.request.url, results);
					}

					results = PixlRestify.getResponseObject(err, results);				
				}
				catch (e) {
					results = PixlRestify.getResponseObject(e, null);
					this.logger.error(e.code, "Error calling " + args.request.url, {err: results, stack: (e.stack)?JSON.stringify(e.stack):""});
				}
				
				httpCallback(results);
			}
			else {
				const message = "No handler found for URI: " + args.request.url;
				this.logger.debug(5, `PixlRestify.dispatch error ${message}`);
				httpCallback({code: 'no_handler', message: message} );
			}
		}
		else {
			const message = "unsupported method: " + method + " url: " + args.request.url;
			this.logger.debug(5, `PixlRestify.dispatch error  ${message}`);
			httpCallback({code: 'unsupported_method', message: message} );
		}
	}
}

module.exports = PixlRestify;
