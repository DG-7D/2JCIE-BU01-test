import { ADDRESS, COMMAND, Sensor } from "./lib";

checkPlink();

const sensor = new Sensor(await Sensor.getPort());

console.log(await sensor.sendCommand(COMMAND.WRITE, 0xFFFF));

console.log(await sensor.sendCommand(COMMAND.WRITE, ADDRESS.LED_SETTING_NORMAL_STATE, new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00])));

console.log(await sensor.getLatestDataShort());

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
