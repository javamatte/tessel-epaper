
var tessel = require('tessel');
var display = require('../').use(tessel.port.A);

display.on('ready', function(){
  console.log('Ready!');
});
