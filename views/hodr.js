

var currentTemperatureValue = null;
var currentTargetTemperatureValue = null;
var currentConnectionStatus = false;
var acquisitionInProgress = false;
var wallclockNextCapture = null;

var socket = null; // WebSocket variable to be used across functions

const temperatureData = [];
const targetTemps = [];
const timestamps = [];
var powerON = false;
var quickAdjustmentMode = false;
Chart.defaults.backgroundColor = '#333';
Chart.defaults.borderColor = '#aaaaaa';
Chart.defaults.color = '#ffffff';
var spectrumReference;


const wl_calibration_coefficients = [-2.71441094e-05, 5.31251935e-01, 3.39244276e+02]

var getTempInterval;

var autoAcquisitionIntervalHandle;


var wallclockAcquisitionInterval;
var wallclockAcquisitionActive = false;

var nSpectra = 0;
var controlMode = 'int-time-mode';
const tempChart = new Chart(temperatureCanvas, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Temperature',
            data: [],
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            fill: false,
            tension: 0.1
        },
        {
            label: 'Target Temperature',
            data: [],
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            fill: false,
            borderDash: [5, 5],
            tension: 0.1
        }]
    },


    options: {
        responsive: true,
        maintainAspectRatio: false,
        annotation: {
            annotations: []
        },
        scales: {
            y: {
                title: {
                    display: true,
                    text: 'Temperature (°C)'
                },

            },
            x: {
                type: 'time',
                time: {
                    minUnit: 'second',

                    tooltipFormat: 'MMM DD, YYYY, HH:mm:ss',
                    displayFormats: {
                        second: 'HH:mm:ss'
                    }
                },
                ticks: {
                    stepSize: 5,
                },
                display: true,
                title: {
                    display: true,
                    text: 'Timestamp'
                }
            }

        }

    }

});


const spectrumChart = new Chart(spectrumCanvas, {
    type: 'scatter',

    data: {
        //labels: [],
        datasets: [{
            label: 'Spectrum',
            data: [],
            borderColor: 'rgba(153, 102, 255, 1)',
            backgroundColor: 'rgba(153, 102, 255, 0.2)',
            fill: false,
            tension: 0.1
        },
        {
            label: 'Target Peak Intensity',
            data: [],
            borderColor: 'rgba(255, 159, 64, 1)',
            backgroundColor: 'rgba(255, 159, 64, 0.2)',
            fill: false,
        }]

    },
    options: {
        showLine: true,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                title: {
                    display: true,
                    text: 'Intensity'
                },
                min: 580,
                max: 66000,
                type: 'logarithmic',
            },
            x: {
                min: 339,
                max: 860,
                title: {
                    display: true,
                    text: 'Wavelength (nm)'
                },
                ticks: {
                    stepSize: 50
                }

            }
        }
    }
});


function applyWavelengthCalibration(indices, sigFig = 2) {
    return indices.map(index => {
        const wavelength = (wl_calibration_coefficients[0] * Math.pow(index, 2) +
            wl_calibration_coefficients[1] * index +
            wl_calibration_coefficients[2]).toFixed(sigFig);
        return wavelength;
    });
}

function updateTemperatureChart() {

    setTimeout(updateTemperatureChart, 1000); // Retry after 1 second
    if (tempChart === undefined || tempChart === null || !powerON || !currentConnectionStatus) {
        return;
    }


    const time = new Date();
    //console.log('Updating temperature chart at:', time.toLocaleTimeString());

    if (currentTemperatureValue !== null) {
        temperatureData.push({
            x: time,
            y: currentTemperatureValue
        });
    }

    if (currentTargetTemperatureValue !== null) {
        targetTemps.push({
            x: time,
            y: currentTargetTemperatureValue
        });

        if (temperatureData.length > 50) {
            temperatureData.shift();
            targetTemps.shift();
        }

        //tempChart.data.labels = timestamps.map(t => t.toLocaleTimeString());
        tempChart.data.datasets[0].data = temperatureData;
        tempChart.data.datasets[1].data = targetTemps;
        tempChart.update();
    }
}

