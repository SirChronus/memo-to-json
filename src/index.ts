import { lstatSync, readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import type { Chart, DifficultyCategory, Hold, Memson, Tick } from './memson';

let count = 0;

function getLineBreakType(memo: string): string {
	const indexOfLF = memo.indexOf('\n', 1);  // No need to check first-character

    if (indexOfLF === -1) {
        if (memo.indexOf('\r') !== -1) return '\r';

        return '\n';
    }

    if (memo[indexOfLF - 1] === '\r') return '\r\n';

    return '\n';
}

let lineBreakType: string;

let sectionOffsets: number[] = [];
let sectionTimings: number[] = [];

interface RhythmLine {
	/** Number of dashes in rhythm. Usually 4 sometimes 8 or 6 or 2 */
	division: number;
	/** Array of length division. Contains numbers from 1-16 that correspond to position mapping */
	notes: number[];
}

// Use class to keep everything a bit more confined
class Rhythm {
	lines: RhythmLine[] = [];

	private getRhythmOffset(note: number, timing: number): number {
		for (let i = 0; i < this.lines.length; i++) {
			const index = this.lines[i].notes.indexOf(note);
			if (index >= 0) {
				// We always have 4 rhythm lines
				const lineTiming = timing;
				// Add parentheses for better readability
				// (lineTiming * i) gets the beat offset for the line
				// (lineTiming / this.lines[i].division) gets the timing offset inside the line
				// ((lineTiming / this.lines[i].division) * index) gets the timing for the note in the line
				return (lineTiming * i) + ((lineTiming / this.lines[i].division) * index);
			}
		}

		return -1;
	}

	public getMappedTimings(numBar: number): number[] {
		const timings: number[] = [];

		for (let i = 1; i < 17; i++) {
			const timing = sectionTimings[numBar];
			let offset = this.getRhythmOffset(i, timing);
			if (offset === -1) {
				break;
			}
			// Trim to 100th of a millisecond (probably too precise anyways)
			timings.push(Math.round((offset + sectionOffsets[numBar]) * 100) / 100);
		}

		return timings;
	}

	public add(rhythmLine: RhythmLine) {
		this.lines.push(rhythmLine);
	}
}

// Map weird symbols
const rhythmSymbolMap: { [index: string]: number } = {
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

function getRhythmTimings(section: string, numBar: number): number[] {
	// Split and clean lines
	const lines = section.split(lineBreakType).map(elem => elem.trim());
	const rhythm = new Rhythm();

	for (const line of lines) {
		const rhythmLine = line.match(/\|(.*?)\|/);
		if (rhythmLine != null && rhythmLine[1] != null) {
			const notes: number[] = [];
			const division = rhythmLine[1].length;
			for (const symbol of rhythmLine[1]) {
				notes.push(rhythmSymbolMap[symbol]);
			}
			rhythm.add({ notes, division });
		}
	}

	return rhythm.getMappedTimings(numBar);
}

function getHoldStartPos(block: string, index: number): number {
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
function encodeHold(start: number, end: number): number {
	return -(start | (end << 4));
}

function decodeHold(pos: number): { from: number; to: number } {
	return { from: ((-pos) & 0b1111), to: ((-pos) >> 4)  };
}

function getPositions(section: string): number[][] {
	const blocks = section.split(lineBreakType + lineBreakType)
		.map(block => {
			return block.split(lineBreakType).map(line => {
				let retVal = line.trim();
				return retVal.match(/(.*?)\s\|/)?.[1] ?? retVal;
			}).join('');
		});
	const positionMap: number[][] = [];

	for (const block of blocks) {
		for (let i = 0; i < block.length; i++) {
			const mappedSymbol = rhythmSymbolMap[block[i]] - 1;
			if (!isNaN(mappedSymbol) && mappedSymbol != null) {
				let pos = getHoldStartPos(block, i);
				if (pos !== -1) {
					pos = encodeHold(pos, i);
				} else {
					pos = i;
				}

				if (positionMap[mappedSymbol] != null) {
					positionMap[mappedSymbol].push(pos);
				} else {
					positionMap[mappedSymbol] = [pos];
				}
			}
		}
	}

	return positionMap;
}

function findIndexWithPos(positions: number[][], startFrom: number, pos: number): { posIndex: number; spliceIndex: number } {
	for (let i = startFrom; i < positions.length; i++) {
		const index = positions[i].indexOf(pos);

		if (index >= 0) {
			return { posIndex: i, spliceIndex: index };
		}
	}

	return { posIndex: -1, spliceIndex: -1 };
}

function extractTimings(bpm: number, sections: string[]): Tick[] {
	let ticks: Tick[] = [];

	let carriedHolds: (Hold & { indexInTicks: number; indexInHolds: number; })[] = [];
	for (let i = 0; i < sections.length; i++) {
		const timings = getRhythmTimings(sections[i], i);
		const positions = getPositions(sections[i]);

		if (carriedHolds.length > 0) {
			let newCarriedHolds: (Hold & { indexInTicks: number; indexInHolds: number; })[] = [];
			for (let i = 0; i < carriedHolds.length; i++) {
				const { posIndex, spliceIndex } = findIndexWithPos(positions, 0, carriedHolds[i].to);

				if (posIndex > -1) {
					positions[posIndex].splice(spliceIndex, 1);
					ticks[carriedHolds[i].indexInTicks].holds[carriedHolds[i].indexInHolds].releaseOn = timings[posIndex];
				} else {
					// Not found, try again next time
					newCarriedHolds.push(carriedHolds[i]);
				}
			}

			carriedHolds = newCarriedHolds;
		}

		for (let j = 0; j < timings.length; j++) {
			const holds = positions[j].map((pos, index) => ({ pos, index })).filter(pos => pos.pos < 0)

			if (holds.length > 0) {
				let parsedHolds: Hold[] = [];
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
					} else {
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
			} else {
				if (positions[j].length > 0) {
					ticks.push({ time: timings[j], notes: positions[j] });
				}
			}
		}
	}

	return ticks;
}

function splitIntoSections(memo: string, startIndex = 1): string[] {
	let index = startIndex;
	let stringIndex = memo.search(new RegExp('^' + index.toString() + lineBreakType, 'gm'));
	const sections: string[] = [];

	while (stringIndex >= 0) {
		const oldIndex = stringIndex + index.toString().length + lineBreakType.length;
		index++;
		let end = memo.search(new RegExp('^' + index.toString() + lineBreakType, 'gm'));
		stringIndex = end;
		if (end === -1) {
			end = memo.length;
		}
		sections.push(memo.substring(oldIndex, end).trim());
	}

	return sections;
}

function splitIntoBPMSections(memo: string): string[] {
	let stringIndex = memo.indexOf('BPM');
	const sections: string[] = [];

	while (stringIndex >= 0) {
		const oldIndex = stringIndex;
		let end = memo.indexOf('BPM', stringIndex + 3);
		stringIndex = end;
		if (end === -1) {
			end = memo.length;
		}
		sections.push(memo.substring(oldIndex, end).trim());
	}

	return sections;
}

function calculateTimingsForSection(bpmSection: string, baseBpm?: number) {
	let bpm = baseBpm;
	let sections: string[];
	if (bpm == null) {
		bpm = parseInt(bpmSection.match(/BPM:?.*?(\d+)/)[1]);
		const lineEndingIndex = bpmSection.indexOf(lineBreakType);
		const startSectionIndex = bpmSection.substring(lineEndingIndex + 1, bpmSection.indexOf(lineBreakType, lineEndingIndex + 1));
		sections = splitIntoSections(bpmSection.slice(lineEndingIndex), parseInt(startSectionIndex));
	} else {
		sections = splitIntoSections(bpmSection);
	}
	const lineTiming = 60_000 / bpm;
	const sectionTimingIndexOffset = sectionTimings.length;

	for (let i = 0; i < sections.length; i++) {
		const rhythmCount = sections[i].match(/\|(.*?)\|/gm).length;
		sectionTimings[sectionTimingIndexOffset + i] = lineTiming;
		sectionOffsets[sectionTimingIndexOffset + 1 + i] = lineTiming * rhythmCount + sectionOffsets[sectionTimingIndexOffset + i];
	}
}

function stripHeader(memo: string): string {
	const numberIndex = memo.search(new RegExp(lineBreakType + '1' + lineBreakType));
	// Search for seconds bpm occurence if it exists
	const bpmIndex = memo.indexOf('BPM', memo.indexOf('BPM') + 3);
	if (bpmIndex >= 0 && bpmIndex < numberIndex) {
		return memo.slice(bpmIndex);
	}
	return memo.slice(numberIndex);
}

function countNotes(ticks: Tick[]): { noteCount: number; holdCount: number; } {
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

function spliceString(str: string, start: number, delCount: number, newSubString: string): string {
	return str.slice(0, start) + newSubString + str.slice(start + Math.abs(delCount));
}

function mergeSplitBeats(memo: string): string {
	const sections = splitIntoSections(memo);
	for (let i = 0; i < sections.length; i++) {
		const beats = sections[i].match(/\|(.*?)\|/gm);
		if (beats != null) {
			for (let j = 1; j < beats.length - 1; j++) {
				if (beats[j].length === 4 && beats[j + 1].length === 4) {
					const mergeIndex = sections[i].indexOf(beats[j]);
					sections[i] = spliceString(sections[i], mergeIndex + 3, 0, beats[j + 1].slice(1, -1));
					const deleteIndex = sections[i].indexOf(beats[j + 1]);
					sections[i] = spliceString(sections[i], deleteIndex, 4, '');
				}
			}
		}

		sections[i] = `${i + 1}\n${sections[i]}`;
	}

	return sections.join('\n');
}

function trimEmptyBars(memo: string): string {
	const firstBar = memo.slice(1 + lineBreakType.length, memo.indexOf('2')).trim().split(lineBreakType);
	let emptyLineCount = 0;
	if (firstBar.length === 4) {
		for (const line of firstBar) {
			if (line.includes('口口口口')) {
				emptyLineCount++;
			}
		}

		if (emptyLineCount === 4) {
			const trimmedMemo = splitIntoSections(memo).slice(1);
			return trimmedMemo.map((section, index) => `${index + 1}\n${section}`).join('\n');
		}
	}
	// TODO: Trim empty bars at end if needed

	return memo;
}

function parseMemo(memo: string, parsedFileName: string): Memson {
	lineBreakType = getLineBreakType(memo);
	memo = memo.trim();

	let memson: Partial<Memson> = {};
	const lines = memo.split(lineBreakType);
	if (!existsSync(parsedFileName)) {
		memson.title = lines[0].trim();
		memson.artist = lines[1].trim();
		const bpmMatches = memo.match(/BPM:\s(\d+)-?(\d*)/);
		memson.minBpm = parseInt(bpmMatches[1]);
		if (bpmMatches.length > 2 && bpmMatches[2] !== '') {
			memson.maxBpm = parseInt(bpmMatches[2])
		}
		memson.audio = 'audio.mp3';
		memson.offset = -1;
		memson.jacket = 'jacket.png';
		memson.charts = {};
	} else {
		memson = JSON.parse(readFileSync(parsedFileName, { encoding: 'utf-8' }));
	}

	const diffCat = lines[3].trim().toLowerCase() as DifficultyCategory;
	const diff = parseFloat(memo.match(/Level:\s(\d+\.?\d*)/)[1]);
	memson.charts[diffCat] = {
		difficulty: diff,
		ticks: []
	} as Chart;

	let processedMemo = stripHeader(memo);
	processedMemo = mergeSplitBeats(processedMemo);
	processedMemo = trimEmptyBars(processedMemo);
	const sections = splitIntoSections(processedMemo);
	const bpmSections = splitIntoBPMSections(processedMemo);
	sectionTimings = [];
	sectionOffsets = [0];
	if (bpmSections.length > 0) {
		for (const bpmSection of bpmSections) {
			calculateTimingsForSection(bpmSection);
		}
	} else {
		calculateTimingsForSection(processedMemo, memson.minBpm);
	}
	memson.charts[diffCat].ticks = extractTimings(memson.minBpm, sections);
	const { noteCount, holdCount } = countNotes(memson.charts[diffCat].ticks);
	memson.charts[diffCat].noteCount = noteCount;
	memson.charts[diffCat].holdCount = holdCount;

	return memson as Memson;
}

function parseAndWrite(filepath: string, folderize: boolean) {
	let dir: string;
	const base = basename(filepath).replace(/_(adv|ext|bsc)/, '').replace(/\.memo|\.txt/, '') ;
	if (folderize) {
		dir = join(dirname(filepath), base);
		if (!existsSync(dir)) {
			mkdirSync(dir);
		}
	} else {
		dir = dirname(filepath);
	}

	const parsedFileName = join(dir, base + '.json');
	const memson = parseMemo(readFileSync(filepath, { encoding: 'utf-8' }), parsedFileName);
	let outstring: string;
	if (process.argv[3] === 'true') {
		outstring = JSON.stringify(memson, null, 2);
	} else {
		outstring = JSON.stringify(memson);
	}
	
	writeFileSync(parsedFileName, outstring);
}

if (process.argv.length < 3) {
	console.error('Usage: node index.js [path-to-memo] <pretty> <folderize>');
	process.exit(1);
}

const filepath = resolve(process.argv[2]);
const stats = lstatSync(filepath);
const start = process.hrtime.bigint();

if (stats.isDirectory()) {
	const entries = readdirSync(filepath, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isFile() && (entry.name.endsWith('.memo') || entry.name.endsWith('.txt'))) {
			parseAndWrite(join(filepath, entry.name), process.argv[4] === 'true');
			console.log(`Parsed ${entry.name}`);
			count++;
		}
	}
} else {
	parseAndWrite(filepath, process.argv[4] === 'true');
	count++;
}

const end = process.hrtime.bigint();

console.log('Parsed sucessfully. Fields "offset", "jacket" and "audio" need to be filled in manually.');
console.log(`Processing of ${count} files took ${Math.round(Number((end - start) / BigInt(1_000_000)))}ms`)
