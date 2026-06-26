


function downloadLastDays(device, days) {
    const url = `/download/last/${device}/${days}`;
    console.log(`Downloading last ${days} days of data for ${device}`);
    window.location.href = url;
}

function displayLastDays(device, days) {
    const url = `/display/last/${device}/${days}`;
    console.log(`Displaying last ${days} days of data for ${device}`);
    window.open(url, '_blank');
}

function downloadDateRange(device, startDate, endDate) {
    // Validate date inputs
    if (!startDate || !endDate) {
        alert('Please select both start and end dates.');
        return;
    }
    if (new Date(startDate) > new Date(endDate)) {
        alert('Start date cannot be after end date.');
        return;
    }
    const url = `/download/range/${device}/${startDate}/${endDate}`;
    window.location.href = url;
}

function downloadToday(device) {
    const url = `/download/last/${device}/1`;
    window.location.href = url;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Download page loaded');
    document.getElementById('download-today-hodr').addEventListener('click', () => {
        downloadToday('hodr');
    });
    document.getElementById('download-today-TriOS').addEventListener('click', () => {
        downloadToday('TriOS');
    });
    document.getElementById('download-last-days-hodr').addEventListener('click', () => {
        console.log('Downloading last days data for HODR');
        const days = document.getElementById('last-days-input').value;
        downloadLastDays('hodr', days);
    });
    document.getElementById('download-last-days-TriOS').addEventListener('click', () => {
        const days = document.getElementById('last-days-input').value;
        downloadLastDays('TriOS', days);
    });
    document.getElementById('download-date-range-hodr').addEventListener('click', () => {
        const startDate = document.getElementById('date-start-input').value;
        const endDate = document.getElementById('date-end-input').value;
        downloadDateRange('hodr', startDate, endDate);
    });
    document.getElementById('download-date-range-TriOS').addEventListener('click', () => {
        const startDate = document.getElementById('date-start-input').value;
        const endDate = document.getElementById('date-end-input').value;
        downloadDateRange('TriOS', startDate, endDate);
    });
    document.getElementById('download-all-hodr').addEventListener('click', () => {
        window.location.href = '/download/all/hodr';
    });
    document.getElementById('download-all-TriOS').addEventListener('click', () => {
        window.location.href = '/download/all/TriOS';
    });
    document.getElementById('email-data').addEventListener('click', () => {
	window.location.href = '/download/email';
    });

    document.getElementById('display-last-days-hodr').addEventListener('click', () => {
        const days = document.getElementById('display-last-days-input').value;
        displayLastDays('hodr', days);
    });

    document.getElementById('display-last-days-TriOS').addEventListener('click', () => {
        const days = document.getElementById('display-last-days-input').value;
        displayLastDays('TriOS', days);
    });
});     