function handleNewTemperature(newTemperature) {
    console.log('New temperature received:', newTemperature);
    const time = new Date();

    currentTemperatureValue = newTemperature;

    currentTemperature.textContent = newTemperature.toFixed(2);
    tempLastUpdated.textContent = time.toLocaleTimeString();
}

function handleNewTargetTemperature(newTargetTemperature) {
    console.log('New target temperature received:', newTargetTemperature);

    currentTargetTemperatureValue = newTargetTemperature;
    currentTargetTemperature.textContent = newTargetTemperature.toFixed(2);
}

function handleNewTemperatureStatus(newTemperatureStatus) {
    console.log('New temperature status received:', newTemperatureStatus);
    const status = newTemperatureStatus.trim().replace(/['"]+/g, '');
    if (status === 'Temperature not reached') {
        currentTemperatureStatus.className = 'not-reached';
        currentTemperatureStatus.innerHTML = 'Not Reached Target';
    } else if (status === 'Temperature not stabilized') {
        currentTemperatureStatus.className = 'not-stabilized';
        currentTemperatureStatus.innerHTML = 'Stabilizing';
    } else if (status === 'Temperature stabilized') {

        currentTemperatureStatus.className = 'stabilized';
        currentTemperatureStatus.innerHTML = 'Stabilized';
    } else if (status === 'Acquiring Data') {
        currentTemperatureStatus.className = 'not-stabilized';
        currentTemperatureStatus.innerHTML = 'Acquiring Data';
    } else {
        currentTemperatureStatus.className = '';
        currentTemperatureStatus.innerHTML = status;
    }
}


function handleNewTemperatureData(newTemperature, newTargetTemperature, newTemperatureStatus) {
    console.log('New temperature data received:', newTemperature, newTargetTemperature, newTemperatureStatus);
    const time = new Date();
    const time_unix = time.getTime();
    timestamps.push(time);

    // temperatureData.push({
    //     x: time,
    //     y: newTemperature
    // });

    targetTemps.push({
        x: time,
        y: newTargetTemperature
    });

    //temperatureData.push(newTemperature.toFixed(2));
    //targetTemps.push(newTargetTemperature.toFixed(2));

    if (temperatureData.length > 50) {
        temperatureData.shift();
        timestamps.shift();
        targetTemps.shift();
    }

    //tempChart.data.labels = timestamps.map(t => t.toLocaleTimeString());
    tempChart.data.datasets[0].data = temperatureData;
    tempChart.data.datasets[1].data = targetTemps;
    tempChart.update();

    currentTemperature.textContent = newTemperature.toFixed(2);
    currentTargetTemperature.textContent = newTargetTemperature.toFixed(2);
    tempLastUpdated.textContent = time.toLocaleTimeString();

    const status = newTemperatureStatus.trim().replace(/['"]+/g, '');
    console.log('Current temperature status:', status);
    tempLastUpdated.textContent = time.toLocaleTimeString();

    if (status === 'Temperature not reached') {
        currentTemperatureStatus.className = 'not-reached';
        currentTemperatureStatus.innerHTML = 'Not Reached Target';
    } else if (status === 'Temperature not stabilized') {
        currentTemperatureStatus.className = 'not-stabilized';
        currentTemperatureStatus.innerHTML = 'Stabilizing';
    } else if (status === 'Temperature stabilized') {

        currentTemperatureStatus.className = 'stabilized';
        currentTemperatureStatus.innerHTML = 'Stabilized';
    } else if (status === 'Acquiring Data') {
        currentTemperatureStatus.className = 'not-stabilized';
        currentTemperatureStatus.innerHTML = 'Acquiring Data';
    } else {
        currentTemperatureStatus.className = '';
        currentTemperatureStatus.innerHTML = status;
    }

}

function handleNewPreAmpGain(newPreAmpGain) {
    console.log('New preamp gain received:', newPreAmpGain);
    preampGainSelect.value = newPreAmpGain? "1" : "0"; // Assuming 1 for ON and 0 for OFF, adjust as necessary
}

function handleNewPowerStatus(newPowerStatus, unknown = false) {
    console.log('New power status received:', newPowerStatus);

    if (unknown) {
        powerButton.classList.remove('on', 'off');
        powerButton.classList.add('unknown');
        currentTemperature.textContent = '-';
        currentTargetTemperature.textContent = '-';
        currentTemperatureStatus.textContent = 'Unknown';
        currentTemperatureStatus.classList.remove('stabilized', 'not-reached', 'not-stabilized');
        captureButton.textContent = 'Capture';
        captureButton.classList.add('disabled');
        return;
    }

    powerON = newPowerStatus;

    if (newPowerStatus) {
        powerButton.classList.remove('off');
        powerButton.classList.add('on');
    } else {
        powerButton.classList.remove('on');
        powerButton.classList.add('off');

        currentTemperature.textContent = '-';
        currentTargetTemperature.textContent = '-';
        currentTemperatureStatus.textContent = 'Power OFF';
        currentTemperatureStatus.classList.remove('stabilized', 'not-reached', 'not-stabilized');
        captureButton.textContent = 'Capture';
        captureButton.classList.add('disabled');
    }


}

function handleNewTargetIntensity(newTargetIntensity) {
    targetIntensityInput.value = newTargetIntensity;
}

function handleNewAcquisitionMode(newAcquisitionMode) {
    console.log('New acquisition mode received:', newAcquisitionMode);
    acquisitionModeSelect.value = newAcquisitionMode;
    updateAcqOptionsFields();
}

function handleNewAcquisitionStatus(newAcquisitionStatus) {



    if (!powerON) {
        captureButton.textContent = 'Capture';
        captureButton.classList.add('disabled');
        currentAcquisitionStatus.textContent = 'Power OFF';
        acquisitionInProgress = false;

        return;
    } else {
        captureButton.classList.remove('disabled');
    }
    console.log('New acquisition status received:', newAcquisitionStatus);
    if (newAcquisitionStatus === 20073) {
        captureButton.textContent = 'Capture';
        captureButton.classList.remove('disabled');
        acquisitionInProgress = false;
        currentAcquisitionStatus.textContent = 'Idle...';

    } else if (newAcquisitionStatus === 20074) {
        captureButton.disabled = true;
        currentAcquisitionStatus.textContent = 'Temp Cycle in Progress...';

    } else if (newAcquisitionStatus === 20072) {
        captureButton.textContent = 'Stop';
        captureButton.classList.remove('disabled');
        currentAcquisitionStatus.textContent = 'Acquiring...';
        acquisitionInProgress = true;
    } else {
        captureButton.textContent = 'Capture';
        captureButton.classList.remove('disabled');
        currentAcquisitionStatus.textContent = `Unknown status: ${newAcquisitionStatus}`;
        acquisitionInProgress = false;
    }



}


function calculateNextAcquisitionTime(interval) {
    const now = new Date();
    // Get time at start of current hour
    const tracker = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

    while (tracker < now) {
        tracker.setMinutes(tracker.getMinutes() + interval);
    }

    const nextTime = tracker.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    nextAcquisitionTime.textContent = nextTime;

}



function handleWallclockStatusUpdate(active) {
    console.log('Wallclock acquisition status updated:', active);
    if (wallclockAcquisitionActive) {

        wallclockStatusValue.textContent = 'On';
        wallclockStatusValue.classList.remove('off');
        wallclockStatusValue.classList.add('on');
        toggleWallclockButton.textContent = 'Stop';
        nextAcquisitionTime.classList.remove('hidden');
    } else {
        nextAcquisitionTime.classList.add('hidden');
        wallclockStatusValue.textContent = 'Off';
        wallclockStatusValue.classList.remove('on');
        wallclockStatusValue.classList.add('off');
        toggleWallclockButton.textContent = 'Start';
    }
}

function handleWallclockNextAcquisitionTime(nextCapture) {
    if (!nextCapture || nextCapture === null) {
        console.log('Wallclock next capture is null, skipping update.');
        nextAcquisitionTime.textContent = 'N/A';
        return;
    }
    console.log('Wallclock next capture updated:', nextCapture);
    wallclockNextCapture = nextCapture;

    const nextCaptureDate = new Date(wallclockNextCapture * 1000); // Convert seconds to milliseconds
    console.log('Wallclock next capture:', nextCaptureDate);
    nextAcquisitionTime.textContent = nextCaptureDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function handleWallclockIntervalUpdate(interval) {
    console.log('Wallclock acquisition interval updated:', interval);
    wallclockAcquisitionInterval = interval;
    wallclockAcquisitionIntervalInput.value = wallclockAcquisitionInterval;
}


function handleConnectionChange(connectionStatus) {

    currentConnectionStatus = connectionStatus;
    console.log('Connection status changed:', connectionStatus);


    if (connectionStatus) {
        connectionStatusIcon.classList.remove('disconnected', 'unknown');
        connectionStatusIcon.classList.add('connected');

        wallclockStatusValue.classList.remove('unknown');
        currentAcquisitionStatus.textContent = '-';

    } else {
        wallclockStatusValue.classList.remove('on', 'off');
        connectionStatusIcon.classList.remove('connected', 'unknown');
        currentAcquisitionStatus.textContent = 'Disconnected';
        currentTemperatureStatus.classList.remove('stabilized', 'not-reached', 'not-stabilized');
        currentTemperatureStatus.textContent = 'Disconnected';
        currentTemperature.textContent = '-';
        currentTargetTemperature.textContent = '-';
    }




    tempSetButton.disabled = !connectionStatus;
    acquisitionModeSelect.disabled = !connectionStatus;
    seriesLengthInput.disabled = !connectionStatus;
    seriesIntervalInput.disabled = !connectionStatus;
    wallclockAcquisitionIntervalInput.disabled = !connectionStatus;
    wallclockAcquisitionIntervalButton.disabled = !connectionStatus;
    wallclockStatusValue.textContent = '-';


    toggleWallclockButton.disabled = !connectionStatus;
    preampGainSelect.disabled = !connectionStatus;
    readModeSelect.disabled = !connectionStatus;
    singleTrackCentreInput.disabled = !connectionStatus;
    singleTrackHeightInput.disabled = !connectionStatus;
    setSingleTrackButton.disabled = !connectionStatus;
    integrationTimeInput.disabled = !connectionStatus;
    targetIntensityInput.disabled = !connectionStatus;
    captureButton.disabled = !connectionStatus;
    downloadButton.disabled = !connectionStatus;
}



function handleStatusUpdate(status) {
    downloadButton.classList.remove('disabled');


    newPowerStatus = status.power_status;
    newTemperature = status.temperature;
    currentTemperatureValue = newTemperature;

    newTargetTemperature = status.target_temperature;
    currentTargetTemperatureValue = newTargetTemperature;
    newAcquisitionStatus = status.acquisition_status;
    newNumberSpectra = status.number_spectra;
    newIntegrationTime = status.integration_time;

    var preAmpGain = status.pre_amp_gain;
   

    var newAcquisitionMode = status.acquisition_mode;
    var newTargetIntensity = status.target_intensity;
    var newIntervalTime = status.interval_time;

    var wallclockNextCapture = status.wallclock_next_capture;

    wallclockAcquisitionInterval = status.wallclock_interval;
    wallclockAcquisitionActive = status.wallclock_acquisition_active;

    var newReadMode = status.read_mode;
    readModeSelect.value = status.read_mode;

    var newSingleTrackCentre = status.single_track_centre;
    singleTrackCentreInput.value = newSingleTrackCentre;

    var newSeriesLength = status.series_length;

    var newTargetIntensity = status.target_intensity;



    var newSingleTrackHeight = status.single_track_height;
    singleTrackHeightInput.value = newSingleTrackHeight;

    console.log('New status data:', {

        newPowerStatus,
        newTemperature,
        newTargetTemperature,
        newTargetIntensity,
        newAcquisitionMode,
        newAcquisitionStatus,
        newReadMode,
        newSingleTrackCentre,
        newSingleTrackHeight,
        preAmpGain,
        newIntegrationTime,
        newIntervalTime,
        newSeriesLength,
        newNumberSpectra,
        wallclockNextCapture,
        wallclockAcquisitionInterval,
        wallclockAcquisitionActive
    })

    handleWallclockStatusUpdate(wallclockAcquisitionActive);
    handleWallclockNextAcquisitionTime(wallclockNextCapture);
    handleWallclockIntervalUpdate(wallclockAcquisitionInterval);

    connectionStatusIcon.classList.remove('disconnected', 'unknown');
    connectionStatusIcon.classList.add('connected');

    handleNewPowerStatus(newPowerStatus);
    if (powerON) {
        tempSetButton.disabled = false;
        handleNewTemperature(newTemperature);
        handleNewTargetTemperature(newTargetTemperature);
        handleNewTemperatureStatus(status.temperature_status);
    }
    handleNewAcquisitionStatus(newAcquisitionStatus);
    handleNewAcquisitionMode(newAcquisitionMode);
    handleNewPreAmpGain(preAmpGain);
    handleNewTargetIntensity(newTargetIntensity);

    nSpectraCount.textContent = newNumberSpectra;
    if (newNumberSpectra > nSpectra) {
        nSpectra = newNumberSpectra;
        //getData();
    }
}


function getStatus() {
    socket.send(JSON.stringify({
        header: "get",
        payload: {
            value: "status"
        }
    }));
}

function sendAction(action, value = null) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not open. Cannot send action:', action);
        return;
    }

    let message = {
        header: "action",
        payload: {
            action: action,
            value: value
        }
    };

    socket.send(JSON.stringify(message));
}



function handleNewSpectrumData(spectrumData) {
    console.log('Handling new spectrum data:', spectrumData);

    if (!Array.isArray(spectrumData.data) || spectrumData.data.length === 0) {
        console.error('Invalid spectrum data:', spectrumData);
        return;
    }

    const wavelengths = applyWavelengthCalibration(spectrumData.data.map((_, index) => index + 1));
    const intensities = spectrumData.data;

    // turn data into an array of objects with x and y properties for Chart.js
    const spectrumPoints = wavelengths.map((wavelength, index) => {
        return { x: wavelength, y: intensities[index] };
    });

    if (spectrumReference !== null) {
        //spectrumChart.data.labels = wavelengths;
        spectrumChart.data.datasets[0].data = spectrumPoints;
        spectrumChart.update();

        spectrumLastUpdated.textContent = spectrumData.timestamp;
        spectrumIntegrationTime.textContent = `${spectrumData.integration_time.toFixed(5)}`;
        spectrumPreAmpGain.textContent = `${spectrumData.pre_amp_gain.toFixed(1)}`;

        switch (spectrumData.read_mode) {
            case 0:
                spectrumReadMode.textContent = 'Full Vertical Binning';
                spectrumSingleTrackCentre.parentElement.parentElement.classList.add('hidden');
                spectrumSingleTrackHeight.parentElement.parentElement.classList.add('hidden');
                break;
            case 3:
                spectrumReadMode.textContent = 'Single Track';
                spectrumSingleTrackCentre.parentElement.parentElement.classList.remove('hidden');
                spectrumSingleTrackHeight.parentElement.parentElement.classList.remove('hidden');

                break;
            default:
                spectrumReadMode.textContent = `Unknown (${spectrumData.read_mode})`;
        }

        spectrumSingleTrackCentre.textContent = `${spectrumData.single_track_centre}`;
        spectrumSingleTrackHeight.textContent = `${spectrumData.single_track_height}`;
        spectrumMaxIntensity.textContent = `${Math.max(...intensities)}`;
        spectrumTemperature.textContent = `${spectrumData.temperature.toFixed(2)}`;
    } else {
        console.error('No valid spectrum reference found.');
    }
}

function getData() {
    console.log("Getting Spectrum data");
    socket.send(JSON.stringify({
        header: "get",
        payload: {
            value: "data"
        }
    }));
}







powerButton.addEventListener('click', () => {
    console.log('Power button clicked');

    sendAction('set_power_status', !powerON);

    powerButton.classList.remove('off');
    powerButton.classList.remove('on');
    powerButton.classList.remove('unknown');
    powerButton.classList.add('pending');


});



function setTemp() {

    const newTargetTemp = parseInt(tempSetInput.value);
    if (isNaN(newTargetTemp)) {
        alert('Please enter a valid temperature.');
        return;
    }

    if (newTargetTemp < -120 || newTargetTemp > 20) {
        alert('Temperature must be between -120°C and 20°C.');
        return;
    }

    sendAction('set_target_temperature', newTargetTemp);
}

function validateTempInput() {
    const input = tempSetInput;
    const value = parseInt(input.value);
    if (isNaN(value) || value < -80 || value > 20) {
        input.setCustomValidity('Temperature must be between -120°C and 20°C.');
        tempSetButton.disabled = true;
        console.log('Invalid temperature input:', value);
    } else {
        input.setCustomValidity('');
        tempSetButton.disabled = false;
        console.log('Valid temperature input:', value);
    }
}

tempSetInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        setTemp();
        return;
    }
    // Allow only numbers, minus, backspace, and arrow keys
    if (!/^[0-9-]$/.test(event.key) && event.key !== 'Backspace' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        event.preventDefault();
    }


});

