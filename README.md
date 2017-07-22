# predix-demos-edge-sensors

Application to run on a raspberry pi that reads GrovePi sensor data and pushes it to a forwarding server located in the cloud via websockets.

Requires a [GrovePi board](https://www.dexterindustries.com/shop/grovepi-board/) in addition to a raspberry pi.

Currently this app supports reading from the [GrovePi Temperature and Humidity Sensor](https://www.seeedstudio.com/Grove-Temperature%26amp%3BHumidity-Sensor-Pro-p-838.html) and the [Grove Ultrasonic Ranger](https://www.seeedstudio.com/Grove-Ultrasonic-Ranger-p-960.html).

## Pi Setup
Connect to wifi. If on GE Network, use Internet.
The keyboard may be in UK setup. If so, the @ key will be accessible by using the key where the " is located on the US layout.

## Hardware Setup
* Attach GrovePi board onto raspberry pi
* Attach Temperature and Humidity Sensor into Digital Port 4 of the GrovePi board
* Attach Ultrasonic Sensor into Digital Port 3 of the GrovePi board

### On the Raspberry Pi
```
git clone https://github.com/DexterInd/GrovePi.git
cd GrovePi/Script
chmod +x install.sh
sudo bash ./install.sh
```

## Running the Application
```
git clone https://github.com/lkvposs/predix-demos-edge-sensors.git
cd predix-demos-edge-sensors
npm install
node app.js
```
Note: if npm is not already installed on the pi, run the following commands:
```
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash
sudo apt-get install nodejs
```

## Updating app.js to Reflect New Asset Configuration
Open app.js
* Line 11: Set PI_IDENTIFIER to the asset's name. This asset must be represented in the dashboard's hierarchy.
* Line 23: Set the endpoint to point to the right asset hierarchy. E.g. change "west/arlington" to "texas/abilene"
* Line 41: Same as line 23

## Starting the Application Automatically on Boot
Open your pi's bash profile:
```
nano ~/.bashrc
```
Paste the following line at the end of the bash profile:
```
bash /home/pi/predix-demos-edge-sensors/runapp.sh
```
