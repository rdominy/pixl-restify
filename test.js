const assert = require("assert"),
	fs = require("fs"),
	PixlRestify = require('./pixl-restify.js'),
	PixlRequest = require('pixl-request'),
	PixlServer = require('pixl-server');

const SERVER_URL = 'http://localhost:3080/myservice/rest/v1.0/';

function cleanup() {
	try {
		fs.unlinkSync('/var/tmp/pixl_restify_unittest.log');
	}
	catch (e) {
		// ignore
	} 
}

function createServer(callback) {
	var server = new PixlServer({
			
			__name: 'MyServer',
			__version: "0.1",
			
			config: {
					"log_dir": "/var/tmp",
					"log_filename": "pixl_restify_unittest.log",
					"debug_level": 9,
					"debug": true,
					"WebServer": {
						"http_port": 3080
					},
					"PixlRestify" : {
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
				MyService,
				require('./pixl-restify.js')

			]
			
	});

	server.startup( function() {
			callback(null, server);
	});
}

const Component = require("pixl-server/component");

class MyService extends Component {
	constructor() {
		super();
		this.__name = "MyService";
		this.defaultConfig = {
		};
		this.counters = new Map();
	}

	validate(method, args) {
		return (typeof args.id == "undefined") ? "missing_param" : true;
	}
	
	// Handles HTTP GET /myservice/rest/v1.0/Counter?id=blah
	async getCounter(args) {
		this.logDebug(5, "getCounter");
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
		this.logDebug(5, "createCounter");
		if (this.counters.has(args.id)) {
				throw {code:'counter_exists', message:"Counter already created for " + args.id};
		}
	
		var val = (typeof args.value != "undefined") ? parseInt(args.value) : 0;
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
		this.logDebug(5, "updateCounter");
		if (this.counters.has(args.id)) {
			var val = (typeof args.value != "undefined") ? parseInt(args.value) : 1 + this.counters.get(args.id);
			this.counters.set(args.id, val);
			return {id: args.id, value: this.counters.get(args.id)}
		}
		else {
			throw {code:'no_counter', message:"No counter defined for " + args.id};
		}
	}
}

describe('PixlRestify', function() {
	describe('Methods', function() {
		it('getResponseObject', function() {
			var response = null;
			
			// Check error repsonses
			response = PixlRestify.getResponseObject("oh crap");
			assert.deepEqual(response, {code: "oh crap", message:"no details"});
			response = PixlRestify.getResponseObject(13);
			assert.deepEqual(response, {code: 13, message:"no details"});
			response = PixlRestify.getResponseObject(new Error("foo"));
			assert.deepEqual(response, {code: "unknown", message:"foo"});
			response = PixlRestify.getResponseObject({code: 13, message:"A bad thing happened"});
			assert.deepEqual(response, {code: 13, message:"A bad thing happened"});
			response = PixlRestify.getResponseObject({a:1, b:2});
			assert.deepEqual(response, {code: "unknown", message:"{\"a\":1,\"b\":2}"});
			response = PixlRestify.getResponseObject("oh crap", {foo:1}); //Errors trump values
			assert.deepEqual(response, {code: "oh crap", message:"no details"});
			
			// Check good responses
			var notDefined;
			response = PixlRestify.getResponseObject(notDefined, {foo:1});
			assert.deepEqual(response, {code: 0, foo:1});
			response = PixlRestify.getResponseObject(notDefined, {foo:1, code:"good"});
			assert.deepEqual(response, {code: "good", foo:1});
			response = PixlRestify.getResponseObject(notDefined, "Hello");
			assert.deepEqual(response, {code: 0, message:"Hello"});
			response = PixlRestify.getResponseObject(null, true);
			assert.equal(response, true);
			
			response = PixlRestify.getResponseObject(null, 3);
			assert.deepEqual(response, {code: 0, message:3});
			response = PixlRestify.getResponseObject(null, null);
			assert.deepEqual(response, {code: 0, message:null});
		})
	})
	describe('Test server', function() {
		var server = null;
		var request = new PixlRequest("PixlRestify/Unittest");

		before('create server', function(done) {
			this.timeout(5000);
			cleanup();
			createServer( function(err, serverObj) {
				assert(!err);
				assert(serverObj);
				server = serverObj;
				done();
			});
		})
		after('shutdown server', function(done) {
			if (server)
				server.shutdown(function() {
					done();
				});
				//cleanup();
		})
		
		it('create counter', function(done) {
			request.json(`${SERVER_URL}Counter`, {id:"foo",value:12}, function(err, resp, data) {
				assert.ifError(err);
				assert(data);
				assert.deepEqual(data, {id:"foo",value:12, code: 0});
				done();
			})
		})
		it('get counter', function(done) {
			request.json(`${SERVER_URL}Counter?id=foo`, null, function(err, resp, data) {
				assert.ifError(err);
				assert(data);
				assert.deepEqual(data, {value:12, code: 0});
				done();
			})
		})
		it('get counter - bad id', function(done) {
			request.json(`${SERVER_URL}Counter?id=bar`, null, function(err, resp, data) {
				assert.ifError(err);
				assert(data);
				assert.deepEqual(data, {code:'no_counter', message:"No counter defined for bar"});
				done();
			})
		})
		it('no handler', function(done) {
			request.json(`${SERVER_URL}Stuff?id=bar`, null, function(err, resp, data) {
				assert.ifError(err);
				assert(data);
				assert.equal(data.code, 'no_handler');
				assert(data.message);
				done();
			})
		})	
		it('failed validation', function(done) {
			request.json(`${SERVER_URL}Counter?foo=bar`, null, function(err, resp, data) {
				assert.ifError(err);
				assert(data);
				assert.equal(data.code, 'missing_param', JSON.stringify(data));
				done();
			})
		})	
		it('increment counter', function(done) {
			request.json(`${SERVER_URL}Counter`, {id:"foo"}, {method: "PUT"}, function(err, resp, data) {
				assert.ifError(err);
				assert(data);
				assert.equal(data.id, "foo");
				assert.equal(data.value, 13);
				done();
			})
		})
		it('update counter with value', function(done) {
			request.json(`${SERVER_URL}Counter`, {id:"foo", value:20}, {method: "PUT"}, function(err, resp, data) {
				assert.ifError(err);
				assert(data);
				assert.equal(data.id, "foo");
				assert.equal(data.value, 20);
				done();
			})
		})
	})
})
		