function updateAcqOptionsFields() {
    const modeNumber = acquisitionModeSelect.value;
    console.log('Updating acquisition options for mode:', modeNumber);


    const modes = ['none', 'single', 'accumulate', 'series', 'fast-series', 'continuous'];
    mode = modes[modeNumber];

    console.log('Acquisition mode is now:', mode);
    if (mode === 'series') {
        seriesLengthContainer.classList.remove('disabled');
        seriesIntervalContainer.classList.remove('disabled');
    } else {
        seriesLengthContainer.classList.add('disabled');
    }

    if (mode == 'single') {
        seriesIntervalContainer.classList.add('disabled');
        seriesLengthContainer.classList.add('disabled');
    } else {
        seriesIntervalContainer.classList.remove('disabled');
        seriesLengthContainer.classList.remove('disabled');
    }

    if (mode === 'continuous') {
        seriesLengthContainer.classList.add('disabled');
    }
}

acquisitionModeSelect.addEventListener('change', (event) => {

    let selectedMode = event.target.value;
    console.log('Acquisition mode changing to:', selectedMode);
    sendAction('set_acquisition_mode', selectedMode);

});

updateAcqOptionsFields(); // Initial call to set fields based on default mode



tempSetInput.addEventListener('input', validateTempInput);


tempSetButton.addEventListener('click', () => {
    setTemp();
});




