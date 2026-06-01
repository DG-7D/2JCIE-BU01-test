const COM_PORT = "COM9";

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

let response;

response = await sendFrame(COM_PORT, commandToFrame(COMMAND.WRITE, ADDRESS.LED_SETTING_NORMAL_STATE, new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00])));
console.log(parsePayload(response));

response = await sendFrame(COM_PORT, commandToFrame(COMMAND.READ, ADDRESS.LATEST_DATA_SHORT));
console.log(parsePayload(response));

async function sendFrame(port: string, frame: Uint8Array): Promise<Uint8Array> {
    const proc = Bun.spawn(
        ["plink.exe", "-serial", "-batch", "-sercfg", "115200,8,1,n,N", port],
        {
            stdin: frame,
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
                const calcCrc = crc16(new Uint8Array([...HEADER, ...UInt16LEToBytes(length), ...payload!]));
                if (crc[0] !== calcCrc[0] || crc[1] !== calcCrc[1]) {
                    throw new Error("Invalid CRC");
                }
            }
            readingByte++;
        }
    }
    if (payload) {
        return payload;
    }
    throw new Error();
}

function parsePayload(payload: Uint8Array) {
    const dataView = new DataView(payload.buffer);
    const command = dataView.getUint8(0);
    const address = dataView.getUint16(1, LE);
    const data = payload.subarray(3);
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

function parseError(data: Uint8Array) {
    switch (data[0]) {
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
function parseLatestDataShort(data: Uint8Array) {
    const dataView = new DataView(data.buffer)
    return {
        sequenceNumber: dataView.getUint8(0),
        temperature: dataView.getInt16(1, LE) * 0.01,
        relativeHumidity: dataView.getInt16(3, LE) * 0.01,
        ambientLight: dataView.getInt16(5, LE) * 1,
        barometricPressure: dataView.getInt32(7, LE) * 0.001,
        soundNoise: dataView.getInt16(11, LE) * 0.01,
        eTVOC: dataView.getInt16(13, LE) * 1,
        eCO2: dataView.getInt16(15, LE) * 1,
        discomfortIndex: dataView.getInt16(17, LE) * 0.01,
        heatStroke: dataView.getInt16(19, LE) * 0.01,
    }
}

function commandToPayload(command: number, address: number, data: Uint8Array = new Uint8Array(0)): Uint8Array {
    return new Uint8Array([
        command,
        ...UInt16LEToBytes(address),
        ...data,
    ])
}
function payloadToFrame(payload: Uint8Array): Uint8Array {
    const frame = new Uint8Array(4 + payload.length + 2);
    frame.set(HEADER, 0);
    frame.set(UInt16LEToBytes(payload.length + 2), 2);
    frame.set(payload, 4);
    frame.set(
        crc16(frame.subarray(0, 4 + payload.length)),
        4 + payload.length);
    return frame;
}
function commandToFrame(command: number, address: number, data: Uint8Array = new Uint8Array(0)): Uint8Array {
    return payloadToFrame(commandToPayload(command, address, data));
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