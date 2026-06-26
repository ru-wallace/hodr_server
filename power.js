import { config } from "./config.js";



function parseStatus(text) {
    console.log("Result text:", text)
    var status = [null, null, null, null];
    var p1Pos = text.search(/p61=/);
    status[0] = parseInt(text[p1Pos + 4])
    var p2Pos = text.search(/p62=/);
    status[1] = parseInt(text[p2Pos + 4])
    var p3Pos = text.search(/p63=/);
    status[2] = parseInt(text[p3Pos + 4])
    var p4Pos = text.search(/p64=/);
    status[3] = parseInt(text[p4Pos + 4])
    return JSON.stringify(status);
}

function parseCycleStatus(text) {
    console.log("Result text:", text)
    var status = [null, null, null, null];
    var p1Pos = text.search(/p61/);
    if (p1Pos >= 0) {
        status[0] = text.slice(p1Pos+4, p1Pos + 12) == "cycle ok"
    }
    var p2Pos = text.search(/p62/);
        if (p2Pos >= 0) {
        status[1] = text.slice(p2Pos+4, p2Pos + 12) == "cycle ok"
    }
    var p3Pos = text.search(/p63/);
    if (p3Pos >= 0) {
        status[2] = text.slice(p3Pos+4, p3Pos + 12) == "cycle ok"
    }
    var p4Pos = text.search(/p64/);
    if (p4Pos >= 0) {
        status[3] = text.slice(p4Pos+4, p4Pos + 12) == "cycle ok"
    }

    console.log("Slice:", text.slice(p4Pos+4, p4Pos + 12));
    return JSON.stringify(status);
}

async function getPower() {


    const url = `http://${config.power.ip}/set.cmd?cmd=getpower`;
    const headers = new Headers({
        'Authorization': `Basic ${btoa(config.power.user + ':' + config.power.password)}`
    })
    console.log("Url:", url)
    const result = await fetch(url, { headers: headers })
        .catch((err) => {
            console.error("Error getting status:")
            console.error(err);
        });
    console.log("Result:")
    console.log(result);

    
    if (result?.ok) {
        var text = await result.text();
        return parseStatus(text);
    }


    return false;
}

async function setPowerCycle({ p1, p2, p3, p4 }) {
    var paramString = "";
    if (p1 !== undefined && (p1 >= 0)) {
        paramString += "&p61=" + p1;
    }
    if (p2 !== undefined && (p2 >= 0)) {
        paramString += "&p62=" + p2;
    }
    if (p3 !== undefined && (p3 >= 0)) {
        paramString += "&p63=" + p3;
    }
    if (p4 !== undefined && (p4 >= 0)) {
        paramString += "&p64=" + p4;
    }
    console.log("ParamString", paramString);
    if (paramString.length == 0) {
        console.error("No param string");
        return null;
    }

    const url = `http://${config.power.ip}/set.cmd?cmd=setpowercycle${paramString}`;
    const headers = new Headers({
        'Authorization': `Basic ${btoa(config.power.user + ':' + config.power.password)}`
    })
    console.log("Url:", url)
    const result = await fetch(url, { headers: headers })
        .catch((err) => {
            console.error("Error getting status:")
            console.error(err);
        });
    console.log("Result:")
    console.log(result);

    var status = [null, null, null, null];
    if (result?.ok) {
        var text = await result.text();
        return parseCycleStatus(text);
    }


    return false;
}

async function setPower({ p1, p2, p3, p4 }) {
    console.log({p1, p2, p3, p4})
    var paramString = "";
    if (p1 !== undefined && (p1 == 0 || p1 == 1)) {
        paramString += "&p61=" + p1;
    }
    if (p2 !== undefined && (p2 == 0 || p2 == 1)) {
        paramString += "&p62=" + p2;
    }
    if (p3 !== undefined && (p3 == 0 || p3 == 1)) {
        paramString += "&p63=" + p3;
    }
    if (p4 !== undefined && (p4 == 0 || p4 == 1)) {
        paramString += "&p64=" + p4;
    }
    console.log("ParamString", paramString);
    if (paramString.length == 0) {
        console.error("No param string");
        return null;
    }

    const url = `http://${config.power.ip}/set.cmd?cmd=setpower${paramString}`;
    const headers = new Headers({
        'Authorization': `Basic ${btoa(config.power.user + ':' + config.power.password)}`
    })
    console.log("Url:", url)
    const result = await fetch(url, { headers: headers })
        .catch((err) => {
            console.error("Error getting status:")
            console.error(err);
        });
    console.log("Result:")
    console.log(result);


    if (result?.ok) {
        var text = await result.text();
        return parseStatus(text);
    }


    return false;
}


export { getPower, setPower, setPowerCycle , parseStatus, parseCycleStatus};