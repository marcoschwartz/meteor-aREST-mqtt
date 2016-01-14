Meteor.methods({

  initDevices: function() {

    // Get total number of devices
    var devices = Devices.find({}).fetch();

    for (i = 0; i < devices.length; i++) {
      Devices.update(devices[i]._id, {$set: {"connected": false}})
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
    console.log('Connected/registered ratio: ' + (connectedDevices*100/devices.length).toFixed(0) + '%' );

  }

});
