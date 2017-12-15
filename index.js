const async = require('async');
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
    var _this = this;

    _this.port = port;
    _this.pins = {
        busy: _this.port.pin[0],
        dataCommand: _this.port.pin[6],
        reset: _this.port.pin[7]
    };

    //_this.scrbuf = new Buffer(504);

    _this.spi = new port.SPI({
        chipSelect: _this.port.pin[5],
        clockSpeed: 4 * 1000 * 1000,
        cpha: 0,
        cpol: 0,
        mode: 0
    });

    _this._waitUntilIdle = function(callback) {
        var busy = 1;
        async.whilst(
            function() {
                return busy === 1;
            },
            function(done) {
                _this.pins.busy.read(function(err, data) {
                    busy = data;
                    // delay if still busy
                    if (busy === 1) {
                        console.log('Waiting... busy === 1');
                        setTimeout(function() { done(); }, 50);
                    } else {
                        done();
                    }
                });
            },
            function(err) {
                callback(err);
            }
        );
    };

    _this._write = function(mode, data, callback) {
        _this.pins.dataCommand.output(mode);
        _this.spi.send(data, function(err) {
            callback(err);
        });
    };

    _this._setupPins = function(callback) {
        _this.pins.busy.input(function(err) {
            callback(err);
        });
    };

    _this._reset = function(callback) {
        async.series([
            function(done) {
                _this.pins.reset.low(done);
            },
            function(done) {
                setTimeout(done, 200);
            },
            function(done) {
                _this.pins.reset.high(done);
            },
            function(done) {
                setTimeout(done, 200);
            }
        ], function(err) {
            if (!err) {
                _this.emit('reset');
            }
            callback(err);
        });
    };

    // Process of initialization: reset --> driver output control --> booster soft start control
    //      --> write VCOM register --> set dummy line period --> set gate time
    //      --> data entry mode setting --> look-up table setting
    _this._init = function(callback) {
        const lut_full_update = [
            0x22, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x11,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E,
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00
        ];
        const lut_partial_update = [
            0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x0F, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ];
        async.series([
            function(done) {
                _this._reset(done);
            },
            function(done) {
                _this._write(MODE.command, new Buffer([ DRIVER_OUTPUT_CONTROL ]), done);
            },
            function(done) {
                _this._write(
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
                _this._write(MODE.command, new Buffer([ BOOSTER_SOFT_START_CONTROL ]), done);
            },
            function(done) {
                _this._write(MODE.data, new Buffer([  0xD7, 0xD6, 0x9D ]), done);
            },
            function(done) {
                _this._write(MODE.command, new Buffer([ WRITE_VCOM_REGISTER ]), done);
            },
            function(done) {
                _this._write(MODE.data, new Buffer([ 0xA8 ]), done);
            },
            function(done) {
                _this._write(MODE.command, new Buffer([ SET_DUMMY_LINE_PERIOD ]), done);
            },
            function(done) {
                _this._write(MODE.data, new Buffer([ 0x1A ]), done);
            },
            function(done) {
                _this._write(MODE.command, new Buffer([ SET_GATE_TIME ]), done);
            },
            function(done) {
                _this._write(MODE.data, new Buffer([ 0x08 ]), done);
            },
            function(done) {
                _this._write(MODE.command, new Buffer([ DATA_ENTRY_MODE_SETTING ]), done);
            },
            function(done) {
                _this._write(MODE.data, new Buffer([ 0x03 ]), done);
            },
            function(done) {
                _this._write(MODE.command, new Buffer([ WRITE_LUT_REGISTER ]), done);
            },
            function(done) {
                //_this._write(MODE.data, new Buffer(lut_full_update), done);
                _this._write(MODE.data, new Buffer(lut_partial_update), done);
            }
        ], function(err) {
            callback(err);
        });
    };

    _this._init(function(err) {
        _this.emit('ready');
        if (callback) {  // callback from constructor, I think...
            callback(err, this); // for chaining
        }
    });
}

EPaper.prototype.clearFrameMemory = function(color = 1, callback) {
    console.log('-> clearFrameMemory entered');
    var _this = this;
    _this.setMemoryArea(0, 0, SIZE.width - 1, SIZE.height -1, function() {
        // iterate over the rows
        async.timesSeries(SIZE.height, function(row, next) {
            async.series([
                function(done) {
                    _this.setMemoryPointer(0, row, done);
                },
                function(done) {
                    var pixels = Array(SIZE.width / 8).fill(color);
                    _this._write(MODE.data, new Buffer(pixels), done);
                }
            ], function(err) {
                next(err);
            });
        }, function(err) {
            callback(err);
        });
    });
};

