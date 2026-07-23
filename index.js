//const express = require('express');
import express from 'express';
//const dbus = require('dbus-next');
import dbus from 'dbus-next';


//const fs = require('fs');
import fs, { read } from 'fs';

import { WebSocketServer } from 'ws';
import { createServer } from 'http';

import nodemailer from 'nodemailer';
import schedule from 'node-schedule';
let bus = dbus.sessionBus();
//let bus = dbus.systemBus(); // Use system bus for Hodr server
let Variant = dbus.Variant;

import { verifyToken, verifyTokenWebsocket, login, logout } from './auth.js';
import { getPower, setPower, setPowerCycle, parseStatus, parseCycleStatus } from './power.js';

//const { config } = require('./config.js');
import { config } from './config.js';
import { time } from 'console';

//import { send } from 'process';

let serviceName = config.dbus.serviceName;
let servicePath = config.dbus.servicePath;
let interfaceName = config.dbus.interfaceName;


const httpServer = createServer();
//const wss = new WebSocketServer({ port: config.wsPort });
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
    verifyTokenWebsocket(request, socket, head);
    if (!request.user) {
        console.log('WebSocket connection rejected due to invalid token');
        socket.destroy();
        return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

httpServer.listen(config.wsPort, () => {
    console.log(`WebSocket server is listening on port ${config.wsPort}`);
});



var object = null;
var iface = null;
var propsIface = null;
async function setupInterface() {
    object = await bus.getProxyObject(serviceName, servicePath);
    iface = object.getInterface(interfaceName);

    propsIface = object.getInterface('org.freedesktop.DBus.Properties');

}


function trySetupInterface() {
    setupInterface().then(() => {
        console.log('HODR interface set up successfully');
    }).catch(err => {
        console.error('Error setting up HODR interface:', err);
        setTimeout(trySetupInterface, 5000); // Retry after 5 seconds
    });
}
trySetupInterface();






//Nodemailer setup for sending email of results every day
const transport = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});




async function sendEmail(subject, text, attachments) {
    console.log(`Sending email with subject ${subject} to recipients:${process.env.EMAIL_RECIPIENTS}`);
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_RECIPIENTS,
        subject: subject,
        text: text,
        attachments: attachments
    };

    await transport.sendMail(mailOptions);
}

async function sendYesterdayData() {
    var date = new Date();
    console.log("Full date: ", date.toISOString());
    date.setDate(date.getDate() - 1);
    const dateString = date.toISOString().split("T")[0];
    console.log("DateString: ", dateString);
    const trios_file_list = await getFilesInRange('TriOS', dateString, dateString);
    console.log("TriosFiles:");
    console.log(trios_file_list);
    const hodr_file_list = await getFilesInRange('hodr', dateString, dateString);
    const trios_filename = `TriOS_${dateString}.csv`;
    const hodr_filename = `hodr_${dateString}.csv`;
    var attachmentList = [];
    if (trios_file_list.length >= 1) {
        const dataDir = getDataDir("TriOS");
        const triosAttachment = {
            filename: trios_filename,
            path: `${dataDir}/${trios_file_list[0]}`
        };

        attachmentList.push(triosAttachment);
    }

    if (hodr_file_list.length >= 1) {

        const dataDir = getDataDir("hodr");
        const content = await concatFiles("hodr", hodr_file_list);
        const hodrAttachment = {
            filename: hodr_filename,
            content: content
            //path: `${dataDir}/${hodr_file_list[0]}`
        };
        attachmentList.push(hodrAttachment);
    }


    if (attachmentList.length == 0) {
        console.log("No Attachments to send");
        return;
    }


    const subject = `HODR and TriOS Data ${dateString}`;
    const text = `Attached Data`;

    sendEmail(subject, text, attachmentList);
}

const sendDataJob = schedule.scheduleJob('0 10 2 * * *', function () {
    console.log("Sending data via email");
    sendYesterdayData();
});



const app = express();
const port = 3000;

app.use((req, res, next) => {
    console.log("hodr_server", req.path);
    next();
})

app.use(express.json());

app.use(express.static('static'));

app.use(express.urlencoded({ extended: true }));
//Use pug as the template engine
app.set('view engine', 'pug');
app.set('views', './views');

app.get('/login', (req, res) => {
    res.render('login', { title: 'Login' });
});

app.post('/login', (req, res) => {
    login(req, res);
});

app.get('/logout', (req, res) => {
    logout(req, res);
});