captureButton.addEventListener('click', () => {
    if (!powerON) {
        console.warn('Cannot start acquisition: Power is OFF.');
        return;
    }


    if (acquisitionInProgress) {
        sendAction('stop_acquisition');

    } else {
        sendAction('start_acquisition');
    }

    setTimeout(getStatus, 100);

});




function setIntegrationTime() {
    const integrationTime = parseFloat(integrationTimeInput.value);
    if (isNaN(integrationTime) || integrationTime < 0) {
        alert('Please enter a valid positive integration time.');
        return;
    }

    sendAction('set_integration_time', integrationTime);
}



function setPreampGain() {
    // Get the selected preamp gain value from the dropdown

    const preampGain = parseInt(preampGainSelect.value);
    if (isNaN(preampGain) || preampGain < 0 || preampGain > 3) {
        alert('Please select a valid preamp gain value.');
        return;
    }

    sendAction('set_pre_amp_gain', preampGain);
}


function setTargetIntensity() {
    const targetIntensity = parseInt(targetIntensityInput.value);
    if (isNaN(targetIntensity) || targetIntensity < 0 || targetIntensity > 65530) {
        alert('Please enter a valid target intensity between 1 and 65530.');
        return;
    }
    sendAction('set_target_intensity', targetIntensity);


}

