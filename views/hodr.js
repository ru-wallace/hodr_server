const temperatureData = [];
const targetTemps = [];
const timestamps = [];
var powerON = false;
var quickAdjustmentMode = false;
Chart.defaults.backgroundColor = '#333';
Chart.defaults.borderColor = '#aaaaaa';
Chart.defaults.color = '#ffffff';
var spectrumReference;


const wl_calibration_coefficients = [-2.71441094e-05,  5.31251935e-01,  3.39244276e+02]

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

function checkON() {
    console.log('Checking power status...');
    fetch('power_status')
        .then(response => response.text())
        .then(status => {
            console.log('Power status:', status);
            if (status.trim() === 'ON') {
                powerON = true;
                powerButton.classList.remove('off');
                powerButton.classList.add('on');
            } else {
                powerON = false;
                powerButton.classList.remove('on');
                powerButton.classList.add('off');
            }
        })
        .catch(error => {
            console.error('Error checking power status:', error)
            powerButton.classList.remove('on');
            powerButton.classList.remove('off');
            powerButton.classList.add('unknown');
            powerButton.textContent = 'Unknown';
        });
}

function applyWavelengthCalibration(indices, sigFig = 2) {
    return indices.map(index => {
        const wavelength = (wl_calibration_coefficients[0] * Math.pow(index, 2) +
            wl_calibration_coefficients[1] * index +
            wl_calibration_coefficients[2]).toFixed(sigFig);
        return wavelength;
    });
}


