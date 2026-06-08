import { ADDRESS, COMMAND, commandToPayload, Frame, parsePayload, sendFrame } from "./lib";

checkPlink();
const comPort = await findPort().then(ports => {
    switch (ports.length) {
        case 0:
            console.error("No 2JCIE-BU01 found");
            process.exit(1);
        case 1:
            return ports[0];
        default:
            console.log("Multiple 2JCIE-BU01 found");
            console.log(`Use the first one: ${ports[0]}`);
            return ports[0];
    }
});

let response;

response = await sendFrame(comPort, new Frame(commandToPayload(COMMAND.WRITE, 0xffff, new Uint8Array([0x00]))));
console.log(parsePayload(response.payload));

response = await sendFrame(comPort, new Frame(commandToPayload(COMMAND.WRITE, ADDRESS.LED_SETTING_NORMAL_STATE, new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]))));
console.log(parsePayload(response.payload));

response = await sendFrame(comPort, new Frame(commandToPayload(COMMAND.READ, ADDRESS.LATEST_DATA_SHORT)));
console.log(parsePayload(response.payload));

function checkPlink() {
    try {
        Bun.spawn(["plink.exe", "-V"], { stdin: null, stdout: "ignore", stderr: "ignore" })
    } catch (e: any) {
        if (e.code === "ENOENT") {
            console.error("plink.exe not found");
            console.error("run `winget install PuTTY.PuTTY` to install PuTTY");
        } else {
            console.error(e);
        }
        process.exit(1);
    }
}

// Get-PnpDevice遅い
// function findPort() {
//     return Bun.spawn(
//         ["powershell.exe", "-Command", "Get-PnpDevice -Class Ports -PresentOnly | ConvertTo-Json"],
//         { stdin: null, stdout: "pipe", stderr: "ignore" }
//     ).stdout.json().catch(() => [])
//         .then(json => {
//             if (!Array.isArray(json)) {
//                 json = [json];
//             }
//             return json.filter(
//                 (device: any) => device.HardwareID.some((id: string) => id === "FTDIBUS\\COMPORT&VID_0590&PID_00D4")
//             ).map(
//                 (device: any) => device.Name.match(/COM\d+/)?.[0]
//             );
//         });
// }
function findPort() {
    return Bun.spawn(
        ["powershell.exe", "-Command", "pnputil.exe /enum-devices /connected /class Ports /deviceids /format csv | ConvertFrom-Csv | ConvertTo-Json"],
        { stdin: null, stdout: "pipe", stderr: "ignore" }
    ).stdout.json().catch(() => [])
        .then(json => {
            if (!Array.isArray(json)) {
                json = [json];
            }
            return json.filter(
                (device: any) => device.HardwareIds?.split(";").some((id: string) => id === "FTDIBUS\\COMPORT&VID_0590&PID_00D4")
            ).map(
                (device: any) => device.DeviceDescription.match(/COM\d+/)?.[0]
            );
        })
}