app.get('/', verifyToken, (req, res) => {
    console.log('Rendering HODR control panel');
    res.render('hodr', { title: 'Hodr Server Control Panel' });
});


app.get('/style.css', (req, res) => {
    res.sendFile(__dirname + '/www/style.css');
});


app.get('/data', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    let dataFile = await propsIface.Get(interfaceName, 'dataPath');

    console.log('Data file:', dataFile.value);

    fs.readFile(dataFile.value, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading data file:', err);
            res.status(500).send('Error reading data file');
            return;
        }


        var header = "timestamp,integration_time,pre_amp_gain,temperature,"
        var firstLine = data.split('\n')[0];
        var columns = firstLine.split(',').length - 3; // -3 to exclude the first three columns
        for (let i = 0; i < columns; i++) {
            header += `${i},`;
        }
        header = header.slice(0, -1); // Remove the last comma
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="spectrum_data.csv"');
        res.send(header + '\n' + data);
    });

});

app.get('/download', verifyToken, (req, res) => {
    res.render('download', { title: 'Download Data' });
});

function concatFiles(device, files) {
    return new Promise((resolve, reject) => {
        let data = '';
        const dataDir = getDataDir(device);


        if (!fs.existsSync(dataDir)) {
            return reject(new Error(`Data directory does not exist: ${dataDir}`));
        }


        //Sort files by date
        files.sort((a, b) => {
            const dateA = a.split('_')[0];
            const dateB = b.split('_')[0];
            return dateA.localeCompare(dateB);
        });
        var headerAdded = false;
        files.forEach((file, index) => {

            const filePath = `${dataDir}/${file}`;
            const fileData = fs.readFileSync(filePath, 'utf8');

            // If the file is empty, we skip it
            if (!fileData.trim()) {
                console.warn(`Skipping empty file: ${filePath}`);
                return;
            }

            if (!headerAdded) {
                // Add header only for the first file if device is HODR
                if (device === 'hodr') {
                    const header = "timestamp,integration_time,pre_amp_gain,temperature,read_mode,single_track_centre,single_track_height,";
                    data += header;
                    const firstLine = fileData.split('\n')[0];
                    const columns = firstLine.split(',').length - 7; // -3 to exclude the first three columns
                    for (let i = 0; i < columns; i++) {
                        data += `${i},`;
                    }
                    data = data.slice(0, -1) + '\n'; // Remove the last comma and add newline
                } else if (device.toLowerCase() === 'trios') {
                    // For TriOS, we assume the first line is the header
                    const firstLine = fileData.split('\n')[0];
                    data += firstLine + '\n'; // Add header from the first file
                }

                headerAdded = true;
            }

            if (device.toLowerCase() === 'trios') {
                // For TriOS, we skip the header line for subsequent files
                const lines = fileData.split('\n');
                for (let i = 1; i < lines.length; i++) { // Start from 1 to skip the header
                    if (lines[i].trim()) { // Check if the line is not empty
                        data += lines[i] + '\n';
                    }
                }
            }
            // For HODR, we just append the data as is
            else if (device === 'hodr') {
                const lines = fileData.split('\n');
                for (let i = 1; i < lines.length; i++) { // Start from 1 to skip the header
                    if (lines[i].trim()) { // Check if the line is not empty
                        data += lines[i] + '\n';
                    }
                }
            }


        });
        resolve(data);
    });
}


function getDataDir(device) {
    if (device === 'hodr') {
        return '../hodr_data';
    } else if (device.toLowerCase() === 'trios') {
        return '../RAMSES_DATA';
    } else {
        throw new Error('Invalid device specified');
    }
}



function getFilesInRange(device, startDate, endDate) {
    console.log("Start: ", startDate);
    console.log("End: ", endDate);
    console.log("Device: ", device);
    return new Promise((resolve, reject) => {
        const dataDir = getDataDir(device);
        fs.readdir(dataDir, (err, files) => {
            if (err) {
                console.error('Error reading data directory:', err);
                reject(err);
                return;
            }
            // Filter files by date
            const filteredFiles = files.filter(file => {
                const fileDate = file.split('_')[0];
                return fileDate >= startDate && fileDate <= endDate;
            });
            resolve(filteredFiles);
        });
    });
}



