import { ADDRESS, COMMAND, Sensor } from "./lib";

const sensor = new Sensor();

console.log(await sensor.sendCommand(COMMAND.WRITE, 0xFFFF));

console.log(await sensor.sendCommand(COMMAND.WRITE, ADDRESS.LED_SETTING_NORMAL_STATE, new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00])));

console.log(await sensor.getLatestDataShort());

