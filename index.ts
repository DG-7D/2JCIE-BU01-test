const COM_PORT = "COM9";

const FRAME_LATEST_DATA_SHORT = makeFrame(new Uint8Array([0x01, 0x22, 0x50]));

const proc = Bun.spawn(
    ["plink.exe", "-serial", "-batch", "-sercfg", "115200,8,1,n,N", COM_PORT],
    {
        stdin: FRAME_LATEST_DATA_SHORT,
        stdout: "pipe",
        stderr: "ignore",
    });

let readBytesCount = 0;
let length = 0xFFFF;
let data;
for await (const chunk of proc.stdout) {
    for (const byte of chunk) {
        switch (readBytesCount) {
            case 2:
                length = 0xFF00 + byte;
                break;
            case 3:
                length = (byte << 8) + (length & 0xFF);
                data = new Uint8Array(length - 2);
                break;
            case 2 + 2 + length - 1:
                proc.kill();
                break;
        }
        if (4 <= readBytesCount && readBytesCount < 4 + length - 2) {
            data![readBytesCount - 4] = byte;
        }
        readBytesCount++;
    }
}
console.log(parseLatestDataShort(data!));

function bytesToSInt16LE(bytes: Uint8Array): number {
    const value = bytes[0]! + (bytes[1]! << 8);
    return value >= 0x8000 ? value - 0x10000 : value;
}
function bytesToSInt32LE(bytes: Uint8Array): number {
    const value = bytes[0]! + (bytes[1]! << 8) + (bytes[2]! << 16) + (bytes[3]! << 24);
    return value >= 0x80000000 ? value - 0x100000000 : value;
}

function parseLatestDataShort(payload: Uint8Array) {
    if (payload[0] != 0x01) {
        throw new Error("Invalid Command");
    }
    if (payload[1] != 0x22 || payload[2] != 0x50) {
        throw new Error("Invalid Address");
    }
    data = payload.subarray(3);
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

function makeFrame(payload: Uint8Array): Uint8Array {
    const frame = new Uint8Array(4 + payload.length + 2);
    frame[0] = 0x52;
    frame[1] = 0x42;
    frame[2] = (payload.length + 2) & 0xFF;
    frame[3] = (payload.length + 2 >> 8) & 0xFF;
    frame.set(payload, 4);
    frame.set(
        crc16(frame.subarray(0, 4 + payload.length)),
        4 + payload.length);
    return frame;
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