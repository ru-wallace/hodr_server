//const express = require('express');
import express from 'express';
//const dbus = require('dbus-next');
import dbus from 'dbus-next';
//const fs = require('fs');
import fs from 'fs';

import nodemailer from 'nodemailer';
import schedule from 'node-schedule';
let bus = dbus.sessionBus();
//let bus = dbus.systemBus(); // Use system bus for Hodr server
let Variant = dbus.Variant;

import { verifyToken, login, logout } from './auth.js';
import {  getPower, setPower, setPowerCycle , parseStatus, parseCycleStatus} from './power.js';

//const { config } = require('./config.js');
import { config } from './config.js';

let serviceName = config.dbus.serviceName;
let servicePath = config.dbus.servicePath;
let interfaceName = config.dbus.interfaceName;



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
		to:   process.env.EMAIL_RECIPIENTS,
		subject: subject,
		text:    text,
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
	if (trios_file_list.length >= 1)
	{
		const dataDir = getDataDir("TriOS");
		const triosAttachment = {
			filename: trios_filename,
			path: `${dataDir}/${trios_file_list[0]}`
		};
		
		attachmentList.push(triosAttachment);
	}

	if (hodr_file_list.length >= 1)
	{
	
		const dataDir = getDataDir("hodr");
		const content = await concatFiles("hodr", hodr_file_list);
		const hodrAttachment = {
			filename: hodr_filename,
			content: content
			//path: `${dataDir}/${hodr_file_list[0]}`
		};
		attachmentList.push(hodrAttachment);
	}


	if (attachmentList.length == 0)
	{
		console.log("No Attachments to send");
		return;
	}


	const subject = `HODR and TriOS Data ${dateString}`;
	const text = `Attached Data`;
	
	sendEmail(subject, text, attachmentList);
}

const sendDataJob = schedule.scheduleJob('0 10 2 * * *', function() {
	console.log("Sending data via email");
	sendYesterdayData();
});
//const sendDataJob2 = schedule.scheduleJob('0 51 * * * *', function() {
//	console.log("Sending data via email");
//	sendYesterdayData();
//});




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
// HI
//favicon
// app.get('/favicon.ico', (req, res) => {
//     res.sendFile(__dirname + '/www/favicon.ico');
// });

app.get('/style.css', (req, res) => {
    res.sendFile(__dirname + '/www/style.css');
});


app.get('/status', verifyToken, (req, res) => {

    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }


    let tempPromise =propsIface.Get(interfaceName, 'Temperature');
    let targetTempPromise = propsIface.Get(interfaceName, 'TargetTemperature');
    let tempStatusPromise = propsIface.Get(interfaceName, 'TemperatureStatus');
    let powerPromise = propsIface.Get(interfaceName, 'active');
    let integrationTimePromise = propsIface.Get(interfaceName, 'IntegrationTimeSecs');
    let acqStatusPromise = propsIface.Get(interfaceName, 'acquisitionStatus');
    let nSpectraPromise = propsIface.Get(interfaceName, 'numberSpectra');
    let wallclockIntervalPromise = propsIface.Get(interfaceName, 'wallclockInterval');
    let wallclockAcquisitionActivePromise = propsIface.Get(interfaceName, 'wallclockAcquisitionActive');
    let wallclockNextCapturePromise = propsIface.Get(interfaceName, 'wallclockNextCapture');
    Promise.all([tempPromise, targetTempPromise, tempStatusPromise, powerPromise, integrationTimePromise, acqStatusPromise, nSpectraPromise, wallclockIntervalPromise, wallclockAcquisitionActivePromise, wallclockNextCapturePromise])
        .then(([temp, targetTemp, tempStatus, power, integrationTime, acqStatus, nSpectra, wallclockInterval, wallclockAcquisitionActive, wallclockNextCapture]) => {
            res.json({
                temperature: temp.value,
                target_temperature: targetTemp.value,
                temperature_status: tempStatus.value,
                power_status: power.value,
                integration_time: integrationTimePromise.value,
                acquisition_status: acqStatus.value,
                number_spectra: nSpectra.value,
                wallclock_interval: wallclockInterval.value,
                wallclock_acquisition_active: wallclockAcquisitionActive.value,
                wallclock_next_capture: wallclockNextCapture.value
            });
        })
        .catch(err => {
            console.error('Error fetching properties:', err);
            res.status(500).send('Error fetching properties');
        });
    
});


app.get('/activate', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    await iface.activate();

    res.send('Activation command sent');
});

app.get('/deactivate', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    await iface.deactivate();
    res.send('Deactivation command sent');
});

