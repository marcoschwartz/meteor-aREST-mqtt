// Future = Npm.require('fibers/future');

Meteor.methods({

    processEvent: function(message) {

        // Event
        var event = {
            deviceId: message.client_id,
            name: message.event_name,
            data: message.data,
            timestamp: new Date()
        };

        // Add event
        var events = Events.find({ deviceId: message.client_id }, { sort: { 'timestamp': 1 } }).fetch();
        console.log(events.length);
        if (events.length >= 10) {

            // Delete first event
            Events.remove(events[0]._id);

            // Insert
            Events.insert(event);

        } else {

            // Insert
            Events.insert(event);
        }

    },
    isLocked: function(device, query) {

        return false;
        
    },
    initDevices: function() {

        // Get total number of devices
        var devices = Devices.find({}).fetch();

        for (i = 0; i < devices.length; i++) {
            Devices.update(devices[i]._id, { $set: { "connected": false } })
        }

    },
    displayLoadData: function() {

        // Get total number of devices
        var devices = Devices.find({}).fetch();
        console.log('Number of registered devices: ' + devices.length);

        // Get total number of connected
        var connectedDevices = 0;
        for (i = 0; i < devices.length; i++) {
            if (devices[i].connected == true) {
                connectedDevices = connectedDevices + 1;
            }
        }
        console.log('Number of connected devices: ' + connectedDevices);

        // Ratio
        console.log('Connected/registered ratio: ' + (connectedDevices * 100 / devices.length).toFixed(0) + '%');

    }

});