function handleNewTemperatureData(newTemperature, newTargetTemperature, newTemperatureStatus) {
    console.log('New temperature data received:', newTemperature, newTargetTemperature, newTemperatureStatus);
    const time = new Date();
    const time_unix = time.getTime();
    timestamps.push(time);

    temperatureData.push({
        x: time,
        y: newTemperature
    });

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

    if (newPowerStatus) {
        powerON = true;
        powerButton.classList.remove('off');
        powerButton.classList.add('on');
    } else {
        powerON = false;
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


    const mode = acquisitionModeSelect.value;
    if (mode === 'continuous-auto') {
        if (autoAcquisitionIntervalHandle) {
            captureButton.textContent = 'Stop';
            currentAcquisitionStatus.textContent += ' (Auto Mode)';
            captureButton.classList.remove('disabled');
            if (quickAdjustmentMode) {
                currentAcquisitionStatus.textContent += ' (Quick Adjustment Mode)';
            }
        }
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


async function getStatus() {
    console.log('Fetching status...');
    await fetch('status', { signal: AbortSignal.timeout(1000) })
        .then(response => {
            console.log('Raw status data:', response);
            return response.json();
        })
        .then(status => {

            downloadButton.classList.remove('disabled');


            newPowerStatus = status.power_status;
            newTemperature = status.temperature;
            newTargetTemperature = status.target_temperature;
            newAcquisitionStatus = status.acquisition_status;
            newNumberSpectra = status.number_spectra;
            newIntegrationTime = status.integration_time;

            var wallclockNextCapture = status.wallclock_next_capture;

            wallclockAcquisitionInterval = status.wallclock_interval;
            wallclockAcquisitionActive = status.wallclock_acquisition_active;
            wallclockInterval.textContent = wallclockAcquisitionInterval;

            console.log('New status data:', {

                newPowerStatus,
                newTemperature,
                newTargetTemperature,
                newAcquisitionStatus,
                newIntegrationTime,
                newNumberSpectra,
                wallclockNextCapture,
                wallclockAcquisitionInterval,
                wallclockAcquisitionActive
            })
            if (wallclockAcquisitionActive) {

                wallclockStatusValue.textContent = 'On';
                wallclockStatusValue.classList.remove('off');
                wallclockStatusValue.classList.add('on');
                toggleWallclockButton.textContent = 'Stop';
                
                nextAcquisitionTime.classList.remove('hidden');

                //conver wallclockNextCapture to a Date object
                console.log('Wallclock next capture:', wallclockNextCapture);
                const nextCaptureDate = new Date(wallclockNextCapture * 1000); // Convert seconds to milliseconds
                nextAcquisitionTime.textContent = nextCaptureDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
                nextAcquisitionTime.classList.add('hidden');
                wallclockStatusValue.textContent = 'Off';
                wallclockStatusValue.classList.remove('on');
                wallclockStatusValue.classList.add('off');
                toggleWallclockButton.textContent = 'Start';
            }

            connectionStatusIcon.classList.remove('disconnected', 'unknown');
            connectionStatusIcon.classList.add('connected');

            handleNewPowerStatus(newPowerStatus);
            if (powerON) {
                tempSetButton.disabled = false;
                handleNewTemperatureData(newTemperature, newTargetTemperature, status.temperature_status);
            }
            handleNewAcquisitionStatus(newAcquisitionStatus);

            nSpectraCount.textContent = newNumberSpectra;
            if (newNumberSpectra > nSpectra) {
                nSpectra = newNumberSpectra;
                getData();
            }
        })
        .catch(error => {

            if (error.name === 'AbortError') {
                console.warn('Fetch request timed out.');
            } else {
                console.error('Error fetching status:', error);
            }
            console.error('Timeout fetching status:', error);
            connectionStatusIcon.classList.remove('connected', 'unknown');
            connectionStatusIcon.classList.add('disconnected');

            handleNewPowerStatus(false, true); // Handle power status as Unknown/OFF if error occurs
            downloadButton.classList.add('disabled');
            tempSetButton.disabled = true;
        })
}


function getTemp() {

    if (!powerON) {
        console.warn('Power is OFF. Skipping temperature fetch.');
        return;
    }
    const time = new Date();
    console.log('Fetching temperature data at:', time.toLocaleTimeString());
    var result = fetch('temperature')
        .then(response => {


            return response.text()
        }).then(tempResponse => {
            console.log('Raw temperature data:', tempResponse);
            const temperature = parseFloat(tempResponse);
            if (isNaN(temperature)) {
                console.error('Invalid temperature data:', tempResponse);
                return;
            }

            const temp = temperature.toFixed(2);
            console.log('Current temperature:', temp);
            timestamps.push(time);
            temperatureData.push(temp);

            if (temperatureData.length > 20) {
                temperatureData.shift();
                timestamps.shift();

            }

            tempChart.data.labels = timestamps.map(t => t.toLocaleTimeString());
            tempChart.data.datasets[0].data = temperatureData;


            tempChart.update();
            currentTemperature.textContent = temp;
            tempLastUpdated.textContent = time.toLocaleTimeString();
        })
        .catch(error => console.error('Error fetching temperature data:', error));

    result = fetch('target_temperature')
        .then(response => response.text())
        .then(targetTempResponse => {
            const targetTemperature = parseFloat(targetTempResponse);
            if (isNaN(targetTemperature)) {
                console.error('Invalid target temperature data:', targetTempResponse);
                return;
            }

            const targetTemp = targetTemperature.toFixed(2);
            console.log('Current target temperature:', targetTemp);
            targetTemps.push(targetTemp);

            if (targetTemps.length > 20) {
                targetTemps.shift();
            }
            tempChart.data.datasets[1].data = targetTemps;

            tempChart.update();
            currentTargetTemperature.textContent = targetTemp;
            tempLastUpdated.textContent = time.toLocaleTimeString();
        })
        .catch(error => console.error('Error fetching target temperature data:', error));

    result = fetch('temperature_status')
        .then(response => response.text())
        .then(statusResponse => {
            const status = statusResponse.trim().replace(/['"]+/g, '');
            console.log('Current temperature status:', status);
            tempLastUpdated.textContent = time.toLocaleTimeString();

            if (status === 'Temperature not reached') {
                // captureButton.disabled = true;
                currentTemperatureStatus.className = 'not-reached';
                currentTemperatureStatus.innerHTML = 'Not Reached';
            } else if (status === 'Temperature not stabilized') {
                //captureButton.disabled = true;
                currentTemperatureStatus.className = 'not-stabilized';
                currentTemperatureStatus.innerHTML = 'Stabilizing';
            } else if (status === 'Temperature stabilized') {
                //captureButton.disabled = false;
                currentTemperatureStatus.className = 'stabilized';
                currentTemperatureStatus.innerHTML = 'Stabilized';
            } else {
                //captureButton.disabled = true;
                currentTemperatureStatus.className = '';
                currentTemperatureStatus.innerHTML = status;
            }


        })
        .catch(error => console.error('Error fetching temperature status:', error));
}


function getDataIfNew() {

    if (!powerON) {
        console.warn('Power is OFF. Skipping data fetch.');
        return;
    }
    console.log('Checking for new spectrum data...');

    fetch('number_spectra')
        .then(response => response.text())
        .then(numberSpectraResponse => {
            const numberSpectra = parseInt(numberSpectraResponse);

            nSpectraCount.textContent = numberSpectra;
            if (numberSpectra > nSpectra) {
                nSpectra = numberSpectra;

                getData();
            } else {
                console.warn('No new spectrum data available.');
            }
        })
        .catch(error => console.error('Error checking for new spectrum data:', error));

    fetch('acquisition_status')
        .then(response => response.text())
        .then(acquisitionStatusResponse => {
            const acquisitionStatus = parseInt(acquisitionStatusResponse);
            console.log('Acquisition status:', acquisitionStatusResponse);
            if (acquisitionStatus == 20073) {
                captureButton.textContent = 'Capture';
                captureButton.disabled = false;
                acquisitionInProgress = false;
                currentAcquisitionStatus.textContent = 'Idle...';

            } else if (acquisitionStatus == 20074) {
                captureButton.disabled = true;
                currentAcquisitionStatus.textContent = 'Temp Cycle in Progress...';

            } else if (acquisitionStatus == 20072) {
                captureButton.textContent = 'Stop';
                captureButton.disabled = false;
                currentAcquisitionStatus.textContent = 'Acquiring...';
                acquisitionInProgress = true;
            } else {
                captureButton.textContent = 'Capture';
                captureButton.disabled = false;
                currentAcquisitionStatus.textContent = `Unknown status: ${acquisitionStatus}`;
                acquisitionInProgress = false;
            }

            const mode = acquisitionModeSelect.value;
            if (mode === 'continuous-auto') {
                if (autoAcquisitionIntervalHandle) {
                    captureButton.textContent = 'Stop';
                    currentAcquisitionStatus.textContent += ' (Auto Mode)';
                    captureButton.disabled = false;
                    if (quickAdjustmentMode) {
                        currentAcquisitionStatus.textContent += ' (Quick Adjustment Mode)';
                    }
                }
            }
        })
        .catch(error => console.error('Error checking acquisition status:', error));
}



function getData() {

    console.log('Fetching spectrum data...');
    fetch('last_spectrum')
        .then(response => response.json())
        .then(spectrumData => {
            console.log('Raw spectrum data:', spectrumData);

            if (!Array.isArray(spectrumData.data) || spectrumData.data.length === 0) {
                console.error('Invalid spectrum data:', spectrumData);
                return;
            }



            //const wavelengths = spectrumData.data.map((_, index) => index + 1); // Assuming wavelengths are 1 to N
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
                spectrumMaxIntensity.textContent = `${Math.max(...intensities)}`;
                spectrumTemperature.textContent = `${spectrumData.temperature.toFixed(2)}`;
            } else {
                console.error('No valid spectrum reference found.');
            }

        }).catch(error => console.error('Error fetching spectrum data:', error));
}

var acquisitionInProgress = false;
function stopAcquisition() {
    console.log('Stopping spectrum acquisition...');

    const mode = acquisitionModeSelect.value;
    if (mode === 'continuous-auto') {
        if (autoAcquisitionIntervalHandle) {
            clearInterval(autoAcquisitionIntervalHandle);
            autoAcquisitionIntervalHandle = null;
            captureButton.textContent = 'Capture';
        }
    }

    fetch('stop_acquisition')
        .then(response => response.text())
        .then(responseText => {
            acquisitionInProgress = false;
            captureButton.textContent = 'Capture';
            console.log('Stop acquisition response:', responseText);

        })
        .catch(error => console.error('Error stopping spectrum acquisition:', error));
}



function startAcquisition() {
    console.log('Starting spectrum acquisition...');
    var integrationTime = parseFloat(integrationTimeInput.value);
    var seriesLength = parseInt(seriesLengthInput.value);
    var seriesInterval = parseFloat(seriesIntervalInput.value);
    var mode = acquisitionModeSelect.value;
    console.log('Integration time:', integrationTime);
    if (isNaN(integrationTime) || integrationTime <= 0) {
        integrationTime = 0.0;
    }
    fetch('start_acquisition', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "integration_time": integrationTime,
            "interval_time": seriesInterval,
            "acquisition_mode": mode,
            "n_captures": seriesLength

        })
    })
        .then(response => response.text())
        .then(responseText => {
            console.log('Start acquisition response:', responseText);
            spectrumReference = parseInt(responseText);
            acquisitionInProgress = true;
            captureButton.textContent = 'Stop';

            //currentAcquisitionStatus.textContent = 'Acquiring...';
            //spectrumLastUpdated.textContent = new Date().toLocaleTimeString();


        })
        .catch(error => console.error('Error starting spectrum acquisition:', error));



}



document.addEventListener('DOMContentLoaded', async () => {
    console.log('Document loaded, initializing HODR interface...');
    getTemp(); // Initial fetch
    getStatus().then(() => {
        wallclockAcquisitionIntervalInput.value = wallclockAcquisitionInterval;
        console.log('Wallclock acquisition active:', wallclockAcquisitionActive);
    });
    refreshInterval = setInterval(() => {
        getStatus();
    }, 1000);


    powerButton.addEventListener('click', () => {
        console.log('Power button clicked');
        if (powerON) {
            fetch('deactivate')
                .then(response => response.text())
                .then(responseText => {
                    console.log('Power off response:', responseText);
                    powerON = false;
                    powerButton.classList.remove('on');
                    powerButton.classList.add('off');
                })
                .catch(error => console.error('Error powering off:', error));
        } else {

            powerButton.classList.remove('off');
            powerButton.classList.remove('unknown');
            powerButton.classList.add('pending');
            fetch('activate')
                .then(response => response.text())
                .then(responseText => {
                    powerButton.classList.remove('pending');
                    console.log('Power on response:', responseText);
                    powerON = true;
                    powerButton.classList.remove('off');
                    powerButton.classList.add('on');
                })
                .catch(error => {
                    console.error('Error powering on:', error);
                    powerButton.classList.remove('pending');
                    powerButton.classList.remove('on');
                    powerButton.classList.add('off');

                });
        }
    });

    getData(); // Initial data fetch
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

    fetch('set_target_temperature', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ target_temperature: newTargetTemp })
    })
        .then(response => response.text())
        .then(responseText => {
            console.log('Set target temperature response:', responseText);
            tempSetInput.value = ''; // Clear input field
            getTemp(); // Refresh data
        })
        .catch(error => console.error('Error setting target temperature:', error));
}

