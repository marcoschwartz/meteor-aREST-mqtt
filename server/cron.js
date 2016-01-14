SyncedCron.add({
  name: 'Display load data',
  schedule: function(parser) {
    // parser is a later.parse object
    return parser.text('every 1 minute');
  },
  job: function() {
    Meteor.call('displayLoadData');
  }
});
