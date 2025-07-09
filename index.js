const express = require('express');
const dbus = require('dbus-next');
const fs = require('fs');
let bus = dbus.sessionBus();
//let bus = dbus.systemBus(); // Use system bus for Hodr server
let Variant = dbus.Variant;

let serviceName = 'hodr.server.Control';
let servicePath = '/hodr/server/Control';
let interfaceName = 'hodr.server.Control';



var object = null;
var iface = null;
var propsIface = null;
async function setupInterface() {
    object = await bus.getProxyObject(serviceName, servicePath);
    iface = object.getInterface(interfaceName);

    propsIface = object.getInterface('org.freedesktop.DBus.Properties');

}

setupInterface();

const app = express();
const port = 3000;

app.use(express.json());

app.use(express.static('www'));


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/www/index.html');
});

//favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(__dirname + '/www/favicon.ico');
});

app.get('/style.css', (req, res) => {
    res.sendFile(__dirname + '/www/style.css');
});


app.get('/status', (req, res) => {

    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }


    let tempPromise =propsIface.Get(interfaceName, 'Temperature');
    let targetTempPromise = propsIface.Get(interfaceName, 'TargetTemperature');
    let tempStatusPromise = propsIface.Get(interfaceName, 'TemperatureStatus');
    let powerPromise = propsIface.Get(interfaceName, 'active');
    let acqStatusPromise = propsIface.Get(interfaceName, 'acquisitionStatus');
    let nSpectraPromise = propsIface.Get(interfaceName, 'numberSpectra');

    Promise.all([tempPromise, targetTempPromise, tempStatusPromise, powerPromise, acqStatusPromise, nSpectraPromise])
        .then(([temp, targetTemp, tempStatus, power, acqStatus, nSpectra]) => {
            res.json({
                temperature: temp.value,
                target_temperature: targetTemp.value,
                temperature_status: tempStatus.value,
                power_status: power.value,
                acquisition_status: acqStatus.value,
                number_spectra: nSpectra.value
            });
        })
        .catch(err => {
            console.error('Error fetching properties:', err);
            res.status(500).send('Error fetching properties');
        });
    
});


app.get('/activate', async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }

    await iface.activate();

    res.send('Activation command sent');
});

app.get('/deactivate', async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    await iface.deactivate();
    res.send('Deactivation command sent');
});

app.get('/last_spectrum', async (req, res) => {
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
            temperature: lastSpectrum[2],
            data: lastSpectrum[3],
        }
        res.json(spectrumData);
    } catch (err) {
        console.error('Error fetching last spectrum:', err);
        res.status(500).send('Error fetching last spectrum');
    }
});


app.post('/start_acquisition', async (req, res) => {
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

app.get('/stop_acquisition', async (req, res) => {
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


app.post('/set_target_intensity', async (req, res) => {
    if (!iface) {
        res.status(500).send('Interface not set up. Please wait for the service to be ready.');
        return;
    }
    if (typeof req.body.intensity !== 'number' || req.body.intensity < 0) {
        return res.status(400).send('Invalid intensity value. It should be a non-negative number.');
    }
    try {
        let result = await iface.set_target_intensity(req.body.intensity);
        if (result.value) {
            console.log('Target intensity set to:', req.body.intensity);
            res.send(`Target intensity set to ${req.body.intensity}`);
        } else {
            console.error('Failed to set target intensity:', result.value);
            res.status(500).send('Failed to set target intensity');
        }
    } catch (err) {
        console.error('Error setting target intensity:', err);
        res.status(500).send('Error setting target intensity');
    }
});

app.post('/set_target_temperature', async (req, res) => {
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


app.get('/data', async (req, res) => {
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

        
        var header = "number,timestamp,integration_time,temperature,"
        var firstLine = data.split('\n')[0];
        var columns = firstLine.split(',').length - 4; // -4 to exclude the first four columns
        for (let i = 0; i < columns; i++) {
            header += `${i},`;
        }
        header = header.slice(0, -1); // Remove the last comma
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="spectrum_data.csv"');
        res.send(header + '\n' + data);
    });




});






app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});