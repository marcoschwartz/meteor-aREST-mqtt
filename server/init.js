Meteor.startup(function () {

  // Start all cron
  SyncedCron.start();

  // Init devices status
  Meteor.call('initDevices');

});