function validateTempInput() {
    const input = tempSetInput;
    const value = parseInt(input.value);
    if (isNaN(value) || value < -120 || value > 20) {
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
    const mode = acquisitionModeSelect.value;
    console.log('Updating acquisition options for mode:', mode);

    if (mode === 'series') {
        seriesLengthContainer.classList.remove('disabled');
    } else {
        seriesLengthContainer.classList.add('disabled');
    }

    if (mode == 'single') {
        seriesIntervalContainer.classList.add('disabled');
    } else {
        seriesIntervalContainer.classList.remove('disabled');
    }

    if (mode === 'continuous-auto') {


        targetIntensityContainer.classList.remove('disabled');
    } else {
        integrationTimeInput.disabled = false;
        targetIntensityContainer.classList.add('disabled');
    }
}

acquisitionModeSelect.addEventListener('change', (event) => {

    updateAcqOptionsFields();
});

updateAcqOptionsFields(); // Initial call to set fields based on default mode



tempSetInput.addEventListener('input', validateTempInput);


tempSetButton.addEventListener('click', () => {
    setTemp();
});

captureButton.addEventListener('click', () => {
    if (acquisitionInProgress) {
        stopAcquisition();
        return;
    }

    if (acquisitionModeSelect.value === 'continuous-auto') {
        if (autoAcquisitionIntervalHandle) {
            clearInterval(autoAcquisitionIntervalHandle);
            autoAcquisitionIntervalHandle = null;
            captureButton.textContent = 'Capture';
            return;
        } else {
            const interval = parseFloat(seriesIntervalInput.value);
            autoAcquisitionIntervalHandle = setInterval(() => {
                startAcquisition();
            }, interval * 1000);
        }
    }
    startAcquisition();
});


function setIntegrationTime() {
    const integrationTime = parseFloat(integrationTimeInput.value);
    if (isNaN(integrationTime) || integrationTime < 0) {
        alert('Please enter a valid positive integration time.');
        return;
    }

    fetch('set_integration_time', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ integration_time: integrationTime })
    })
        .then(response => response.text())
        .then(responseText => {
            console.log('Set integration time response:', responseText);
            //getData(); // Refresh data
            let newIntegrationTime = parseFloat(responseText);
            if (newIntegrationTime < 0.1) {
                integrationTimeInput.value = newIntegrationTime.toPrecision(5) / 1;
            } else {
                integrationTimeInput.value = newIntegrationTime.toPrecision(2) / 1;
            }
        })
        .catch(error => console.error('Error setting integration time:', error));
}



