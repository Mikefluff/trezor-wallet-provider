'use strict';

var HookedWalletSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js');
var Transaction = require('ethereumjs-tx');
var trezor = require('trezor.js');
var util = require('util');
var bippath = require('bip32-path');
var stripHexPrefix = ('strip-hex-prefix');

var debug = false;

/**
 * @param {string} type
 * @param {Function<Error, string>} callback
 */
function pinCallback(type, callback) {
    console.log('Please enter PIN. The positions:');
    console.log('7 8 9');
    console.log('4 5 6');
    console.log('1 2 3');

    // note - disconnecting the device should trigger process.stdin.pause too, but that
    // would complicate the code

    // we would need to pass device in the function and call device.on('disconnect', ...

    process.stdin.resume();
    process.stdin.on('data', function (buffer) {
        var text = buffer.toString().replace(/\n$/, "");
        process.stdin.pause();
        callback(null, text);
    });
}

// an example function, that asks user for acquiring and
// calls callback if use agrees
// (in here, we will call agree always, since it's just an example)
function askUserForceAcquire(callback) {
    return setTimeout(callback, 1000);
}

function normalize(hex) {
	if (hex == null) {
		return null;
	}
	if (hex.startsWith("0x")) {
		hex = hex.substring(2);
	}
	if (hex.length % 2 != 0) {
		hex = "0" + hex;
	}
	return hex;
}

function buffer(hex) {
	if (hex == null) {
		return new Buffer('', 'hex');
	} else {
		return new Buffer(normalize(hex), 'hex');
	}
}
var wait = ms => new Promise((r, j)=>setTimeout(r, ms))

var trezorInstance;

class Trezor {
	constructor(path) {
		var self = this;

		this.devices = [];
		this.path = path;
		this.list = new trezor.DeviceList({debug: debug});
		this.list.on('connect', function (device) {
			var dev = device;
	        console.log("Connected device " + device.features.label);
	        self.devices.push(device);
 device.on('pin', pinCallback);

	        // For convenience, device emits 'disconnect' event on disconnection.
	        device.on('disconnect', function () {
	            self.devices.splice(self.devices.indexOf(dev), 1);
	            console.log("Disconnected device");
	        });

	        // You generally want to filter out devices connected in bootloader mode:
	        if (device.isBootloader()) {
	            throw new Error('Device is in bootloader mode, re-connected it');
	        }
		 // low level API
	    });
		// On connecting unacquired device
this.list.on('connectUnacquired', function (device) {
    askUserForceAcquire(function() {
        device.steal().then(function() {
            console.log("steal done. now wait for another connect");
        });
    });
});

	}
        
	async inTrezorSession(cb) {

            //return Promise.reject(new Error("no device connected"));
        return this.devices[0].waitForSessionAndRun(cb);
	 }

	async getAccounts(cb) {
		await wait(3000)
		var self = this;
	    await this.inTrezorSession(
	        session => session.ethereumGetAddress(self.path, false)
	    )
	    .then(resp => "0x" + resp.message.address)
	    .then(address => {cb(null, [address]); console.log("address: " + address)})
	    .catch(cb);
	}

	async signTransaction(txParams, cb) {
		var self = this;
		this.inTrezorSession(
			session => session.signEthTx(self.path, normalize(txParams.nonce), normalize(txParams.gasPrice), normalize(txParams.gas), normalize(txParams.to), normalize(txParams.value), normalize(txParams.data))
		)
		.then(result => {
			const tx = new Transaction({
			   nonce: buffer(txParams.nonce),
			   gasPrice: buffer(txParams.gasPrice),
			   gasLimit: buffer(txParams.gas),
			   to: buffer(txParams.to),
			   value: buffer(txParams.value),
			   data: buffer(txParams.data),
			   v: result.v,
			   r: buffer(result.r),
			   s: buffer(result.s)
			});
			cb(null, '0x' + tx.serialize().toString('hex'));
		})
		.catch(cb);
	}

	async signPersonalMessage(msgData, cb) {
                var self = this;
                this.inTrezorSession(
                        session => session.ethereumSignMessage(self.path, stripHexPrefix(msgData.data))
		)
		.then(result => {
		       const v = parseInt(result.v, 10) - 27;
                       let vHex = v.toString(16);
                       if (vHex.length < 2) {
                         vHex = `0${v}`;
                       }
		       cb(null,`0x${result.r}${result.s}${vHex}`);
		})
		.catch(cb);
	}

	static init(path) {
		if (trezorInstance == null) {
			trezorInstance = new Trezor(path);
		} else {
			trezorInstance.path = path;
		}
		return trezorInstance;
	}
}

class TrezorProvider extends HookedWalletSubprovider {
	constructor(path) {
		var trezor = Trezor.init(bippath.fromString(path).toPathArray());
		super({
			getAccounts: function(cb) {
				trezor.getAccounts(cb);
			},
			signTransaction: function(txParams, cb) {
				trezor.signTransaction(txParams, cb);
			}
		});
	}
}

module.exports = TrezorProvider;