/**
 *  @brief: clear the frame memory with the specified color.
 *          this won't update the display.
 * /
void Epd::ClearFrameMemory(unsigned char color) {
    SetMemoryArea(0, 0, this->width - 1, this->height - 1);
    // set the frame memory line by line
    for (int j = 0; j < this->height; j++) {
        SetMemoryPointer(0, j);
        SendCommand(WRITE_RAM);
        for (int i = 0; i < this->width / 8; i++) {
            SendData(color);
        }
    }
}
*/

EPaper.prototype.displayFrame = function(callback) {
    console.log('-> displayFrame entered');
    var _this = this;
    async.series([
        function(done) {
            _this._write(MODE.command, new Buffer([ DISPLAY_UPDATE_CONTROL_2 ]), done);
        },
        function(done) {
            _this._write(MODE.data, new Buffer([ 0xC4 ]), done);
        },
        function(done) {
            _this._write(MODE.command, new Buffer([ MASTER_ACTIVATION ]), done);
        },
        function(done) {
            _this._write(MODE.command, new Buffer([ TERMINATE_FRAME_READ_WRITE ]), done);
        },
        function(done) {
            _this._waitUntilIdle(done);
        }
    ], function(err) {
        callback(err);
    });
};

/**
 *  @brief: update the display
 *          there are 2 memory areas embedded in the e-paper display
 *          but once this function is called,
 *          the the next action of SetFrameMemory or ClearFrame will
 *          set the other memory area.
 * /
void Epd::DisplayFrame(void) {
    SendCommand(DISPLAY_UPDATE_CONTROL_2);
    SendData(0xC4);
    SendCommand(MASTER_ACTIVATION);
    SendCommand(TERMINATE_FRAME_READ_WRITE);
    WaitUntilIdle();
}
*/

EPaper.prototype.setMemoryArea = function(x_start, y_start, x_end, y_end, callback) {
    console.log('-> setMemoryArea entered ');
    var _this = this;
    async.series([
        function(done) {
            _this._write(MODE.command, new Buffer([ SET_RAM_X_ADDRESS_START_END_POSITION ]), done);
        },
        function(done) {
            var data = new Buffer([
                ((x_start >> 3) & 0xFF),
                ((x_end >> 3) & 0xFF)
            ]);
            _this._write(MODE.data, data, done);
        },
        function(done) {
            _this._write(MODE.command, new Buffer([ SET_RAM_Y_ADDRESS_START_END_POSITION ]), done);
        },
        function(done) {
            var data = new Buffer([
                (y_start & 0xFF),
                ((y_start >> 8) & 0xFF),
                (y_end & 0xFF),
                ((y_end >> 8) & 0xFF)
            ]);
            _this._write(MODE.data, data, done);
        }
    ], function(err) {
        callback(err);
    });
};
/**
 *  @brief: private function to specify the memory area for data R/W
 * /
void Epd::SetMemoryArea(int x_start, int y_start, int x_end, int y_end) {
    SendCommand(SET_RAM_X_ADDRESS_START_END_POSITION);
    // x point must be the multiple of 8 or the last 3 bits will be ignored
    SendData((x_start >> 3) & 0xFF);
    SendData((x_end >> 3) & 0xFF);
    SendCommand(SET_RAM_Y_ADDRESS_START_END_POSITION);
    SendData(y_start & 0xFF);
    SendData((y_start >> 8) & 0xFF);
    SendData(y_end & 0xFF);
    SendData((y_end >> 8) & 0xFF);
}
*/

EPaper.prototype.setMemoryPointer = function(x, y, callback) {
    //console.log('-> setMemoryPointer entered');
    var _this = this;
    async.series([
        function(done) {
            _this._write(MODE.command, new Buffer([ SET_RAM_X_ADDRESS_COUNTER ]), done);
        },
        function(done) {
            _this._write(MODE.data, new Buffer([ ((x >> 3) & 0xFF) ]), done);
        },
        function(done) {
            _this._write(MODE.command, new Buffer([ SET_RAM_Y_ADDRESS_COUNTER ]), done);
        },
        function(done) {
            _this._write(MODE.data, new Buffer([ (y & 0xFF), ((y >> 8) & 0xFF) ]), done);
        },
        function(done) {
            _this._waitUntilIdle(done);
        }
    ], function(err) {
        callback(err);
    });
};
/**
 *  @brief: private function to specify the start point for data R/W
 * /
void Epd::SetMemoryPointer(int x, int y) {
    SendCommand(SET_RAM_X_ADDRESS_COUNTER);
    // x point must be the multiple of 8 or the last 3 bits will be ignored
    SendData((x >> 3) & 0xFF);
    SendCommand(SET_RAM_Y_ADDRESS_COUNTER);
    SendData(y & 0xFF);
    SendData((y >> 8) & 0xFF);
    WaitUntilIdle();
}
*/


// Inherit event emission
util.inherits(EPaper, EventEmitter);

// Every Tessel module needs a use function which calls the constructor with the relevant settings
function use (port, callback) {
  return new EPaper(port, callback);
}

// Export functions
exports.use = use;