function setPreampGain() {
    // Get the selected preamp gain value from the dropdown

    const preampGain = parseInt(preampGainSelect.value);
    if (isNaN(preampGain) || preampGain < 0 || preampGain > 3) {
        alert('Please select a valid preamp gain value.');
        return;
    }
    fetch('set_pre_amp_gain', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preamp_gain: preampGain })
    })
        .then(response => response.text())
        .then(responseText => {
            console.log('Set preamp gain response:', responseText);
            //getData(); // Refresh data
        })
        .catch(error => console.error('Error setting preamp gain:', error));
}

function setTargetIntensity() {
    const targetIntensity = parseInt(targetIntensityInput.value);
    if (isNaN(targetIntensity) || targetIntensity < 0 || targetIntensity > 65530) {
        alert('Please enter a valid target intensity between 1 and 65530.');
        return;
    }

    fetch('set_target_intensity', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ intensity: targetIntensity })
    })
        .then(response => response.text())
        .then(responseText => {
            console.log('Set target intensity response:', responseText);

            getData(); // Refresh data
        })
        .catch(error => console.error('Error setting target intensity:', error));
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

    fetch('set_wallclock_interval', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ interval: interval })
    })
        .then(response => response.text())
        .then(responseText => {
            console.log('Set wallclock acquisition interval response:', responseText);
            wallclockAcquisitionInterval = interval;
            wallclockInterval.textContent = wallclockAcquisitionInterval;
            getStatus(); // Refresh status
        })
        .catch(error => console.error('Error setting wallclock acquisition interval:', error));
});

