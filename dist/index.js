"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
function getLineBreakType(memo) {
    const indexOfLF = memo.indexOf('\n', 1); // No need to check first-character
    if (indexOfLF === -1) {
        if (memo.indexOf('\r') !== -1)
            return '\r';
        return '\n';
    }
    if (memo[indexOfLF - 1] === '\r')
        return '\r\n';
    return '\n';
}
let lineBreakType;
// Use class to keep everything a bit more confined
class Rhythm {
    constructor() {
        this.lines = [];
    }
    getRhythmOffset(note, barTiming) {
        for (let i = 0; i < this.lines.length; i++) {
            const index = this.lines[i].notes.indexOf(note);
            if (index >= 0) {
                // We always have 4 rhythm lines
                const lineTiming = barTiming / 4;
                // Add parentheses for better readability
                // (lineTiming * i) gets the beat offset for the line
                // (lineTiming / this.lines[i].division) gets the timing offset inside the line
                // ((lineTiming / this.lines[i].division) * index) gets the timing for the note in the line
                return (lineTiming * i) + ((lineTiming / this.lines[i].division) * index);
            }
        }
        return -1;
    }
    getMappedTimings(barTiming, numBar) {
        const timings = [];
        for (let i = 1; i < 17; i++) {
            let offset = this.getRhythmOffset(i, barTiming);
            if (offset === -1) {
                break;
            }
            // Trim to 100th of a millisecond (probably too precise anyways)
            timings.push(Math.round((offset + barTiming * numBar) * 100) / 100);
        }
        return timings;
    }
    add(rhythmLine) {
        this.lines.push(rhythmLine);
    }
}
// Map weird symbols
const rhythmSymbolMap = {
    '①': 1,
    '②': 2,
    '③': 3,
    '④': 4,
    '⑤': 5,
    '⑥': 6,
    '⑦': 7,
    '⑧': 8,
    '⑨': 9,
    '⑩': 10,
    '⑪': 11,
    '⑫': 12,
    '⑬': 13,
    '⑭': 14,
    '⑮': 15,
    '⑯': 16
};
const rhyhthmSymbolList = [...Object.keys(rhythmSymbolMap), '口'];
function getRhythmTimings(section, barTiming, numBar) {
    // Split and clean lines
    const lines = section.split(lineBreakType).map(elem => elem.trim());
    const rhythm = new Rhythm();
    for (const line of lines) {
        const rhythmLine = line.match(/\|(.*?)\|/);
        if (rhythmLine != null && rhythmLine[1] != null) {
            const notes = [];
            const division = rhythmLine[1].length;
            for (const symbol of rhythmLine[1]) {
                notes.push(rhythmSymbolMap[symbol]);
            }
            rhythm.add({ notes, division });
        }
    }
    return rhythm.getMappedTimings(barTiming, numBar);
}
function getHoldStartPos(block, index) {
    // search down
    for (let i = index + 4; i < 16; i += 4) {
        // break if there is no arrow path
        if (rhyhthmSymbolList.includes(block[i]) || block[i] === '―') {
            break;
        }
        if (block[i] === '∧') {
            return i;
        }
    }
    // search up
    for (let i = index - 4; i >= 0; i -= 4) {
        // break if there is no arrow path
        if (rhyhthmSymbolList.includes(block[i]) || block[i] === '―') {
            break;
        }
        if (block[i] === '∨') {
            return i;
        }
    }
    // search left
    for (let i = index - 1; i % 4 !== 3 && i >= 0; i--) {
        // break if there is no arrow path
        if (rhyhthmSymbolList.includes(block[i]) || block[i] === '｜') {
            break;
        }
        if (block[i] === '＞') {
            return i;
        }
    }
    // search right
    for (let i = index + 1; i % 4 !== 0 && i < 16; i++) {
        // break if there is no arrow path
        if (rhyhthmSymbolList.includes(block[i]) || block[i] === '｜') {
            break;
        }
        if (block[i] === '＜') {
            return i;
        }
    }
    return -1;
}
// Encode start and hold in binary
// Make negative to easily check if pos is encoded hold
function encodeHold(start, end) {
    return -(start | (end << 4));
}
function decodeHold(pos) {
    return { from: ((-pos) & 0b1111), to: ((-pos) >> 4) };
}
function getPositions(section) {
    const blocks = section.split(lineBreakType + lineBreakType)
        .map(block => {
        return block.split(lineBreakType).map(line => {
            var _a, _b;
            let retVal = line.trim();
            return (_b = (_a = retVal.match(/(.*?)\s\|/)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : retVal;
        }).join('');
    });
    const positionMap = [];
    for (const block of blocks) {
        for (let i = 0; i < block.length; i++) {
            const mappedSymbol = rhythmSymbolMap[block[i]] - 1;
            if (!isNaN(mappedSymbol) && mappedSymbol != null) {
                let pos = getHoldStartPos(block, i);
                if (pos !== -1) {
                    pos = encodeHold(pos, i);
                }
                else {
                    pos = i;
                }
                if (positionMap[mappedSymbol] != null) {
                    positionMap[mappedSymbol].push(pos);
                }
                else {
                    positionMap[mappedSymbol] = [pos];
                }
            }
        }
    }
    return positionMap;
}
function findIndexWithPos(positions, startFrom, pos) {
    for (let i = startFrom; i < positions.length; i++) {
        const index = positions[i].indexOf(pos);
        if (index >= 0) {
            return { posIndex: i, spliceIndex: index };
        }
    }
    return { posIndex: -1, spliceIndex: -1 };
}
function extractTimings(bpm, sections) {
    let barTiming = 60000 / bpm * 4;
    let ticks = [];
    let carriedHolds = [];
    for (let i = 0; i < sections.length; i++) {
        const timings = getRhythmTimings(sections[i], barTiming, i);
        const positions = getPositions(sections[i]);
        if (carriedHolds.length > 0) {
            let newCarriedHolds = [];
            for (let i = 0; i < carriedHolds.length; i++) {
                const { posIndex, spliceIndex } = findIndexWithPos(positions, 0, carriedHolds[i].to);
                if (posIndex > -1) {
                    positions[posIndex].splice(spliceIndex, 1);
                    ticks[carriedHolds[i].indexInTicks].holds[carriedHolds[i].indexInHolds].releaseOn = timings[posIndex];
                }
                else {
                    // Not found, try again next time
                    newCarriedHolds.push(carriedHolds[i]);
                }
            }
            carriedHolds = newCarriedHolds;
        }
        for (let j = 0; j < timings.length; j++) {
            const holds = positions[j].map((pos, index) => ({ pos, index })).filter(pos => pos.pos < 0);
            if (holds.length > 0) {
                let parsedHolds = [];
                for (const hold of holds) {
                    const { from, to } = decodeHold(hold.pos);
                    const { posIndex, spliceIndex } = findIndexWithPos(positions, j + 1, to);
                    if (posIndex > -1) {
                        positions[posIndex].splice(spliceIndex, 1);
                        parsedHolds.push({
                            from,
                            to,
                            releaseOn: timings[posIndex]
                        });
                    }
                    else {
                        carriedHolds.push({
                            from,
                            to,
                            releaseOn: -1,
                            indexInTicks: ticks.length,
                            indexInHolds: parsedHolds.length
                        });
                        parsedHolds.push({
                            from,
                            to,
                            releaseOn: -1
                        });
                    }
                }
                const parsedNotes = positions[j].filter(pos => pos >= 0);
                ticks.push({ time: timings[j], notes: parsedNotes, holds: parsedHolds });
            }
            else {
                if (positions[j].length > 0) {
                    ticks.push({ time: timings[j], notes: positions[j] });
                }
            }
        }
    }
    return ticks;
}
function splitIntoSections(memo) {
    let index = 1;
    let stringIndex = memo.indexOf(index.toString());
    const sections = [];
    while (stringIndex >= 0) {
        const oldIndex = stringIndex + index.toString().length + lineBreakType.length;
        index++;
        let end = memo.indexOf(index.toString());
        stringIndex = end;
        if (end === -1) {
            end = memo.length;
        }
        sections.push(memo.substring(oldIndex, end).trim());
    }
    return sections;
}
function stripHeader(memo) {
    const index = memo.search(new RegExp(lineBreakType + '1' + lineBreakType));
    return memo.slice(index);
}
function countNotes(ticks) {
    let noteCount = 0;
    let holdCount = 0;
    for (const tick of ticks) {
        if (tick.notes != null) {
            noteCount += tick.notes.length;
        }
        if (tick.holds != null) {
            holdCount += tick.holds.length;
        }
    }
    return { noteCount, holdCount };
}
function parseMemo(memo, parsedFileName) {
    lineBreakType = getLineBreakType(memo);
    memo = memo.trim();
    let memson = {};
    const lines = memo.split(lineBreakType);
    if (!fs_1.existsSync(parsedFileName)) {
        memson.title = lines[0].trim();
        memson.artist = lines[1].trim();
        memson.bpm = parseInt(memo.match(/BPM:\s(\d+)/)[1]);
        memson.audio = memson.title + '.mp3';
        memson.offset = -1;
        memson.jacket = memson.title + '.png';
        memson.charts = {};
    }
    else {
        memson = JSON.parse(fs_1.readFileSync(parsedFileName, { encoding: 'utf-8' }));
    }
    const diffCat = lines[3].trim().toLowerCase();
    const diff = parseInt(memo.match(/Level:\s(\d+)/)[1]);
    memson.charts[diffCat] = {
        difficulty: diff,
        ticks: []
    };
    const sections = splitIntoSections(stripHeader(memo));
    memson.charts[diffCat].ticks = extractTimings(memson.bpm, sections);
    const { noteCount, holdCount } = countNotes(memson.charts[diffCat].ticks);
    memson.charts[diffCat].noteCount = noteCount;
    memson.charts[diffCat].holdCount = holdCount;
    return memson;
}
function parseAndWrite(filepath) {
    const parsedFileName = path_1.join(path_1.dirname(filepath), path_1.basename(filepath).replace(/_(adv|ext|bsc)/, '').replace(/\.memo|\.txt/, '') + '.json');
    const memson = parseMemo(fs_1.readFileSync(filepath, { encoding: 'utf-8' }), parsedFileName);
    let outstring;
    if (process.argv[3] === 'true') {
        outstring = JSON.stringify(memson, null, 2);
    }
    else {
        outstring = JSON.stringify(memson);
    }
    fs_1.writeFileSync(parsedFileName, outstring);
}
if (process.argv.length < 3) {
    console.error('Usage: node index.js [path-to-memo] <pretty>');
    process.exit(1);
}
const filepath = path_1.resolve(process.argv[2]);
const stats = fs_1.lstatSync(filepath);
if (stats.isDirectory()) {
    const entries = fs_1.readdirSync(filepath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.memo') || entry.name.endsWith('.txt'))) {
            parseAndWrite(path_1.join(filepath, entry.name));
            console.log(`Parsed ${entry.name}`);
        }
    }
}
else {
    parseAndWrite(filepath);
}
console.log('Parsed sucessfully. Fields "offset", "jacket" and "audio" need to be filled in manually.');