function updateControlMode() {
    console.log('Updating control mode to:', controlMode);
    if (controlMode === 'int-time-mode') {
        integrationTimeInput.disabled = false;
        targetIntensityContainer.classList.add('disabled');
        setTargetIntensityButton.disabled = true;
        setIntegrationTimeButton.disabled = false;
        controlModeIntTime.classList.add('active');
        controlModeTargetIntensity.classList.remove('active');
    } else if (controlMode === 'target-intensity-mode') {
        integrationTimeInput.disabled = true;
        targetIntensityContainer.classList.remove('disabled');
        controlModeIntTime.classList.remove('active');
        setTargetIntensityButton.disabled = false;
        setIntegrationTimeButton.disabled = true;
        controlModeTargetIntensity.classList.add('active');
    }
}

controlModeIntTime.addEventListener('click', () => {
    controlMode = 'int-time-mode';
    updateControlMode();
});

controlModeTargetIntensity.addEventListener('click', () => {
    controlMode = 'target-intensity-mode';
    updateControlMode();
});

setIntegrationTimeButton.addEventListener('click', () => {
    setIntegrationTime();
});

preampGainSelect.addEventListener('change', () => {
    setPreampGain();
});

setTargetIntensityButton.addEventListener('click', () => {
    setTargetIntensity();
});

