// Required module
var mosca = Meteor.npmRequire('mosca');
Future = Npm.require('fibers/future');

// Mosca parameters
if (process.env.ROOT_URL == "http://localhost:3000/") {
  var ascoltatore = {
    type: 'mongo',
    // Enter your local MongoDB path here
    url: 'mongodb://127.0.0.1:3001/meteor',
    pubsubCollection: 'ascoltatori',
    mongo: {}
  };
}
else {
  var ascoltatore = {
    type: 'mongo',
    // Enter your production MongoDB path here
    url: 'mongodb://127.0.0.1:27017/mqtt',
    pubsubCollection: 'ascoltatori',
    mongo: {}
  };
}

// Settings
var settings = {
  port: 1883,
  backend: ascoltatore
};

// Create mosca server
var server = new mosca.Server(settings);

// Process new connections
server.on('clientConnected', Meteor.bindEnvironment(function(client) {
    console.log('client connected', client.id);

  // Already exist?
	if (Devices.find({clientId: client.id}).fetch().length == 0) {
		// Insert in DB
		console.log('New device detected');
		device = {
			clientId: client.id
		}
		Devices.insert(device);
	}
	else {
	  console.log('Existing device detected');
	}
}) );

// Server ready message
server.on('ready', setup);

// fired when the mqtt server is ready
function setup() {
  console.log('Mosca server is up and running');
}

// Routes for aREST API
Router.route('/:device', {
  where: 'server',
  action: function () {

    var device = this.params.device;

    // Look for device
    var currentDevice = Devices.findOne({clientId: device});

    var message = {
      topic: currentDevice.clientId + '_in',
      payload: '',
      qos: 0,
      retain: false
    };

    var fut = new Future();

    server.publish(message, function() {
      console.log('Message sent');

      server.once('published', function(packet, client) {
        console.log('Published', packet.payload.toString('utf8'));
        fut.return(packet.payload.toString('utf8'));
      });
    });

    this.response.setHeader('Content-Type', 'application/json');
    answer = fut.wait();
    this.response.end(answer);
  }
});

Router.route('/:device/:command', {
  where: 'server',
  action: function () {

    var command = this.params.command;
    var device = this.params.device;

    // Look for device
    var currentDevice = Devices.findOne({clientId: device});

    var message = {
      topic: currentDevice.clientId + '_in',
      payload: command,
      qos: 0,
      retain: false
    };

    var fut = new Future();

    server.publish(message, function() {
      console.log('Message sent');

      server.once('published', function(packet, client) {
        console.log('Published', packet.payload.toString('utf8'));
        fut.return(packet.payload.toString('utf8'));
      });
    });

    this.response.setHeader('Content-Type', 'application/json');
    answer = fut.wait();
    this.response.end(answer);
  }
});

Router.route('/:device/:command/:pin/:state', {
  where: 'server',
  action: function () {

    // Get parameters
    var command = this.params.command;
    var device = this.params.device;
    var pin = this.params.pin;
    var state = this.params.state;

    // Look for device
    var currentDevice = Devices.findOne({clientId: device});

    // Message
    var message = {
      topic: currentDevice.clientId + '_in',
      payload: command + '/' + pin + '/' + state,
      qos: 0,
      retain: false
    };

    var fut = new Future();

    server.publish(message, function() {
      console.log('Message sent');

      server.once('published', function(packet, client) {
        console.log('Published', packet.payload.toString('utf8'));
        fut.return(packet.payload.toString('utf8'));
      });
    });

    this.response.setHeader('Content-Type', 'application/json');
    answer = fut.wait();
    this.response.end(answer);
  }
});