app.get('/download/last/:device/:days', (req, res) => { //removed verifyToken for testing
    const device = req.params.device;
    const days = req.params.days - 1; // Subtract 1 to include today in the download
    console.log(`Downloading last ${days} days of data for device: ${device}`);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = new Date().toISOString().split('T')[0];
    //get list of files in the data directory
    getFilesInRange(device, startDateString, endDateString).then(filteredFiles => {
        if (filteredFiles.length === 0) {
            return res.status(404).send('No data files found for the specified range');
        }
        console.log(`Filtered files: ${filteredFiles}`);
        concatFiles(device, filteredFiles).then(data => {

            res.setHeader('Content-Type', 'text/csv');
            var fileName = `${device}_data_${startDateString}_${endDateString}.csv`;
            if (startDateString === endDateString) {
                fileName = `${device}_data_${startDateString}.csv`;
            }
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(data);
        }).catch(err => {
            console.error('Error concatenating files:', err);
            res.status(500).send('Error concatenating files');
        });
    });
});


app.get('/display/last/:device/:days', (req, res) => {
    const device = req.params.device;
    const days = req.params.days - 1; // Subtract 1 to include today in the display
    console.log(`Displaying last ${days} days of data for device: ${device}`);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = new Date().toISOString().split('T')[0];
    //get list of files in the data directory
    getFilesInRange(device, startDateString, endDateString).then(filteredFiles => {
        if (filteredFiles.length === 0) {
            return res.status(404).send('No data files found for the specified range');
        }
        console.log(`Filtered files: ${filteredFiles}`);
        concatFiles(device, filteredFiles).then(data => {
            res.setHeader('Content-Type', 'text/html');
            res.render('data', { title: `${device} data`, data: data });
        }).catch(err => {
            console.error('Error concatenating files:', err);
            res.status(500).send('Error concatenating files');
        });
    });
});



app.get('/download/range/:device/:startDate/:endDate', verifyToken, (req, res) => {
    const device = req.params.device;
    const startDate = req.params.startDate;
    const endDate = req.params.endDate;
    console.log(`Downloading data for device: ${device} from ${startDate} to ${endDate}`);
    //get list of files in the data directory

    getFilesInRange(device, startDate, endDate).then(filteredFiles => {
        //concat all files into a single string
        concatFiles(device, filteredFiles).then(data => {
            const startDateString = new Date(startDate).toISOString().split('T')[0];
            const endDateString = new Date(endDate).toISOString().split('T')[0];
            res.setHeader('Content-Type', 'text/csv');
            var fileName = `${device}_data_${startDateString}_${endDateString}.csv`;
            if (startDateString === endDateString) {
                fileName = `${device}_data_${startDateString}.csv`;
            }
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(data);
        }).catch(err => {
            console.error('Error concatenating files:', err);
            res.status(500).send('Error concatenating files');
        });
    });
});


app.get('/download/all/:device', verifyToken, (req, res) => {
    const device = req.params.device;
    console.log(`Downloading all data for device: ${device}`);
    //get list of files in the data directory
    const dataDir = getDataDir(device);
    fs.readdir(dataDir, (err, files) => {
        if (err) {
            console.error('Error reading data directory:', err);
            res.status(500).send('Error reading data directory');
            return;
        }
        if (files.length === 0) {
            return res.status(404).send('No data files found');
        }
        console.log(`Files in directory: ${files}`);
        concatFiles(device, files).then(data => {
            res.setHeader('Content-Type', 'text/csv');
            const dateToday = new Date().toISOString().split('T')[0];
            res.setHeader('Content-Disposition', `attachment; filename="${device}_all_data_${dateToday}.csv"`);
            res.send(data);
        }).catch(err => {
            console.error('Error concatenating files:', err);
            res.status(500).send('Error concatenating files');
        });
    });
});

app.get('/download/email', verifyToken, (req, res) => {
    console.log("Sending yesterday's data via email");
    sendYesterdayData();
    res.redirect('/download');
});