app.get('/last_spectrum', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    try {
        let lastSpectrum = await iface.get_data();
        //console.log('Last spectrum data received:', lastSpectrum);
        let spectrumData = {
            timestamp: lastSpectrum[0],
            integration_time: lastSpectrum[1] ,
            pre_amp_gain: lastSpectrum[2],
            temperature: lastSpectrum[3],
            data: lastSpectrum[4],
        }
        console.log(spectrumData)
        res.json(spectrumData);
    } catch (err) {
        console.error('Error fetching last spectrum:', err);
        res.status(500).send('Error fetching last spectrum');
    }
});


app.get('/integration_time', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    try {
        let integrationTime = await propsIface.Get(interfaceName, 'IntegrationTimeSecs');
        console.log('Integration time received:', integrationTime.value);
        res.json({ integration_time: integrationTime.value });
    } catch (err) {
        console.error('Error fetching integration time:', err);
        res.status(500).send('Error fetching integration time');
    }
});

app.post('/start_acquisition', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    // Get the acquisition parameters from the request body
    console.log(req.body);
    let acquisitionMode = 0;
    switch (req.body.acquisition_mode) {
        case 'single':
            acquisitionMode = 1;
            break;
        case 'series':
            acquisitionMode = 3;
            break;
        case 'continuous':
            acquisitionMode = 5;
            break;
        default:
            return res.status(400).send('Invalid acquisition mode');
    }

    console.log('Starting acquisition with parameters:', {
        integration_time: req.body.integration_time,
        interval_time: req.body.interval_time,
        acquisition_mode: acquisitionMode,
        n_captures: req.body.n_captures
    });

    var index = await iface.start_acquisition(req.body.integration_time, req.body.interval_time, acquisitionMode, req.body.n_captures);
    console.log('Acquisition started with index:', index);


    res.send('Acquisition started');
});

app.get('/stop_acquisition', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    try {
        await iface.stop_acquisition();
        res.send('Acquisition stopped');
    } catch (err) {
        console.error('Error stopping acquisition:', err);
        res.status(500).send('Error stopping acquisition');
    }
});

app.post('/set_integration_time', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    if (typeof req.body.integration_time !== 'number' || req.body.integration_time < 0) {
        return res.status(400).send('Invalid integration time value. It should be a positive number.');
    }
    try {
        let result = await iface.set_integration_time(req.body.integration_time);
        if (result) {
            let integrationTime = await propsIface.Get(interfaceName, 'IntegrationTimeSecs');

            console.log('Integration time set to:', integrationTime.value);
            res.send(`${integrationTime.value}`);
        } else {
            console.error('Failed to set integration time:', result);
            res.status(500).send('Failed to set integration time');
        }
    } catch (err) {
        console.error('Error setting integration time:', err);
        res.status(500).send('Error setting integration time');
    }
});

app.post('/set_pre_amp_gain', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    if (typeof req.body.preamp_gain !== 'number' || req.body.preamp_gain < 0) {
        return res.status(400).send('Invalid preamp gain value. It should be a non-negative number.');
    }
    try {
        // turn the preamp gain into a boolean value for the D-Bus method
        let preampGainValue = req.body.preamp_gain > 0 ? true : false;
        let result = await iface.set_pre_amp_gain(preampGainValue);
        if (result) {
            console.log('Preamp gain set to:', req.body.preamp_gain);
            res.send(`Preamp gain set to ${req.body.preamp_gain}`);
        } else {
            console.error('Failed to set preamp gain:', result);
            res.status(500).send('Failed to set preamp gain');
        }
    } catch (err) {
        console.error('Error setting preamp gain:', err);
        res.status(500).send('Error setting preamp gain');
    }
});

app.get('/preamp_gain', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    try {
        let preampGain = await propsIface.Get(interfaceName, 'PreAmpGain');
        res.json({ preamp_gain: preampGain.value });
    } catch (err) {
        console.error('Error fetching preamp gain:', err);
        res.status(500).send('Error fetching preamp gain');
    }

});

app.get('/target_intensity', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    try {
        let targetIntensity = await propsIface.Get(interfaceName, 'targetIntensity');
        res.json({ target_intensity: targetIntensity.value });
    } catch (err) {
        console.error('Error fetching target intensity:', err);
        res.status(500).send('Error fetching target intensity');
    }
});


app.post('/set_target_intensity', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    if (typeof req.body.intensity !== 'number' || req.body.intensity < 0) {
        return res.status(400).send('Invalid intensity value. It should be a non-negative number.');
    }
    try {
        let result = await iface.set_target_intensity(req.body.intensity);
        if (result) {
            console.log('Target intensity set to:', req.body.intensity);
            res.send(`Target intensity set to ${req.body.intensity}`);
        } else {
            console.error('Failed to set target intensity:', result);
            res.status(500).send('Failed to set target intensity');
        }
    } catch (err) {
        console.error('Error setting target intensity:', err);
        res.status(500).send('Error setting target intensity');
    }
});

