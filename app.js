var WebSocket = require('ws');

var GrovePi = require('node-grovepi').GrovePi;
var Commands = GrovePi.commands;
var Board = GrovePi.board;
var DHTDigitalSensor = GrovePi.sensors.DHTDigital;
var UltrasonicSensor = GrovePi.sensors.UltrasonicDigital;

var grovePiBoard;

var PI_IDENTIFIER = "arlington";
var STATIONARY_BLADE_TIMEOUT = 5; // in seconds
var previousTimeReading = -1;
var previousUltrasonicReading = -1;
var previousPeriods = new Array();
var NUM_PERIODS_TO_AVERAGE = 5;
var ULTRASONIC_SCALING_FACTOR = 10/513;
var WING_DISTANCE_THRESHOLD = 10;
var ROUNDING_CONSTANT = 100;


var ws;
ws = new WebSocket('wss://predix-demos-forwarding-server.run.aws-usw02-pr.ice.predix.io/input/west/arlington');
//const ws = new WebSocket('ws://10.15.27.27:8083');


ws.on('open', function open() {
	console.log('Websocket connection established');
});

ws.on('message', function message(data, flags) {
	// We shouldn't ever receive a message from the forwarding server
});

ws.on('close', function close() {
	console.log('Websocket connection closed');
});

ws.on('error', function handleError() {
	console.log('Error connecting to WS');
	ws = new WebSocket('wss://predix-demos-forwarding-server.run.aws-usw02-pr.ice.predix.io/input/west/arlington');
});

function initializeBoard() {
	console.log('---- initializing the GrovePi ----');

	grovePiBoard = new Board({
		debug: true,
		onError: function(err) {
			console.log('An error occured on the GrovePi: ');
			console.log(err);
		},
		onInit: function(res) {
			if (res) {
				// Connect Humidity and Temperature sensor in Digital Port 4
				var dhtSensor = new DHTDigitalSensor(4, DHTDigitalSensor.VERSION.DHT22, DHTDigitalSensor.CELSIUS);
				// Connect Ultrasonice Sensor in Digital Port 3
				var ultrasonicSensor = new UltrasonicSensor(3);
				
				console.log('GrovePi Version: ' + grovePiBoard.version());

				console.log('Begin poll of sensor: DHT Digital Sensor');
				dhtSensor.on('change', function(res) {
					var filteredData = filterDHT(res);
					if(filteredData) {
						console.log('Temperature: ' + filteredData[0].datapoints[0][1]);
						console.log('Humidity: ' + filteredData[1].datapoints[0][1]);
						// Send temperature reading to forwarding server
						try {
							ws.send(JSON.stringify(filteredData[0]));
							// Send humidity reading to forwarding 
							ws.send(JSON.stringify(filteredData[1]));
						}
						catch (err) {
							console.log('Did not send temperature and humidity data');
						}
					}
				});
				dhtSensor.watch(500);	// milliseconds

				console.log('Begin poll of sensor: Ultrasonice Sensor');
				ultrasonicSensor.stream(10, function(res) {
					console.log('Ultrasonic reading: ' + res);
					var data = packageData({"ultrasonic": res*ULTRASONIC_SCALING_FACTOR});
					try {
						ws.send(JSON.stringify(data[0]));
					}
					catch (err) {
						console.log('Did not send ultrasonic data data');
					}
					if (previousUltrasonicReading === -1) {
						previousUltrasonicReading = res;
					}
					else {
						if (res < WING_DISTANCE_THRESHOLD && previousUltrasonicReading > WING_DISTANCE_THRESHOLD) {
							var currentTimeReading = Date.now();
							if (previousTimeReading != -1) {
								// Calculate period
								var currentTimeReading = Date.now();
								var period = (currentTimeReading - previousTimeReading)*3/1000;
								if (previousPeriods.length < NUM_PERIODS_TO_AVERAGE) {
									previousPeriods.push(period);
								}
								else {
									previousPeriods.shift();
									previousPeriods.push(period);
								}
								previousTimeReading = currentTimeReading;
								sendFrequency(previousPeriods);
							}
							previousTimeReading = currentTimeReading;
						}
						previousUltrasonicReading = res;
					}
				});
				// Add interval to check if turbine blades are stationary
				setInterval(checkStationaryBlades, STATIONARY_BLADE_TIMEOUT*1000);
			}
			else {
				console.log('Unable to initialize GrovePi');
			}
		}
	});
	grovePiBoard.init();
}


/*
	The Temperature & Humidity sensor likes to produce readings
	that are far beyond any achievable temperature on earth.
	If the sensor produces any of these values, just ignore them.
*/
function filterDHT(readValues) {
	if (readValues[0] > 100 || readValues[1] > 100) {
		return false;
	}
	else {
		// Correctly format the data to send to our forwarding server
		// Remove the last reading
		var data = packageData({
			"temperature": readValues[0],
			"humidity": readValues[1]
		});
		return data;
	}
}


Array.prototype.sum = function() {
	return this.reduce(function(a,b){return a+b;});
};


/*
	Average the last 5 measured period values from the
	ultrasonic sensor. Using the averaged period, calculate
	the frequency (1/period). Send the frequency to the
	forwarding server.
*/
function sendFrequency(periodsArray) {
	var average = periodsArray.sum()/periodsArray.length;
	//console.log('Cached period data: ' + periodsArray);
	//console.log('Average period data: ' + average);
	var frequency = 60/average;
	console.log('Frequency data: ' + Math.round(frequency*ROUNDING_CONSTANT)/ROUNDING_CONSTANT);
	var data = packageData({"frequency": Math.round(frequency*ROUNDING_CONSTANT)/ROUNDING_CONSTANT});
	try {
		ws.send(JSON.stringify(data[0]));
	}
	catch (err) {
		console.log('Did not send frequency data');
	}
}


/*
	Callback to check if the time between now and the
	last time an ultrasonic reading was made is excessive
	enough to consider that the turbine blades have stopped
	rotating, and thus their spinning frequency would be 0.
*/
function checkStationaryBlades() {
	var currentTime = Date.now();
	var zeroReading = JSON.stringify(packageData({"frequency": 0})[0]);
	if (previousTimeReading === -1) {
		// No readings have been made yet -- frequency is 0
		console.log("Frequency is 0");
		ws.send(zeroReading);
	}
	else if (((currentTime - previousTimeReading)/1000) > STATIONARY_BLADE_TIMEOUT) {
		// Stationary time has elapsed -- assume blades have stopped turning
		console.log("Frequency is 0");
		ws.send(zeroReading);
	}
}


/*
	Returns a sensor reading in the format expected by the
	forwarding server.
	data is expected to be a JSON object of the form:
	{"dataType1": dataValue1, "dataType2": dataValue2, etc.}
*/
function packageData(data) {
	var packagedData = new Array();
	var currentTime = Date.now();
	var i = 0;
	for (var dataType in data) {
		packagedData[i] = {
			"name": PI_IDENTIFIER + "/" + dataType,
			"datapoints": [[currentTime, data[dataType]]],
			"tag": dataType
		};
		i++;
	}

	return packagedData;
}


function onExit(err) {
	console.log('Shutting down the GrovePi');
	grovePiBoard.close();
	process.removeAllListeners();
	process.exit();
	if (typeof err != 'undefined') {
		console.log(err);
	}
}


initializeBoard();
process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);