wallclockAcquisitionIntervalButton.addEventListener('click', () => {
    const interval = parseInt(wallclockAcquisitionIntervalInput.value);
    console.log('Setting wallclock acquisition interval to:', interval);
    if (isNaN(interval) || interval <= 0) {
        alert('Please enter a valid wallclock acquisition interval greater than 0.');
        return;
    }

    sendAction('set_wallclock_interval', interval);
});

toggleWallclockButton.addEventListener('click', () => {
    console.log('Toggling wallclock acquisition status...');
    const isOn = wallclockStatusValue.classList.contains('on');
    console.log('Wallclock acquisition status changed:', isOn);

    const action = isOn ? 'stop_wallclock_acquisition' : 'start_wallclock_acquisition';
    console.log('Action to perform:', action);

    sendAction(action);

});

readModeSelect.addEventListener('change', () => {
    const selectedMode = readModeSelect.value;
    console.log('Changing read mode to:', selectedMode);
    sendAction('set_read_mode', parseInt(selectedMode));
});

setSingleTrackButton.addEventListener('click', () => {
    console.log('Setting single track mode...');

    let centre = parseInt(singleTrackCentreInput.value);
    let height = parseInt(singleTrackHeightInput.value);
    sendAction('set_single_track', { centre: centre, height: height });
});