app.post('/set_target_temperature', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }  
    if (typeof req.body.target_temperature !== 'number') {
        return res.status(400).send('Invalid target temperature value. It should be a number.');
    }
    try {
        let result = await iface.set_temperature(req.body.target_temperature);
        if (result.value) {
            console.log('Target temperature set to:', req.body.target_temperature);
            res.send(`Target temperature set to ${req.body.target_temperature}`);
        } else {
            console.error('Failed to set target temperature:', result.value);
            res.status(500).send('Failed to set target temperature');
        }
    } catch (err) {
        console.error('Error setting target temperature:', err);
        res.status(500).send('Error setting target temperature');
    }
});

app.get('/get_wallclock_interval', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    try {
        let wallclockInterval = await propsIface.Get(interfaceName, 'wallclockInterval');
        console.log('Wallclock interval received:', wallclockInterval.value);
        res.json({ wallclock_interval: wallclockInterval.value });
    } catch (err) {
        console.error('Error fetching wallclock interval:', err);
        res.status(500).send('Error fetching wallclock interval');
    }
});

app.get('/get_wallclock_status', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    try {
        let wallclockStatus = await propsIface.Get(interfaceName, 'wallclockAcquisitionActive');
        console.log('Wallclock acquisition status received:', wallclockStatus.value);
        res.json({ wallclock_acquisition_active: wallclockStatus.value });
    } catch (err) {
        console.error('Error fetching wallclock acquisition status:', err);
        res.status(500).send('Error fetching wallclock acquisition status');
    }
});


app.post('/set_wallclock_interval', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    if (typeof req.body.interval !== 'number' || req.body.interval <= 0) {
        return res.status(400).send('Invalid interval value. It should be a positive number.');
    }
    try {
        console.log('Setting wallclock interval to:', req.body.interval);
        let result = await iface.set_wallclock_interval(req.body.interval);
        console.log('Wallclock interval set result:', result);
        if (result) {
            console.log('Wallclock interval set to:', req.body.interval);
            res.send(`Wallclock interval set to ${req.body.interval}`);
        } else {
            console.error('Failed to set wallclock interval.');
            res.status(500).send('Failed to set wallclock interval');
        }
    } catch (err) {
        console.error('Error setting wallclock interval:', err);
        res.status(500).send('Error setting wallclock interval');
    }
});

app.get('/start_wallclock_acquisition', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }   
    try {
        let result = await iface.start_wallclock_acquisition();
        if (result) {
            console.log('Wallclock acquisition started');
            res.send('Wallclock acquisition started');
        } else {
            console.error('Failed to start wallclock acquisition.');                          
            res.status(500).send('Failed to start wallclock acquisition');
        }
    } catch (err) {
        console.error('Error starting wallclock acquisition:', err);
        res.status(500).send('Error starting wallclock acquisition');       
    }
});

app.get('/stop_wallclock_acquisition', verifyToken, async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }       
    try {
        let result = await iface.stop_wallclock_acquisition();
        if (result) {     
            console.log('Wallclock acquisition stopped');
            res.send('Wallclock acquisition stopped');
        } else {
            console.error('Failed to stop wallclock acquisition.');
            res.status(500).send('Failed to stop wallclock acquisition');
        }
    } catch (err) {
        console.error('Error stopping wallclock acquisition:', err);
        res.status(500).send('Error stopping wallclock acquisition');
    }
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
                    const header = "timestamp,integration_time,temperature,";
                    data += header;
                    const firstLine = fileData.split('\n')[0];
                    const columns = firstLine.split(',').length - 3; // -3 to exclude the first three columns
                    for (let i = 0; i < columns; i++) {
                        data += `${i},`;
                    }
                    data = data.slice(0, -1) + '\n'; // Remove the last comma and add newline
                } else if (device === 'TriOS') {
                    // For TriOS, we assume the first line is the header
                    const firstLine = fileData.split('\n')[0];
                    data += firstLine + '\n'; // Add header from the first file
                }

                headerAdded = true;
            }

            if (device === 'TriOS') {
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
    } else if (device === 'TriOS') {
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



app.get('/download/last/:device/:days', verifyToken, (req, res) => {
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


app.get('/display/last/:device/:days', verifyToken, (req, res) => {
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
            res.render('data', { title: 'Data Display', data: data });
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



app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
