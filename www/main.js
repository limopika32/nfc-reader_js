const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

const systemCode = Uint8Array.of(0xff, 0xff);

let device;
let endPointIn;
let endPointOut;

async function deviceSetup(){
    device = await navigator.usb.requestDevice({
        "filters": [{"vendorId": 0x054C}]
    });
    
    const devConfigValue = device.configuration.configurationValue;
    const devIO = device.configuration.interfaces[0].interfaceNumber;
    endPointIn = device.configuration.interfaces[0].alternate.endpoints.find(element => element.direction=="in").endpointNumber;
    endPointOut = device.configuration.interfaces[0].alternate.endpoints.find(element => element.direction=="out").endpointNumber;
    
    await device.open();
    await device.selectConfiguration(devConfigValue);
    await device.claimInterface(devIO);
}

async function readerTX(rawPacket) {
    let data = await device.transferOut(endPointOut, rawPacket);
    console.debug(data);
}

async function readerRX(size){
    let data = await device.transferIn(endPointIn, size);
    console.debug(data);

    let array = [];
    for (let i = data.data.byteOffset; i < data.data.byteLength; i++) array.push(data.data.getUint8(i));
    return array;
}

async function initialize(){
    console.debug("-- INITIAL TRANSMIT --------");
    // ACK
    await readerTX(Uint8Array.of(0x00, 0x00, 0xff, 0x00, 0xff, 0x00));
    // SetCommandType 01
    await readerTX(Uint8Array.of(0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x2a, 0x01, 0xff, 0x00));
    await readerRX(6); await readerRX(13);
    // SwitchRF 00
    await readerTX(Uint8Array.of(0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x06, 0x00, 0x24, 0x00));
    await readerRX(6); await readerRX(13);
    // InSetRF
    await readerTX(Uint8Array.of(0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x00, 0x01, 0x01, 0x0f, 0x01, 0x18, 0x00));
    await readerRX(6); await readerRX(13);
    // InSetProtocol 1/2
    await readerTX(Uint8Array.of(0x00, 0x00, 0xff, 0xff, 0xff, 0x28, 0x00, 0xd8, 0xd6, 0x02, 0x00, 0x18, 0x01, 0x01, 0x02, 0x01, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x08, 0x08, 0x00, 0x09, 0x00, 0x0a, 0x00, 0x0b, 0x00, 0x0c, 0x00, 0x0e, 0x04, 0x0f, 0x00, 0x10, 0x00, 0x11, 0x00, 0x12, 0x00, 0x13, 0x06, 0x4b, 0x00));
    await readerRX(6); await readerRX(13);
    // InSetProtocol 2/2
    await readerTX(Uint8Array.of(0x00, 0x00, 0xff, 0xff, 0xff, 0x04, 0x00, 0xfc, 0xd6, 0x02, 0x00, 0x18, 0x10, 0x00));
    await readerRX(6); await readerRX(13);
    console.debug("-- READY ------------------");
    console.log("* Ready.")
}

function packetHeader(array){
    let header = Uint8Array.of(0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00);
    // 0x05, 0x06 : command size without command checksum (little endian, but mod 256)
    header[5] = array.length - 2;
    // 0x07 : packet checksum
    header[7] = getChecksum(header.slice(5,7));

    return Uint8ArrayConcat(header, array);
}

function getChecksum(array){
    // (256 - sum(array)) mod 256 -> 1Byte
    let sum = 0;
    array.forEach(element => sum += element);

    return (256 - sum) % 256;
}

function Uint8ArrayConcat(preArray,sufArray){
    let tmp = new Uint8Array(preArray.length + sufArray.length);
    tmp.set(preArray);
    tmp.set(sufArray,preArray.length);
    return tmp;
}

// ---------------- //

async function polling(targetSystemCode){
    // -- data header --
    // header = 0xd6, RF communicate = 0x04, command header?
    let header = Uint8Array.of(0xd6, 0x04, 0x6e, 0x00);
    
    // -- main data --
    // data_length, command_code = 0, [system_code], request_code, time_slot, (command checksum)
    let data = Uint8Array.of(0x00, 0x00, targetSystemCode[0], targetSystemCode[1], 0x01, 0x0f, 0x00, 0x00);
    // data_length set (without check sum)
    data[0] = data.length - 2;
    
    // concat
    let cmd = Uint8ArrayConcat(header, data)
    
    // write checksum (little endian, but mod 256)
    cmd[cmd.length-2] = getChecksum(cmd);
    
    // header concat
    const packet = packetHeader(cmd);
    
    // transmit!
    await readerTX(packet);
    await readerRX(6);
    return await readerRX(37);
}

async function readWithoutEncryption(IDm, size, targetServiceCode){
    // -- data header --
    // header = 0xd6, RF communicate = 0x04, command header?
    let header = Uint8Array.of(0xd6, 0x04, 0x6e, 0x00);
    
    // -- main data --
    // data_length, command_code = 6, [idm], service_length, [service_code (little endian)], size, block_No., (command checksum)
    let data_t1 = Uint8Array.of(0x00, 0x06);
    let data_t2 = IDm;
    let data_t3 = Uint8Array.of(0x01, targetServiceCode[1], targetServiceCode[0], size);
    let data_t4 = new Uint8Array(size*2);
    for (let i = 0; i < data_t4.length; i++) data_t4[i] = i%2 ? i/2 : 0x80 ;
    let data_t5 = Uint8Array.of(0x00, 0x00);

    let data_ta = Uint8ArrayConcat(data_t1, data_t2);
    let data_tb = Uint8ArrayConcat(data_t3, data_t4);
    data_ta = Uint8ArrayConcat(data_ta,data_tb);

    let data = Uint8ArrayConcat(data_ta,data_t5);
    
    // data_length set (without check sum)
    data[0] = data.length - 2;
    
    // concat
    let cmd = Uint8ArrayConcat(header, data)
    
    // write checksum (little endian, but mod 256)
    cmd[cmd.length-2] = getChecksum(cmd);
    
    // header concat
    const packet = packetHeader(cmd);
    
    // transmit!
    await readerTX(packet);
    await readerRX(6); 
    return await readerRX(128);
}
   
// ---------------- //

async function rd(){
    let raw;
    console.log("* Read start...");

    do {
        // get : stat 1, stat 2, [idm]
        raw = (await polling(systemCode)).slice(15, 25);
        
        await sleep(250);
    }
    while (!(raw[0] == 0x14 && raw[1] == 0x01));
    
    console.log("* Read end.");

    // skip status byte
    return new Uint8Array(raw.slice(2, 10));
}

function sequence(num){
    const seq = [
        document.getElementById("seq1").style,
        document.getElementById("seq2").style,
        document.getElementById("seq3").style,
        document.getElementById("seq4").style,
        document.getElementById("seq5").style,
        document.getElementById("waiting").style,
        document.getElementById("check").style
    ]

    seq.forEach(element => element.display = "none");
    
    if (1 <= num && num <= 5) {
        if (num == 1 || num == 5){
            if (num == 5) seq[6].display = "block";
        } else {
            seq[5].display = "block";
        }
        seq[num-1].display = "block";
    }
}

window.onload = function(){
    sequence(1);
}

async function start(){
    
    sequence(2);
    await sleep(150);
    await deviceSetup();

    sequence(3);
    await initialize();

    sequence(4);

    do{
        let idm = await rd();
        let idmDisplay = "";
        
        idm.forEach(element => {
            if (element<16) idmDisplay+="0";
            idmDisplay += element.toString(16);
        });

        document.getElementById("idm").innerText = idmDisplay;
 
        sequence(5);
        await sleep(1000)
    } while(true);
}