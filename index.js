const series = require('async-series');
const util = require('util');
const EventEmitter = require('events').EventEmitter;

const MODE = {
    command: 0,
    data: 1
};

const SIZE = {
    height: 250,
    width: 128
};

// EPD2IN13 commands
const DRIVER_OUTPUT_CONTROL = 0x01;
const BOOSTER_SOFT_START_CONTROL = 0x0C;
const GATE_SCAN_START_POSITION = 0x0F;
const DEEP_SLEEP_MODE = 0x10;
const DATA_ENTRY_MODE_SETTING = 0x11;
const SW_RESET = 0x12;
const TEMPERATURE_SENSOR_CONTROL = 0x1A;
const MASTER_ACTIVATION = 0x20;
const DISPLAY_UPDATE_CONTROL_1 = 0x21;
const DISPLAY_UPDATE_CONTROL_2 = 0x22;
const WRITE_RAM = 0x24;
const WRITE_VCOM_REGISTER = 0x2C;
const WRITE_LUT_REGISTER = 0x32;
const SET_DUMMY_LINE_PERIOD = 0x3A;
const SET_GATE_TIME = 0x3B;
const BORDER_WAVEFORM_CONTROL = 0x3C;
const SET_RAM_X_ADDRESS_START_END_POSITION = 0x44;
const SET_RAM_Y_ADDRESS_START_END_POSITION = 0x45;
const SET_RAM_X_ADDRESS_COUNTER = 0x4E;
const SET_RAM_Y_ADDRESS_COUNTER = 0x4F;
const TERMINATE_FRAME_READ_WRITE = 0xFF;

function EPaper(port, callback) {
    this.port = port;
    this.pins = {
        dataCommand: this.port.pin[0],
        reset: this.port.pin[6]
    };

    //this.scrbuf = new Buffer(504);

    this.spi = new port.SPI({
        chipSelect: this.port.pin[1],
        clockSpeed: 2 * 1000000,
        cpha: 0,
        cpol: 0
    });

    this._write = function(mode, data, callback) {
        this.pins.dataCommand.output(mode);
        this.spi.send(data, function(err) {
            callback(err);
        });
    };

    this._reset = function(callback) {
        series([
            function(done) {
                this.pins.reset.low(done);
            },
            function(done) {
                setTimeout(done, 200);
            },
            function(done) {
                this.pins.reset.high(done);
            },
            function(done) {
                setTimeout(done, 200);
            }
        ], function(err) {
            if (!err) {
                this.emit('reset');
            }
            callback(err);
        });
    };

    // Process of initialization: reset --> driver output control --> booster soft start control
    //      --> write VCOM register --> set dummy line period --> set gate time
    //      --> data entry mode setting --> look-up table setting
    this._init = function(callback) {
        const lut_full_update = [
            0x22, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x11,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E,
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00
        ];
        /*
        const lut_partial_update = [
            0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x0F, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ];
        */
        series([
            function(done) {
                this._reset(done);
            },
            function(done) {
                this._write(MODE.command, new Buffer([ DRIVER_OUTPUT_CONTROL ]), done);
            },
            function(done) {
                this._write(
                    MODE.data,
                    new Buffer([
                        (SIZE.height - 1) & 0xFF,
                        ((SIZE.height - 1) >> 8) & 0xFF,
                        0x00 // GD = 0; SM = 0; TB = 0 (comment from Waveshare wiki example code)
                    ]),
                    done
                );
            },
            function(done) {
                this._write(MODE.command, new Buffer([ BOOSTER_SOFT_START_CONTROL ]), done);
            },
            function(done) {
                this._write(MODE.data, new Buffer([  0xD7, 0xD6, 0x9D ]), done);
            },
            function(done) {
                this._write(MODE.command, new Buffer([ WRITE_VCOM_REGISTER ]), done);
            },
            function(done) {
                this._write(MODE.data, new Buffer([ 0xA8 ]), done);
            },
            function(done) {
                this._write(MODE.command, new Buffer([ SET_DUMMY_LINE_PERIOD ]), done);
            },
            function(done) {
                this._write(MODE.data, new Buffer([ 0x1A ]), done);
            },
            function(done) {
                this._write(MODE.command, new Buffer([ SET_GATE_TIME ]), done);
            },
            function(done) {
                this._write(MODE.data, new Buffer([ 0x08 ]), done);
            },
            function(done) {
                this._write(MODE.command, new Buffer([ DATA_ENTRY_MODE_SETTING ]), done);
            },
            function(done) {
                this._write(MODE.data, new Buffer([ 0x03 ]), done);
            },
            function(done) {
                this._write(MODE.command, new Buffer([ WRITE_LUT_REGISTER ]), done);
            },
            function(done) {
                this._write(MODE.data, new Buffer(lut_full_update), done);
            }
        ], function(err) {
            callback(err);
        });
    };

    this._init(function(err) {
        this.emit('ready');
        if (callback) {  // callback from constructor, I think...
            callback(err, this); // for chaining
        }
    });
}

// Inherit event emission
util.inherits(EPaper, EventEmitter);

// Every Tessel module needs a use function which calls the constructor with the relevant settings
function use (port, callback) {
  return new EPaper(port, callback);
}

// Export functions
exports.use = use;