function handlePropertiesChangedNotification(message) {
    //console.log('Received property changed notification via WebSocket:', message);
    if (message.payload && message.payload.changedProperties) {
        const changedProperties = message.payload.changedProperties;
        Object.keys(changedProperties).forEach(property => {
            console.log(`Property changed: ${property} = ${changedProperties[property].value}`);
            switch (property) {
                case 'power_status':
                    handleNewPowerStatus(changedProperties[property].value);
                    break;
                case 'Temperature':
                    handleNewTemperature(changedProperties[property].value);
                    break;
                case 'TargetTemperature':
                    handleNewTargetTemperature(changedProperties[property].value);
                    break;
                case 'TemperatureStatus':
                    handleNewTemperatureStatus(changedProperties[property].value);
                    break;
                case 'active':
                    powerON = changedProperties[property].value;
                    handleNewPowerStatus(powerON);
                    break;
                case 'acquisitionStatus':
                    handleNewAcquisitionStatus(changedProperties[property].value);
                    break;
                case 'wallclockAcquisitionActive':
                    wallclockAcquisitionActive = changedProperties[property].value;
                    handleWallclockStatusUpdate(wallclockAcquisitionActive);
                    break;
                case 'wallclockNextCapture':
                    handleWallclockNextAcquisitionTime(changedProperties[property].value);
                    break;
                case 'wallclockInterval':
                    wallclockAcquisitionInterval = changedProperties[property].value;
                    handleWallclockIntervalUpdate(wallclockAcquisitionInterval);
                    break;
                case 'readMode':
                    readModeSelect.value = changedProperties[property].value;
                    break;
                case 'singleTrackCentre':
                    singleTrackCentreInput.value = changedProperties[property].value;
                    break;
                case 'singleTrackHeight':
                    singleTrackHeightInput.value = changedProperties[property].value;
                    break;
                case 'preAmpGain':
                    preampGainSelect.value = changedProperties[property].value;
                    break;
                case 'IntegrationTimeSecs':
                    integrationTimeInput.value = changedProperties[property].value.toFixed(5).toString().trim('0');
                    break;
                case 'IntervalTimeSecs':
                    seriesIntervalInput.value = changedProperties[property].value.toFixed(5).toString().trim('0');
                    break;
                case 'SeriesLength':
                    seriesLengthInput.value = changedProperties[property].value;
                    break;
                case 'targetIntensity':
                    targetIntensityInput.value = changedProperties[property].value;
                    break;
                case 'numberSpectra':
                    nSpectraCount.textContent = changedProperties[property].value;
                    break;
                case 'acquisitionMode':
                    handleNewAcquisitionMode(changedProperties[property].value);

                    break;
                default:
                    console.log(`No handler for property: ${property}`);
            }
        });
    }
}




