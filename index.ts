const HEADER = new Uint8Array([0x52, 0x42]);
const COMMAND = {
    READ: 0x01,
    WRITE: 0x02,
    READ_ERROR: 0x81,
    WRITE_ERROR: 0x82,
    UNKNOWN: 0xFF,
}
const ADDRESS = {
    MEMORY_DATA_LONG: 0x500E,
    MEMORY_DATA_SHORT: 0x500F,
    LATEST_DATA_LONG: 0x5021,
    LATEST_DATA_SHORT: 0x5022,
    ACCELERATION_MEMORY_DATA_HEADER: 0x503E,
    ACCELERATION_MEMORY_DATA_DATA: 0x503F,

    LATEST_MEMORY_INFORMATION: 0x5004,
    LATEST_SENSING_DATA: 0x5012,
    LATEST_CALCULARION_DATA: 0x5013,
    LATEST_SENSING_FLAG: 0x5014,
    LATEST_CALCULATION_FLAG: 0x5015,
    LATEST_ACCELERATION_STATUS: 0x5016,

    VIBRATION_COUNT: 0x5031,

    LED_SETTING_NORMAL_STATE: 0x5111,
    LED_SETTING_EVENT_STATE: 0x5112,
    LED_STATE_OPERATION: 0x5113,
    INSTALLATION_OFFSET: 0x5114,
    ADVERTISING_SETTING: 0x5115,
    MEMORY_RESET: 0x5116,
    MODE_CHANGE: 0x5117,
    ACCELERATION_LOGGER_CONTROL: 0x5118,
    ACCELERATION_LOGGER_STATUS: 0x5119,

    TIME_COUNTER: 0x5201,
    TIME_SETTING: 0x5202,
    MEMORY_STORAGE_INTERVAL: 0x5203,

    DEVICE_INFORMATION: 0x180A,

    TEMPERATURE_SENSOR_1: 0x5211,
    TEMPERATURE_SENSOR_2: 0x5212,
    RELATIVE_HUMIDITY_SENSOR_1: 0x5213,
    RELATIVE_HUMIDITY_SENSOR_2: 0x5214,
    AMBIENT_LIGHT_SENSOR_1: 0x5215,
    AMBIENT_LIGHT_SENSOR_2: 0x5216,
    BAROMETRIC_PRESSURE_SENSOR_1: 0x5217,
    BAROMETRIC_PRESSURE_SENSOR_2: 0x5218,
    SOUND_NOISE_SENSOR_1: 0x5219,
    SOUND_NOISE_SENSOR_2: 0x521A,
    ETVOC_SENSOR_1: 0x521B,
    ETVOC_SENSOR_2: 0x521C,
    ECO2_SENSOR_1: 0x521D,
    ECO2_SENSOR_2: 0x521E,
    DISCOMFORT_INDEX_SENSOR_1: 0x521F,
    DISCOMFORT_INDEX_SENSOR_2: 0x5220,
    HEAT_STROKE_SENSOR_1: 0x5221,
    HEAT_STROKE_SENSOR_2: 0x5222,
    SI_VALUE_ACCELERATION: 0x5226,
    PGA_ACCELERATION: 0x5227,
    SEISMIC_INTENSITY: 0x5228,

    ERROR_STATUS: 0x5401,
    INSTALLATION_DIRECTION: 0x5402,
}
const ERROR = {
    CRC_ERROR: 0x01,
    COMMAND_ERROR: 0x02,
    ADDRESS_ERROR: 0x03,
    LENGTH_ERROR: 0x04,
    DATA_ERROR: 0x05,
    BUSY: 0x06,
}

const LE = true;

type RawPayload = Uint8Array;

// Header(2) + Length(2) + Payload + CRC(2)
class Frame {
    get header() {
        return HEADER;
    }
    get length() {
        return this.payload.length + 2;
    }
    readonly payload: Uint8Array;
    get crc() {
        return crc16(this.makeBytes(HEADER, this.length, this.payload, new Uint8Array(0)));
    }

    get bytes() {
        return this.makeBytes(HEADER, this.length, this.payload, this.crc);
    }

    constructor(payload: RawPayload, header?: Uint8Array, length?: number, crc?: Uint8Array) {
        if (header && (header[0] !== HEADER[0] || header[1] !== HEADER[1])) {
            throw new Error("Invalid Header");
        }
        const validLength = payload.length + 2;
        if (length && length !== validLength) {
            throw new Error("Invalid Length");
        }
        const validCrc = crc16(this.makeBytes(HEADER, validLength, payload, new Uint8Array(0)));
        if (crc && (crc[0] !== validCrc[0] || crc[1] !== validCrc[1])) {
            throw new Error("Invalid CRC");
        }
        this.payload = payload;
    }

