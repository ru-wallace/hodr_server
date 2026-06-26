

// Canvas elements for temperature and spectrum charts
const temperatureCanvas = document.getElementById('temp-chart');
const spectrumCanvas = document.getElementById('spectrum-chart');


// Side bar interface elements
const powerButton = document.getElementById('power-button');
const connectionStatusIcon = document.getElementById('connection-status-icon');

// Temperature interface bar
const currentTemperature = document.getElementById('current-temp');
const currentTargetTemperature = document.getElementById('current-target-temp');
const currentTemperatureStatus = document.getElementById('current-temp-status');
const tempLastUpdated = document.getElementById('temp-last-updated');


const tempSetInput = document.getElementById('set-temp-input');
const tempSetButton = document.getElementById('set-temp-button');


// Spectrum interface bar
const acquisitionModeSelect = document.getElementById('acquisition-mode-select');

const seriesLengthContainer = document.getElementById('series-length-container');
const seriesLengthInput = document.getElementById('series-length-input');
const seriesIntervalContainer = document.getElementById('series-interval-container');
const seriesIntervalInput = document.getElementById('series-interval-input');

const wallclockAcquisitionIntervalInput = document.getElementById('wallclock-interval-select');
const wallclockAcquisitionIntervalButton = document.getElementById('set-wallclock-interval-button');
const wallclockStatusValue = document.getElementById('wallclock-status-value');
const toggleWallclockButton = document.getElementById('toggle-wallclock-button');
const nextAcquisitionTime = document.getElementById('next-acquisition-time');

const controlModeIntTime = document.getElementById('int-time-mode');
const controlModeTargetIntensity = document.getElementById('target-intensity-mode');
const integrationTimeInput = document.getElementById('int-time-input');
const setIntegrationTimeButton = document.getElementById('set-int-time-button');
const preampGainSelect = document.getElementById('preamp-gain-select');
const targetIntensityContainer = document.getElementById('target-intensity-container');
const targetIntensityInput = document.getElementById('target-intensity-input');
const setTargetIntensityButton = document.getElementById('set-target-intensity-button');



const currentAcquisitionStatus = document.getElementById('current-spectrum-status');
const spectrumLastUpdated = document.getElementById('last-spectrum-updated');
const spectrumIntegrationTime = document.getElementById('integration-time');
const spectrumPreAmpGain = document.getElementById('pre-amp-gain-value');
const spectrumMaxIntensity = document.getElementById('max-intensity-value');
const spectrumTemperature = document.getElementById('spectrum-temperature');
const nSpectraCount = document.getElementById('n-spectra-count');

const wallclockInterval = document.getElementById('wallclock-interval-value');


const captureButton = document.getElementById('spectrum-capture-button');

const downloadButton = document.getElementById('download-button');