function sendStatusUpdate(ws) {
    if (!iface) {
        console.error('HODR interface not set up. Please check if the HODR service is running.');
        ws.send('error: HODR interface not set up');
        return;
    }
    Promise.all([
        propsIface.Get(interfaceName, 'Temperature'),
        propsIface.Get(interfaceName, 'TargetTemperature'),
        propsIface.Get(interfaceName, 'TemperatureStatus'),
        propsIface.Get(interfaceName, 'active'),
        propsIface.Get(interfaceName, 'IntegrationTimeSecs'),
        propsIface.Get(interfaceName, 'acquisitionMode'),
        propsIface.Get(interfaceName, 'targetIntensity'),
        propsIface.Get(interfaceName, 'IntervalTimeSecs'),
        propsIface.Get(interfaceName, 'acquisitionStatus'),
        propsIface.Get(interfaceName, 'readMode'),
        propsIface.Get(interfaceName, 'SeriesLength'),
        propsIface.Get(interfaceName, 'singleTrackCentre'),
        propsIface.Get(interfaceName, 'singleTrackHeight'),
        propsIface.Get(interfaceName, 'PreAmpGain'),
        propsIface.Get(interfaceName, 'numberSpectra'),
        propsIface.Get(interfaceName, 'wallclockInterval'),
        propsIface.Get(interfaceName, 'wallclockAcquisitionActive'),
        propsIface.Get(interfaceName, 'wallclockNextCapture')
    ]).then(([temp, targetTemp, tempStatus, power, integrationTime, acqMode, targetIntensity, intervalTime, acqStatus, readMode, seriesLength, singleTrackCentre, singleTrackHeight, preAmpGain, nSpectra, wallclockInterval, wallclockAcquisitionActive, wallclockNextCapture]) => {
        let statusData = {
            temperature: temp.value,
            target_temperature: targetTemp.value,
            temperature_status: tempStatus.value,
            power_status: power.value,
            integration_time: integrationTime.value,
            interval_time: intervalTime.value,
            target_intensity: targetIntensity.value,
            acquisition_mode: acqMode.value,
            acquisition_status: acqStatus.value,
            read_mode: readMode.value,
            series_length: seriesLength.value,
            single_track_centre: singleTrackCentre.value,
            single_track_height: singleTrackHeight.value,
            pre_amp_gain: preAmpGain.value,
            number_spectra: nSpectra.value,
            wallclock_interval: wallclockInterval.value,
            wallclock_acquisition_active: wallclockAcquisitionActive.value,
            wallclock_next_capture: wallclockNextCapture.value
        }

        let message = {
            header: "status_data",
            payload: statusData
        }
        console.log('Sending status update to client.');
        ws.send(JSON.stringify(message));
    }).catch((err) => {
        console.error('Error fetching status:', err);
        ws.send('error: Error fetching status');
    });
}

function sendDataUpdate(ws) {
    if (!iface) {
        console.error('HODR interface not set up. Please check if the HODR service is running.');
        ws.send('error: HODR interface not set up');
        return;
    }
    iface.get_data().then((lastSpectrum) => {
        console.log('Last spectrum data received:', lastSpectrum);

        let spectrumData = {
            timestamp: lastSpectrum[0],
            integration_time: lastSpectrum[1],
            pre_amp_gain: lastSpectrum[2],
            temperature: lastSpectrum[3],
            read_mode: lastSpectrum[4],
            single_track_centre: lastSpectrum[5],
            single_track_height: lastSpectrum[6],
            data: lastSpectrum[7],
        }
        console.log('Last spectrum data to send:', spectrumData);

        let message = {
            header: "spectrum_data",
            payload: spectrumData
        }

        console.log('Sending last spectrum data to client');
        ws.send(JSON.stringify(message));
    });
}




