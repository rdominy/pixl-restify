TL;DR: Simplify development of JSON REST services using plain class methods that are shielded from knowledge of the transport (HTTP, encodings, etc.)

This module helps simplify writing REST APIs by inspecting your components for methods matching a naming scheme and creating REST endpoints.  It creates HTTP URL handlers for [pixl-server-web](https://github.com/jhuckaby/pixl-server-web) and dispatches calls to your methods.  It is built as a component of [pixl-server](https://github.com/jhuckaby/pixl-server), a lightweight framework for building node.js daemon applications.

* Focus on application logic instead of IO formatting
* Directly test your methods without mocking or running a web server
* Build your handlers using async/await instead of callbacks
* Throw exceptions and let *PixlRestify* handle the error response and logging

# Usage

# Creating a Simple REST API
~~~javascript
// myservice.js
const Component = require("pixl-server/component");

class MyService extends Component {
	constructor() {
		super();
		this.__name = "MyService";
		this.defaultConfig = {
		};
		this.counters = new Map();
	}

	// Handles HTTP GET /myservice/rest/v1.0/Counter?id=blah
	async getCounter(args) {
		if (this.counters.has(args.id)) {
			return {name: args.counter, value: this.counters.get(args.id)}
		}
		else {
			throw {code:'no_counter', message:"No counter defined for " + args.id};
		}
	}

	/*
		Handles POST /myservice/rest/v1.0/Counter
		{
			"id": "blah",
			"value": 42
		}
	*/
	async createCounter(args) {
		if (this.counters.has(args.id)) {
				throw {code:'counter_exists', message:"Counter already created for " + args.id};
		}
	
		var val = (typeof args.value != "undefined") parseInt(args.value) ? : 0;
		this.counters.set(args.id, val);
		
		return {id: args.id, value: val};	
	}
	
	/*
		Handles Put /myservice/rest/v1.0/Counter
		{
			"id": "blah"
		}
	*/
	async updateCounter(args) {
		if (this.counters.has(args.id)) {
			var val = (typeof args.value != "undefined") parseInt(args.value) ? : 1 + this.counters.get(args.id);
			this.counters.set(args.id, val);
			return {id: args.id, value: this.counters.get(args.id)}
		}
		else {
			throw {code:'no_counter', message:"No counter defined for " + args.id};
		}
	}
}
~~~

# Creating a Simple Server
~~~javascript
var PixlServer = require('pixl-server');

var server = new PixlServer({
		
		__name: 'MyServer',
		__version: "0.1",
		
		config: {
				"log_dir": "/var/tmp",
				"log_filename": "my_test.log",
				"debug_level": 9,
				"WebServer": {
					"http_port": 3080
				},
				"PixelRestify" : {
					"endpoints": [
						{
							"name": "MyService",
							"regex": "/myservice/rest/v1.0/(\\w+)"
						}
					]
				}
		},
		
		components: [
			require('pixl-server-web'),
			require('./my_service.js'),
			require('pixl-restify')

		]
		
});

server.startup( function() {
		console.log("Main startup");
});
~~~

# About Method handlers
## Default HTTP Method Mapping
The default mapping from component method to HTTP methods is defined below and can be overriden in the configuration.

~~~javascript
this.defaultConfig = {
	"methodMap": {
		"get" : "get",
		"create" : "post",
		"update" : "put",
		"delete" : "delete"
	}
};
~~~

For example if you name your method "updateMyWidget", the *PixlRestify* will route HTTP PUT requests for /MyWidget to your method.

## Method Arguments
Your method is passed *args*, *serverArgs* where 
* args: HTTP GET is the decoded query string, and for all other HTTP methods is the decoded HTTP body
* serverArgs: is the standard *pixl-server-web* parameter with request, response, etc. fields

## Return Values and Errors
Your method can return any of the following:
* Object: *PixlRestify* converts to JSON and will add a {code:0} element if *code* is missing
* String: *PixlRestify* responds with {code: 0, message:"your string"}
* true: If your method returns boolean true, it signifies that your method will handle the HTTP response itself

If your method throws an exception *PixlRestify* will try to find a code element and a message in the thrown object and return a JSON repsonse in the format of {code:"error_code", message:"Error details"}.  It will also log the error using *pixl-logger* with a stack trace if present.
 
 # Validation
 *PixlRestify* checks to see if your Component contains a *validate* method.  If it does the method is called for each request with the following arguments:
 * methodName: The name of the component method that will be called if validation succeeds
 * args: HTTP GET is the decoded query string, and for all other HTTP methods is the decoded HTTP body
 * serverArgs: is the standard *pixl-server-web* parameter with request, response, etc. fields

 You validation method should return one of the following:
 * true: if validation passed
 * object: an error object that you want *PixelRestify* to send back (typically {code: "err_code" message:"details"})

 Alternatively, you can validate in your method handler and throw when validation fails.