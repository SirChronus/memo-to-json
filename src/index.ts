import { readFileSync, writeFileSync } from 'fs';
import type { Memson, DifficultyCategory, Chart, Tick, Hold } from './Memson';
import { resolve } from 'path';

interface RhythmLine {
	/** Number of dashes in rhythm. Usually 4 sometimes 8 or 6 or 2 */
	division: number;
	/** Array of length division. Contains numbers from 1-16 that correspond to position mapping */
	notes: number[];
}

// Use class to keep everything a bit more confined
class Rhythm {
	lines: RhythmLine[] = [];

	private getRhythmOffset(note: number, barTiming: number): number {
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

	public getMappedTimings(barTiming: number, numBar: number): number[] {
		const timings: number[] = [];

		for (let i = 1; i < 17; i++) {
			let offset = this.getRhythmOffset(i, barTiming);
			if (offset === -1) {
				break;
			}
			// Trim to 100th of a millisecond (probably too precise anyways)
			timings.push(Math.round(offset + barTiming * numBar * 100) / 100);
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
}

function getRhythmTimings(section: string, barTiming: number, numBar: number): number[] {
	// Split and clean lines
	const lines = section.split('\n').map(elem => elem.trim());
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

	return rhythm.getMappedTimings(barTiming, numBar);
}

function getHoldStartPos(block: string, index: number): number {
	let offset = 0;
	let searchSymbol = '';

	if (index % 4 !== 0) {
		if (block[index - 1] === '―') {
			offset =  -1;
			searchSymbol = '＞';
		} else if (block[index - 1] === '＞') {
			return index - 1;
		}
	}
	if (index % 4 !== 3) {
		if (block[index + 1] === '―') {
			offset =  1;
			searchSymbol = '＜';
		} else if (block[index + 1] === '＜') {
			return index + 1;
		}
	}
	if (index <= 11) {
		if (block[index + 4] === '｜') {
			offset = 4;
			searchSymbol = '∧'
		} else if (block[index + 4] === '∧') {
			return index + 4;
		}
	}
	if (index >= 4) {
		if (block[index - 4] === '｜') {
			offset = -4;
			searchSymbol = '∨'
		} else if (block[index - 4] === '∨') {
			return index - 4;
		}
	}

	if (offset === 0) {
		return -1;
	}

	for (let i = index + (offset * 2); i < 16 && i >= 0; i += offset) {
		if (block[i] === searchSymbol) {
			return i;
		}
	}
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
	const blocks = section.split('\r\n\r\n')
		.map(block => {
			return block.split('\n').map(line => {
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
	let barTiming = 60_000 / bpm * 4;
	let ticks: Tick[] = [];

	let carriedHolds: (Hold & { indexInTicks: number; indexInHolds: number; })[] = [];
	for (let i = 0; i < sections.length; i++) {
		const timings = getRhythmTimings(sections[i], barTiming, i);
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

function splitIntoSections(memo: string): string[] {
	let index = 1;
	let stringIndex = memo.indexOf(index.toString());
	const sections: string[] = [];

	while (stringIndex >= 0) {
		const oldIndex = stringIndex + index.toString().length + 2;
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

function stripHeader(memo: string): string {
	const index = memo.search(/1\r\n/);
	return memo.slice(index);
}

function parseMemo(memo: string): Memson {
	const memson: Partial<Memson> = {};
	const lines = memo.split('\n');
	memson.title = lines[0].trim();
	memson.artist = lines[1].trim();
	memson.bpm = parseInt(memo.match(/BPM:\s(\d+)/)[1]);
	memson.audio = '';
	memson.offset = -1;
	memson.jacket = '';
	const diffCat = lines[3].trim().toLowerCase() as DifficultyCategory;
	const diff = parseInt(memo.match(/Level:\s(\d+)/)[1]);
	memson.charts = {};
	memson.charts[diffCat] = {
		difficulty: diff,
		ticks: []
	} as Chart;

	const sections = splitIntoSections(stripHeader(memo));
	memson.charts[diffCat].ticks = extractTimings(memson.bpm, sections);

	return memson as Memson;
}

if (process.argv.length < 4) {
	console.error('Usage: node index.js [path-to-memo] [outfile-name] <pretty>');
	process.exit(1);
}

const memson = parseMemo(readFileSync(resolve(process.argv[2]), { encoding: 'utf-8' }));
let outstring: string;
if (process.argv[4] === 'true') {
	outstring = JSON.stringify(memson, null, 2);
} else {
	outstring = JSON.stringify(memson);
}

let outfile = process.argv[3];
if (!outfile.endsWith('.json')) {
	outfile += '.json';
}

writeFileSync(outfile, outstring);

console.log('Parsed sucessfully. Fields "offset", "jacket" and "audio" need to be filled in manually.');