wss.on('connection', (ws, request, client) => {
    wss.on('error', (error) => {
        console.error('WebSocket error:', error);
    });


    console.log(`WebSocket client connected from ${request.socket.remoteAddress}`);
    console.log(`Total connected clients: ${wss.clients.size}`);
    

    ws.send(JSON.stringify({ header: "connection_ack", payload: "Connected to HODR WebSocket server" }));
    sendStatusUpdate(ws);


    ws.on('message', (message) => {

        //parse the message as JSON if possible
        try {
            message = JSON.parse(message);
        } catch (e) {
            console.error('Error parsing message as JSON:', e);
            ws.send('error: Invalid JSON format');
            return;
        }

        let messageType = message.header;
        let messagePayload = message.payload;

        if (messageType == "get") {
            switch (messagePayload.value) {
                case "status":
                    console.log('Received get status request from client');
                    sendStatusUpdate(ws);
                    break;
                case "data":
                    console.log('Received get data request from client');
                    sendDataUpdate(ws);
                    break;
                default:
                    console.error('Unknown get request from client:', messagePayload.value);
                    ws.send('error: Unknown get request');
                    break;
            }
        }

        if (messageType == "action") {


            if (!iface) {
                console.error('HODR interface not set up. Please check if the HODR service is running.');
                ws.send('error: HODR interface not set up');
                return;

            }

            switch (messagePayload.action) {
                case "start_acquisition":
                    iface.start_acquisition().then((index) => {
                        console.log('Acquisition started with index:', index);
                        let message = {
                            header: "acquisition_started",
                            payload: {
                                index: index
                            }
                        }
                        ws.send(JSON.stringify(message));
                    }).catch((err) => {
                        console.error('Error starting acquisition:', err);
                        ws.send('error: Error starting acquisition');
                    });
                    break;
                case "stop_acquisition":
                    iface.stop_acquisition().then(() => {
                        console.log('Acquisition stopped');
                        let message = {
                            header: "acquisition_stopped",
                            payload: {}
                        }
                        ws.send(JSON.stringify(message));
                    }).catch((err) => {
                        console.error('Error stopping acquisition:', err);
                        ws.send('error: Error stopping acquisition');
                    });
                    break;
                case "set_integration_time":
                    let newIntegrationTime = messagePayload.value;
                    console.log("Setting integration time to", newIntegrationTime);
                    iface.set_integration_time(newIntegrationTime).then((result) => {
                        propsIface.Get(interfaceName, 'IntegrationTimeSecs').then((realIntegrationTime) => {
                            console.log("Set integration time to", realIntegrationTime);
                            ws.send(`Integration time set to ${realIntegrationTime}`);
                        }).catch((error) => {
                            console.log("Failed to get new integration time");
                            console.error(error);
                        });
                    }).catch((error) => {
                        console.error("Failed to set integration time");
                        console.error(error);
                    });
                    break;
                case "set_target_intensity":
                    let newTargetIntensity = messagePayload.value;
                    console.log("Setting target intensity to", newTargetIntensity);
                    iface.set_target_intensity(newTargetIntensity).then((result) =>
                    {
                        if (result) {
                            console.log("Successfully set target intensity")
                        } else {
                            console.error("Failed to set target intensity");
                        }
                    }).catch((error) =>
                    {
                        console.error("Error setting target intensity");
                    });
                    break;
                
                case "set_pre_amp_gain":
                    let newPreAmpGain = messagePayload.value;
                    console.log("Setting pre-amp gain to", newPreAmpGain);
                    iface.set_pre_amp_gain(newPreAmpGain).then((result) => {
                        if (result) {
                            console.log("Successfully set pre-amp gain");
                        } else {
                            console.error("Failed to set pre-amp gain");
                        }
                    }).catch((error) => {
                        console.error("Error setting pre-amp gain");
                    });
                    break;

                case "set_target_temperature":
                    let newTargetTemperature = messagePayload.value;
                    console.log("Setting target temperature to", newTargetTemperature);
                    iface.set_temperature(newTargetTemperature);
                    break;
                case "set_single_track":
                    let newSingleTrackCentre = messagePayload.value.centre;
                    let newSingleTrackHeight = messagePayload.value.height;
                    console.log("Setting single track to centre:", newSingleTrackCentre, "height:", newSingleTrackHeight);
                    iface.set_single_track(newSingleTrackCentre, newSingleTrackHeight).then((result) => {
                        if (result) {
                            console.log("Successfully set single track");
                        } else {
                            console.error("Failed to set single track");
                        }
                    }).catch((error) => {
                        console.error("Error setting single track");
                    });
                    break;
                case "set_read_mode":
                    let newReadMode = messagePayload.value;
                    console.log("Setting read mode to", newReadMode);
                    iface.set_read_mode(newReadMode).then((result) => {
                        if (result) {
                            console.log("Successfully set read mode");
                        } else {
                            console.error("Failed to set read mode");
                        }
                    }).catch((error) => {
                        console.error("Error setting read mode");
                        console.error(error);
                    });
                    break;
                case "set_acquisition_mode":
                    let newAcquisitionMode = parseInt(messagePayload.value);
                    console.log("Setting acquisition mode to", newAcquisitionMode);
                    iface.set_acquisition_mode(newAcquisitionMode).then((result) => {
                        if (result) {
                            console.log("Successfully set acquisition mode");
                        } else {
                            console.error("Failed to set acquisition mode");
                        }
                    }).catch((error) => {
                        console.error("Error setting acquisition mode");
                        console.error(error);
                    });
                    break;
                case "start_wallclock_acquisition":
                    console.log("Starting wallclock acquisition");
                    iface.start_wallclock_acquisition().then((result) => {
                        if (result) {
                            console.log("Successfully started wallclock acquisition");
                        } else {
                            console.error("Failed to start wallclock acquisition");
                        }
                    }).catch((error) => {
                        console.error("Error starting wallclock acquisition");
                    });
                    break;
                case "stop_wallclock_acquisition":
                    console.log("Stopping wallclock acquisition");
                    iface.stop_wallclock_acquisition().then((result) => {
                        if (result) {
                            console.log("Successfully stopped wallclock acquisition");
                        } else {
                            console.error("Failed to stop wallclock acquisition");
                        }
                    }).catch((error) => {
                        console.error("Error stopping wallclock acquisition");
                    });
                    break;
                case "set_wallclock_interval":
                    let newWallclockInterval = messagePayload.value;
                    console.log("Setting wallclock interval to", newWallclockInterval);
                    iface.set_wallclock_interval(newWallclockInterval).then((result) => {
                        if (result) {
                            console.log("Successfully set wallclock interval");
                        } else {
                            console.error("Failed to set wallclock interval");
                        }
                    }).catch((error) => {
                        console.error("Error setting wallclock interval");
                    });
                    break;
                case "set_series_length":
                    let newSeriesLength = messagePayload.value;
                    console.log("Setting series length to", newSeriesLength);
                    iface.set_series_length(newSeriesLength).then((result) => {
                        if (result) {
                            console.log("Successfully set series length");
                        } else {
                            console.error("Failed to set series length");
                        }
                    }).catch((error) => {
                        console.error("Error setting series length");
                    });
                    break;
                case "set_power":
                    let newPowerStatus = messagePayload.value;
                    console.log("Setting power status to", newPowerStatus);
                    if (newPowerStatus) {
                        iface.activate().then((result) => {
                            if (result) {
                                console.log("Successfully activated device");
                            } else {
                                console.error("Failed to activate device");
                            }
                        }).catch((error) => {
                            console.error("Error activating device");
                        });
                    } else {
                        iface.deactivate().then((result) => {
                            if (result) {
                                console.log("Successfully deactivated device");
                            } else {
                                console.error("Failed to deactivate device");
                            }
                        }).catch((error) => {
                            console.error("Error deactivating device");
                        });
                    }
                    break;
                
                default:
                    console.error('Unknown action request from client:', messagePayload.action);
                    ws.send('error: Unknown action request');
                    break;

            }
        }
    });


    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});


