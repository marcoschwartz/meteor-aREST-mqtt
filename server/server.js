// Required module
import mosca from 'mosca';
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
} else {

    var ascoltatore = {
        type: 'mongo',
        // Enter your production MongoDB path here
        url: Meteor.settings.mongoURL,
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

// Process disconnections
server.on('clientDisconnected', Meteor.bindEnvironment(function(client) {

    console.log('Client Disconnected: ', client.id);

    // Update device status
    Devices.update({ clientId: client.id }, { $set: { "connected": false } });

}));

// Process incoming messages
server.on('published', Meteor.bindEnvironment(function(packet, client) {

    // Get incoming message
    incomingMessage = (packet.payload.toString('utf8')).trim();
    console.log('Incoming message: ' + incomingMessage);

    if (isJSON(incomingMessage)) {

        console.log('Direct JSON message');
        var message = JSON.parse(incomingMessage);

        if (message.events || message.data || message.topic) {

            console.log('Processing event');

            Meteor.call('processEvent', message);

        } else {
            if (Devices.findOne({ deviceId: message.id })) {

                console.log('Message from existing device: ');
                console.log(message);

                // Update device
                if (message.hardware) {
                    Devices.update({ deviceId: message.id }, { $set: { "lastOnline": new Date(), "message": message, "name": message.name, "hardware": message.hardware, "flag": true } });
                } else {
                    Devices.update({ deviceId: message.id }, { $set: { "lastOnline": new Date(), "message": message, "name": message.name, "flag": true } });
                }

            }
        }
    } else {

        if (client) {

            // Check if it's start of split message
            if (incomingMessage.substring(0, 1) == "{") {

                console.log('Saving split message: ' + incomingMessage);

                // Update device with split message
                Devices.update({ clientId: client.id }, { $set: { "splitMessage": incomingMessage, "splitFlag": true } });

            } else if (incomingMessage.substr(incomingMessage.length - 1) == "}") {

                console.log('Found end of split message');

                // Add message to incoming
                var device = Devices.findOne({ clientId: client.id });
                if (device.splitMessage) {

                    var assembledMessage = device.splitMessage + incomingMessage;
                    console.log('Assembled message:' + assembledMessage);

                    if (isJSON(assembledMessage)) {

                        // Assemble message
                        var message = JSON.parse(assembledMessage);
                        console.log('Message from existing device: ');
                        console.log(message);

                        // Update device
                        Devices.update({ deviceId: message.id }, { $set: { "message": message, "flag": true, "splitFlag": false } });

                    }

                }

            }

        }

    }

}));

// Process new connections
server.on('clientConnected', Meteor.bindEnvironment(function(client) {

    // console.log(client);

    // Get data
    clientId = client.id;
    deviceId = clientId.substring(6, clientId.length);

    console.log('Client connected with MQTT ID: ' + clientId + ' and aREST ID: ' + deviceId);

    // Already exist?
    if (!Devices.findOne({ deviceId: deviceId })) {

        // Insert in DB
        console.log('New device detected, registering');
        device = {
            clientId: clientId,
            deviceId: deviceId,
            connected: true
        }
        Devices.insert(device);
    } else {

        // Get device
        var device = Devices.findOne({ deviceId: deviceId });

        if (device.connected) {

            console.log('Existing device already connected, blocking new device');

        } else {

            // Update device status
            console.log('Existing device came back online');
            Devices.update({ deviceId: deviceId }, { $set: { "connected": true, "clientId": clientId } });

        }

    }

}));

// Server ready message
server.on('ready', setup);

// fired when the mqtt server is ready
function setup() {
    console.log('Mosca server is up and running');
}

// Routes for aREST API
Router.route('/:device', {
    where: 'server',
    action: function() {

        // Get device name
        var device = this.params.device;

        // Look for device
        var currentDevice = Devices.findOne({ deviceId: device });
        if (currentDevice) {

            // Reset flag
            Devices.update({ deviceId: device }, { $set: { "flag": false } });

            // Protected ?
            locked = Meteor.call('isLocked', currentDevice, this.params.query);

            if (!locked) {

                if (currentDevice.connected == true) {

                    var message = {
                        topic: currentDevice.clientId + '_in',
                        payload: '',
                        qos: 0,
                        retain: false
                    };

                    // Send message
                    Meteor.call('sendMessage', message);

                    // Send answer
                    this.response.setHeader('Content-Type', 'application/json');
                    this.response.setHeader('Access-Control-Allow-Origin', '*');
                    this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');

                    var handler = this;

                    var query = Devices.find({ deviceId: device });
                    var observer = query.observeChanges({

                        changed: function(id, fields) {
                            if (fields.flag == true) {
                                currentDevice = Devices.findOne(id);
                                handler.response.end(JSON.stringify(currentDevice.message));
                                Devices.update(id, { $set: { "flag": false } });
                                observer.stop();
                            }
                        }

                    });


                } else {

                    // Return answer when device is not found
                    this.response.setHeader('Content-Type', 'application/json');
                    this.response.setHeader('Access-Control-Allow-Origin', '*');
                    this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                    answer = {
                        message: "Requested device is not online",
                        connected: false,
                        id: device
                    };
                    this.response.end(JSON.stringify(answer));

                }

            } else {

                this.response.setHeader('Content-Type', 'application/json');
                this.response.setHeader('Access-Control-Allow-Origin', '*');
                this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                answer = {
                    message: "Wrong API key."
                };
                this.response.end(JSON.stringify(answer));

            }

        } else {

            this.response.setHeader('Content-Type', 'application/json');
            this.response.setHeader('Access-Control-Allow-Origin', '*');
            this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
            answer = {
                message: "Requested device not found"
            };
            this.response.end(JSON.stringify(answer));

        }

    }
});

Router.route('/:device/:command', {
    where: 'server',
    action: function() {

        startTime = (new Date()).getTime();

        // Get data
        var command = this.params.command;
        var device = this.params.device;

        // Function?
        if (this.params.query.params) {
            var parameters = this.params.query.params;
        }

        // Look for device
        var currentDevice = Devices.findOne({ deviceId: device });

        if (currentDevice) {

            foundTime = (new Date()).getTime();

            // Reset flag
            Devices.update({ deviceId: device }, { $set: { "flag": false } });

            // Protected ?
            locked = Meteor.call('isLocked', currentDevice, this.params.query);

            if (!locked) {

                if (command == 'events') {

                    // Grab events
                    var events = Events.find({ deviceId: device }, { sort: { 'timestamp': 1 } }).fetch();

                    // Send answer
                    this.response.setHeader('Content-Type', 'application/json');
                    this.response.setHeader('Access-Control-Allow-Origin', '*');
                    this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                    this.response.end(JSON.stringify(events));

                } else {

                    if (currentDevice.connected == true) {

                        if (parameters) {

                            // Function
                            var message = {
                                topic: currentDevice.clientId + '_in',
                                payload: command + '?params=' + parameters,
                                qos: 0,
                                retain: false
                            };

                        } else {

                            // Variable
                            var message = {
                                topic: currentDevice.clientId + '_in',
                                payload: command,
                                qos: 0,
                                retain: false
                            };

                        }

                        // Send message
                        Meteor.call('sendMessage', message);

                        messageSentTime = (new Date()).getTime();

                        var handler = this;

                        // Send answer
                        this.response.setHeader('Content-Type', 'application/json');
                        this.response.setHeader('Access-Control-Allow-Origin', '*');
                        this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');

                        var query = Devices.find({ deviceId: device });
                        var observer = query.observeChanges({

                            changed: function(id, fields) {
                                if (fields.flag == true) {
                                    console.log(fields);
                                    currentDevice = Devices.findOne(id);
                                    handler.response.end(JSON.stringify(currentDevice.message));
                                    Devices.update(id, { $set: { "flag": false } });
                                    answerTime = (new Date()).getTime();

                                    // Log all
                                    // console.log('Time to find device: ' + (foundTime - startTime) + 'ms');
                                    // console.log('Time to send message: ' + (messageSentTime - foundTime) + 'ms');
                                    // console.log('Time to answer: ' + (answerTime - messageSentTime) + 'ms');

                                    observer.stop();

                                }
                            }

                        });

                        // Devices.after.update(function (userId, doc, fieldNames, modifier, options) {
                        //   if (doc.deviceId == device && doc.flag == true) {
                        //     handler.response.end(JSON.stringify(doc.message));
                        //     Devices.update({deviceId: device}, {$set: {"flag": false}});
                        //   }
                        // });

                    } else {

                        // Return answer when device is not found
                        this.response.setHeader('Content-Type', 'application/json');
                        this.response.setHeader('Access-Control-Allow-Origin', '*');
                        this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                        answer = {
                            message: "Requested device is not online",
                            connected: false,
                            id: device
                        };
                        this.response.end(JSON.stringify(answer));

                    }

                }

            } else {

                this.response.setHeader('Content-Type', 'application/json');
                this.response.setHeader('Access-Control-Allow-Origin', '*');
                this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                answer = {
                    message: "Wrong API key."
                };
                this.response.end(JSON.stringify(answer));

            }

        } else {

            this.response.setHeader('Content-Type', 'application/json');
            this.response.setHeader('Access-Control-Allow-Origin', '*');
            this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
            answer = {
                message: "Requested device not found"
            };
            this.response.end(JSON.stringify(answer));

        }

    }

});

Router.route('/:device/:command/:pin', {
    where: 'server',
    action: function() {

        var requestStartTime = (new Date()).getTime();

        // Get parameters
        var command = this.params.command;
        var device = this.params.device;
        var pin = this.params.pin;

        // Look for device
        var currentDevice = Devices.findOne({ deviceId: device });
        var deviceLookTime = (new Date()).getTime();
        console.log('Time to find device: ' + (deviceLookTime - requestStartTime) + 'ms');

        if (currentDevice) {

            // Reset flag
            Devices.update({ deviceId: device }, { $set: { "flag": false } });

            // Protected ?
            locked = Meteor.call('isLocked', currentDevice, this.params.query);

            if (!locked) {

                if (currentDevice.connected == true) {

                    // Message
                    var message = {
                        topic: currentDevice.clientId + '_in',
                        payload: command + '/' + pin,
                        qos: 0,
                        retain: false
                    };

                    // Send message
                    Meteor.call('sendMessage', message);

                    var messageSentTime = (new Date()).getTime();
                    console.log('Time to send message: ' + (messageSentTime - deviceLookTime) + 'ms');

                    // Send answer
                    this.response.setHeader('Content-Type', 'application/json');
                    this.response.setHeader('Access-Control-Allow-Origin', '*');
                    this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');

                    var handler = this;

                    var messageReceivedTime = (new Date()).getTime();
                    console.log('Time to receive message: ' + (messageReceivedTime - messageSentTime) + 'ms');

                    var query = Devices.find({ deviceId: device });
                    var observer = query.observeChanges({

                        changed: function(id, fields) {
                            if (fields.flag == true) {
                                currentDevice = Devices.findOne(id);
                                handler.response.end(JSON.stringify(currentDevice.message));
                                Devices.update(id, { $set: { "flag": false } });
                                observer.stop();
                            }
                        }

                    });

                    // Devices.after.update(function (userId, doc, fieldNames, modifier, options) {
                    //
                    //   var messageReceivedTime = (new Date()).getTime();
                    //   console.log('Time to receive message: ' + (messageReceivedTime - messageSentTime) + 'ms');
                    //
                    //   if (doc.deviceId == device && doc.flag == true) {
                    //     handler.response.end(JSON.stringify(doc.message));
                    //     Devices.update({deviceId: device}, {$set: {"flag": false}});
                    //   }
                    //
                    // });

                } else {

                    // Return answer when device is not found
                    this.response.setHeader('Content-Type', 'application/json');
                    this.response.setHeader('Access-Control-Allow-Origin', '*');
                    this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                    answer = {
                        message: "Requested device is not online",
                        connected: false,
                        id: device
                    };
                    this.response.end(JSON.stringify(answer));

                }

            } else {

                this.response.setHeader('Content-Type', 'application/json');
                this.response.setHeader('Access-Control-Allow-Origin', '*');
                this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                answer = {
                    message: "Wrong API key."
                };
                this.response.end(JSON.stringify(answer));

            }

        } else {

            this.response.setHeader('Content-Type', 'application/json');
            this.response.setHeader('Access-Control-Allow-Origin', '*');
            this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
            answer = {
                message: "Requested device not found"
            };
            this.response.end(JSON.stringify(answer));

        }
    }
});

Router.route('/:device/:command/:pin/:state', {
    where: 'server',
    action: function() {

        // Get parameters
        var command = this.params.command;
        var device = this.params.device;
        var pin = this.params.pin;
        var state = this.params.state;

        // Look for device
        var currentDevice = Devices.findOne({ deviceId: device });
        if (currentDevice) {

            // Reset flag
            Devices.update({ deviceId: device }, { $set: { "flag": false } });

            // Protected?
            locked = Meteor.call('isLocked', currentDevice, this.params.query);

            if (!locked) {

                if (currentDevice.connected == true) {

                    // Reset device
                    // Devices.update({deviceId: device}, {$set: {'splitFlag': false, 'flag': false}});

                    // Message
                    var message = {
                        topic: currentDevice.clientId + '_in',
                        payload: command + '/' + pin + '/' + state,
                        qos: 0,
                        retain: false
                    };

                    // Send message
                    Meteor.call('sendMessage', message);

                    // Send answer
                    this.response.setHeader('Content-Type', 'application/json');
                    this.response.setHeader('Access-Control-Allow-Origin', '*');
                    this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');

                    var handler = this;

                    var query = Devices.find({ deviceId: device });
                    var observer = query.observeChanges({

                        changed: function(id, fields) {
                            if (fields.flag == true) {
                                currentDevice = Devices.findOne(id);
                                handler.response.end(JSON.stringify(currentDevice.message));
                                Devices.update(id, { $set: { "flag": false } });
                                observer.stop();
                            }
                        }

                    });

                    // Devices.after.update(function (userId, doc, fieldNames, modifier, options) {
                    //   if (doc.deviceId == device && doc.flag == true) {
                    //     handler.response.end(JSON.stringify(doc.message));
                    //     Devices.update({deviceId: device}, {$set: {"flag": false}});
                    //   }
                    // });

                } else {

                    // Return answer when device is not found
                    this.response.setHeader('Content-Type', 'application/json');
                    this.response.setHeader('Access-Control-Allow-Origin', '*');
                    this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                    answer = {
                        message: "Requested device is not online",
                        connected: false,
                        id: device
                    };
                    this.response.end(JSON.stringify(answer));

                }

            } else {

                this.response.setHeader('Content-Type', 'application/json');
                this.response.setHeader('Access-Control-Allow-Origin', '*');
                this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
                answer = {
                    message: "Wrong API key."
                };
                this.response.end(JSON.stringify(answer));

            }

        } else {

            // Return answer when device is not found
            this.response.setHeader('Content-Type', 'application/json');
            this.response.setHeader('Access-Control-Allow-Origin', '*');
            this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
            answer = {
                message: "Requested device not found"
            };
            this.response.end(JSON.stringify(answer));

        }
    }
});

// Router.route( "/api/v1/admin/devices/keys", { where: "server" } )
//   .get( function() {
//
//     // Return all keys
//     this.response.setHeader('Content-Type', 'application/json');
//     this.response.setHeader('Access-Control-Allow-Origin', '*');
//     this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
//     answer = {
//       keys: Keys.find({}).fetch()
//     };
//     this.response.end(JSON.stringify(answer));
//
//   })
//   .post( function() {
//
//     // Get data
//     var data = this.request.body;
//     console.log(data);
//
//     // Build answer
//     answer = {
//       data: data
//     };
//
//     // Master key present & match
//     if (data.masterKey && data.deviceId && data.email) {
//       if (data.masterKey == '3948w08dsf') {
//
//         // Generate key
//         var key = makeid();
//
//         // Device exist?
//         if (Devices.findOne({clientId: data.deviceId})) {
//           var deviceId = makeid();
//         }
//         else {
//           var deviceId = data.deviceId;
//         }
//
//         // Add new key
//         Keys.insert({
//           deviceId: deviceId,
//           key: key,
//           email: data.email
//         });
//         answer.message = 'New key added.';
//         answer.key = key;
//         answer.deviceId = deviceId;
//
//         // Send email
//         Email.send({
//           from: "contact@arest.io",
//           to: data.email,
//           subject: "Your aREST.io key",
//           text: "Hello, here your aREST.io key you ordered: " + key + '. The protected device ID is ' + deviceId + '.'
//         });
//
//       }
//       else {
//         answer.message = 'Master key not present or incorrect.'
//       }
//     }
//     else {
//       answer.message = 'Master key not present or incorrect.'
//     }
//
//     // Answer
//     this.response.setHeader('Content-Type', 'application/json');
//     this.response.setHeader('Access-Control-Allow-Origin', '*');
//     this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
//     this.response.end(JSON.stringify(answer));
//
//   })
//   .delete( function() {
//    // If a DELETE request is made, delete the user's profile.
//
// });
//
// Router.route( "/api/v1/admin/devices/keys/email", { where: "server" } )
//   .post( function() {
//
//     // Get data
//     var data = this.request.body;
//
//     if (data.email) {
//
//       // Send all keys by email
//       keys = Keys.find({email: data.email}).fetch();
//
//       if (keys.length > 0) {
//
//         // Build text
//         var message = "<p>Hello, here are all your aREST.io keys:</p>";
//         for (i = 0; i < keys.length; i++) {
//           message += "<p>Key: " + keys[i].key + " for device: " + keys[i].deviceId + ".</p>";
//         }
//
//         // Send email
//         Email.send({
//           from: "contact@arest.io",
//           to: data.email,
//           subject: "Your aREST.io keys",
//           html: message
//         });
//
//       }
//
//       // Return the keys for this email
//       this.response.setHeader('Content-Type', 'application/json');
//       this.response.setHeader('Access-Control-Allow-Origin', '*');
//       this.response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, OPTIONS');
//       answer = {
//         message: 'Keys sent by email.'
//       };
//       this.response.end(JSON.stringify(answer));
//
//     }
//
//   });

Meteor.methods({

    sendMessage: function(message) {

        console.log('Sending message: ');
        console.log(message);

        server.publish(message, Meteor.bindEnvironment(function() {

            console.log('Message sent to device');

        }));

    }

});

function makeid() {
    var text = "";
    var possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 8; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

// function sendMessage(message) {
//
//   console.log('Sending message: ');
//   console.log(message);
//
//   var fut = new Future();
//
//   server.publish(message, Meteor.bindEnvironment(function() {
//
//     console.log('Message sent');
//     // var answer = "";
//
//     server.once('published', Meteor.bindEnvironment(function(packet, client) {
//
//       // console.log('Published', packet.payload.toString('utf8'));
//       // answer = answer + packet.payload.toString('utf8');
//
//       // console.log('Answer: ');
//       // console.log(answer);
//
//       fut.return(packet.payload.toString('utf8'));
//
//       // try {
//       //   jsonAnswer = JSON.parse(answer);
//       //   fut.return(answer);
//       // }
//       // catch(e) {
//       //   jsonAnswer = false;
//       // }
//
//     }));
//
//   }));
//
//   return fut.wait();
//
// }

function isJSON(something) {
    if (typeof something != 'string')
        something = JSON.stringify(something);

    try {
        JSON.parse(something);
        return true;
    } catch (e) {
        return false;
    }
}