    private makeBytes(header: Uint8Array, length: number, payload: Uint8Array, crc: Uint8Array): Uint8Array {
        return new Uint8Array([
            ...header,
            ...UInt16LEToBytes(length),
            ...payload,
            ...crc,
        ])
    }
}

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

response = await sendFrame(comPort, new Frame(commandToPayload(COMMAND.WRITE, ADDRESS.LED_SETTING_NORMAL_STATE, new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]))));
console.log(parsePayload(response.payload));

response = await sendFrame(comPort, new Frame(commandToPayload(COMMAND.READ, ADDRESS.LATEST_DATA_SHORT)));
console.log(parsePayload(response.payload));

async function sendFrame(port: string, frame: Frame): Promise<Frame> {
    const proc = Bun.spawn(
        ["plink.exe", "-serial", "-batch", "-sercfg", "115200,8,1,n,N", port],
        {
            stdin: frame.bytes,
            stdout: "pipe",
            stderr: "pipe",
        });

    const timeout = setTimeout(() => {
        proc.kill();
        throw new Error("Timeout");
    }, 1000);

    let readingByte = 0;
    let length = 0xFFFF;
    let payload;
    const crc = new Uint8Array(2);

    for await (const chunk of proc.stdout) {
        for (const byte of chunk) {
            if (readingByte === 0) {
                clearTimeout(timeout);
                if (byte !== HEADER[0]) {
                    proc.kill();
                    throw new Error("Invalid Header");
                }
            } else if (readingByte === 1) {
                if (byte !== HEADER[1]) {
                    proc.kill();
                    throw new Error("Invalid Header");
                }
            } else if (readingByte === 2) {
                length = 0xFF00 + byte;
            } else if (readingByte === 3) {
                length = (byte << 8) + (length & 0xFF);
                payload = new Uint8Array(length - 2);
            } else if (4 <= readingByte && readingByte < 4 + length - 2) {
                payload![readingByte - 4] = byte;
            } else if (readingByte === 4 + length - 2) {
                crc[0] = byte;
            } else if (readingByte === 4 + length - 1) {
                proc.kill();
                crc[1] = byte;
            }
            readingByte++;
        }
    }
    if (!payload) {
        throw new Error("No Payload");
    }
    return new Frame(payload, undefined, length, crc);
}

function parsePayload(payload: Uint8Array) {
    const dataView = new DataView(payload.buffer);
    const command = dataView.getUint8(0);
    const address = dataView.getUint16(1, LE);
    const data = new DataView(payload.buffer, 3);
    if (command & 0x80) {
        return parseError(data);
    } else if (command === COMMAND.READ) {
        switch (address) {
            case ADDRESS.LATEST_DATA_SHORT:
                return parseLatestDataShort(data);
        }
    }
    return {
        command,
        address,
        data,
    };
}

function parseError(data: DataView) {
    switch (data.getUint8(0)) {
        case ERROR.CRC_ERROR:
            return { error: "CRC Error" };
        case ERROR.COMMAND_ERROR:
            return { error: "Command Error" };
        case ERROR.ADDRESS_ERROR:
            return { error: "Address Error" };
        case ERROR.LENGTH_ERROR:
            return { error: "Length Error" };
        case ERROR.DATA_ERROR:
            return { error: "Data Error" };
        case ERROR.BUSY:
            return { error: "Busy" };
        default:
            return { error: "Unknown Error" };
    }
}
function parseLatestDataShort(data: DataView) {
    return {
        sequenceNumber: data.getUint8(0),
        temperature: data.getInt16(1, LE) * 0.01,
        relativeHumidity: data.getInt16(3, LE) * 0.01,
        ambientLight: data.getInt16(5, LE) * 1,
        barometricPressure: data.getInt32(7, LE) * 0.001,
        soundNoise: data.getInt16(11, LE) * 0.01,
        eTVOC: data.getInt16(13, LE) * 1,
        eCO2: data.getInt16(15, LE) * 1,
        discomfortIndex: data.getInt16(17, LE) * 0.01,
        heatStroke: data.getInt16(19, LE) * 0.01,
    }
}

function commandToPayload(command: number, address: number, data: Uint8Array = new Uint8Array(0)): Uint8Array {
    return new Uint8Array([
        command,
        ...UInt16LEToBytes(address),
        ...data,
    ])
}

function UInt16LEToBytes(value: number): Uint8Array {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, LE);
    return bytes;
}

function crc16(data: Uint8Array): Uint8Array {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i]!;
        for (let j = 0; j < 8; j++) {
            if ((crc & 1) !== 0) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return new Uint8Array([crc & 0xFF, (crc >> 8) & 0xFF]);
}

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