function addInterfaceListeners() {
    if (!iface) {
        console.error('HODR interface not set up. Please check if the HODR service is running.');
        setTimeout(addInterfaceListeners, 100); // Retry after 100ms
        return;
    }


    propsIface.on('PropertiesChanged', (interfaceName, changedProperties, invalidatedProperties) => {
        console.log(`Properties changed on interface ${interfaceName}:`, changedProperties);
        console.log(`Invalidated properties:`, invalidatedProperties);
        wss.clients.forEach((client) => {
            console.log(`Client readyState: ${client.readyState}`);
            if (client.readyState == 1) {
                let message = {
                    header: "properties_changed",
                    payload: {
                        changedProperties: changedProperties,
                        invalidatedProperties: invalidatedProperties
                    }
                }

                client.send(JSON.stringify(message));

                if (changedProperties.hasOwnProperty('active')) {
                    if (changedProperties.active.value) {
                        console.log('Device active, sending status update to client');
                        sendStatusUpdate(client);
                    }
                }
            } else {
                console.log(`Client not open, readyState: ${client.readyState}`);
            }
        });
    });

    iface.on('acquisition_finished', (index) => {
        console.log(`Acquisition finished with index: ${index}`);
        console.log(`Clients connected: ${wss.clients.size}`);
        wss.clients.forEach((client) => {
            console.log(`Client readyState: ${client.readyState}`);
            if (client.readyState == 1) {
                console.log(`Sending message to client: Acquisition finished with index: ${index}`);

                let message = {
                    header: "acquisition_finished",
                    payload: {
                        index: index
                    }
                }
                client.send(JSON.stringify(message));
                //client.send(`acquisition finished`);
            } else {
                console.log(`Client not open, readyState: ${client.readyState}`);
            }
        });
    });

    iface.on('power_on', () => {
        console.log('Power on event received from HODR interface');
        wss.clients.forEach((client) => {
            console.log(`Client readyState: ${client.readyState}`);
            sendStatusUpdate(client);
        });
    });




    console.log('Added acquisition_finished listener to HODR interface');
}

addInterfaceListeners();


app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
