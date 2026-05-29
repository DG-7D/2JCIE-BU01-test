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
}

const data = await sendFrame(COM_PORT, commandToFrame(COMMAND.READ, ADDRESS.LATEST_DATA_SHORT));
console.log(parseLatestDataShort(data!));

async function sendFrame(port: string, frame: Uint8Array): Promise<Uint8Array> {
    const proc = Bun.spawn(
        ["plink.exe", "-serial", "-batch", "-sercfg", "115200,8,1,n,N", COM_PORT],
        {
            stdin: frame,
            stdout: "pipe",
            stderr: "pipe",
        });

    const timeout = setTimeout(() => {
        throw new Error("Timeout");
    }, 1000);

    let readingByte = 0;
    let length = 0xFFFF;
    let payload;
    const crc = new Uint8Array(2);

    for await (const chunk of proc.stdout) {
        for (const byte of chunk) {
            if (readingByte === 0) {
                timeout.close();
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

function parseLatestDataShort(payload: Uint8Array) {
    if (payload[0] != 0x01) {
        throw new Error("Invalid Command");
    }
    if (payload[1] != 0x22 || payload[2] != 0x50) {
        throw new Error("Invalid Address");
    }
    const data = payload.subarray(3);
    return {
        sequenceNumber: data[0]!,
        temperature: bytesToSInt16LE(data.subarray(1, 3)) * 0.01,
        relativeHumidity: bytesToSInt16LE(data.subarray(3, 5)) * 0.01,
        ambientLight: bytesToSInt16LE(data.subarray(5, 7)) * 1,
        barometricPressure: bytesToSInt32LE(data.subarray(7, 11)) * 0.001,
        soundNoise: bytesToSInt16LE(data.subarray(11, 13)) * 0.01,
        eTVOC: bytesToSInt16LE(data.subarray(13, 15)) * 1,
        eCO2: bytesToSInt16LE(data.subarray(15, 17)) * 1,
        discomfortIndex: bytesToSInt16LE(data.subarray(17, 19)) * 0.01,
        heatStroke: bytesToSInt16LE(data.subarray(19, 21)) * 0.01,
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
    return new Uint8Array([value & 0xFF, (value >> 8) & 0xFF]);
}
function bytesToSInt16LE(bytes: Uint8Array): number {
    const value = bytes[0]! + (bytes[1]! << 8);
    return value >= 0x8000 ? value - 0x10000 : value;
}
function bytesToSInt32LE(bytes: Uint8Array): number {
    const value = bytes[0]! + (bytes[1]! << 8) + (bytes[2]! << 16) + (bytes[3]! << 24);
    return value >= 0x80000000 ? value - 0x100000000 : value;
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