toggleWallclockButton.addEventListener('click', () => {
    console.log('Toggling wallclock acquisition status...');
    const isOn = wallclockStatusValue.classList.contains('on');
    console.log('Wallclock acquisition status changed:', isOn);

    const action = isOn ? 'stop_wallclock_acquisition' : 'start_wallclock_acquisition';
    console.log('Action to perform:', action);
    fetch(action).then(response => response.text())
        .then(responseText => {
            console.log('Wallclock acquisition status response:', responseText);
            wallclockAcquisitionActive = isOn;

        })
        .catch(error => console.error('Error changing wallclock acquisition status:', error));
});



// Set integration time field text initial value
fetch('integration_time')
    .then(response => response.json())
    .then(integrationTimeResponse => {
        console.log('Raw integration time data:', integrationTimeResponse);
        
        const integrationTime =integrationTimeResponse.integration_time;
        console.log('Parsed integration time:', integrationTime);
        if (isNaN(integrationTime) || integrationTime <= 0) {
            console.error('Invalid integration time data:', integrationTimeResponse);
            return;
        }
        console.log('Current integration time:', integrationTime);
        if (integrationTimeInput < 0.1) {
            integrationTimeInput.value = integrationTime.toFixed(5);
        } else {
            integrationTimeInput.value = integrationTime.toFixed(2);
        }
        
    })
    .catch(error => console.error('Error fetching integration time data:', error));

fetch('target_intensity')
    .then(response => response.json())
    .then(targetIntensityResponse => {
        console.log('Raw target intensity data:', targetIntensityResponse);
        const targetIntensity = targetIntensityResponse.target_intensity;
        console.log('Parsed target intensity:', targetIntensity);
        if (targetIntensity == 0) {
            controlMode = 'int-time-mode';
            updateControlMode();
        } else {
            controlMode = 'target-intensity-mode';
            updateControlMode();
        }
        console.log('Current target intensity:', targetIntensity);
        targetIntensityInput.value = targetIntensity;
    })
    .catch(error => console.error('Error fetching target intensity data:', error));

fetch('preamp_gain')
    .then(response => response.json())
    .then(preampGainResponse => {
        console.log('Raw preamp gain data:', preampGainResponse);
        const preampGainBool = preampGainResponse.preamp_gain;
        //preamp gain is a boolean value, convert to integer for select dropdown
        const preampGain = preampGainBool ? 1 : 0;
        console.log('Parsed preamp gain:', preampGain);
        if (isNaN(preampGain) || preampGain < 0 || preampGain > 3) {
            console.error('Invalid preamp gain data:', preampGainResponse);
            return;
        }
        console.log('Current preamp gain:', preampGain);
        preampGainSelect.value = preampGain;
    })
    .catch(error => console.error('Error fetching preamp gain data:', error));