function connectWebSocket() {
    socket = new WebSocket("ws://" + window.location.host + "/ws");


    socket.addEventListener('open', () => {
        console.log('WebSocket connection established.');


        getData();
        handleConnectionChange(true); // Update connection status to connected


    });



    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.header && message.header === 'acquisition_finished') {

            getData();
        } else if (message.header && message.header === 'spectrum_data') {
            console.log('Received spectrum data via WebSocket:', message);
            if (message.payload) {
                const spectrumData = message.payload;
                handleNewSpectrumData(spectrumData);
            }
        } else if (message.header && message.header === 'properties_changed') {
            //console.log('Received property changed notification via WebSocket:', message);
            handlePropertiesChangedNotification(message);

        } else if (message.header && message.header === 'status_data') {
            console.log('Received status data via WebSocket:', message);
            if (message.payload) {
                const status = message.payload;
                handleStatusUpdate(status);
            }
        } else {
            console.log('Received unhandled WebSocket message:', message);
        }


    });

    socket.addEventListener('close', () => {
        console.log('WebSocket connection closed.');
        handleConnectionChange(false); // Update connection status to disconnected
        setTimeout(connectWebSocket, 1000); // Attempt to reconnect after 1 second
    });

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        socket.close();
    };

}

connectWebSocket(); // Establish WebSocket connection on page load

setTimeout(updateTemperatureChart, 1000); // Delay to ensure data is fetched before updating the chart
