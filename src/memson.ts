export type DifficultyCategory = 'basic' | 'advanced' | 'extreme';

/** Jubeat memo in json format */
export interface Memson {
	/** Song title */
	title: string;
	/** Song's artist */
	artist: string;
	/** Just used for display purposes since timing is encoded in notes */
	bpm: number;
	/** Local path to audio file (relative to this files directory) */
	audio: string;
	/** Local path to jacket (relative to this files directory) */
	jacket: string;
	/** Audio outset in ms */
	offset: number;
	/** 
	 * Object of charts where key is difficulty name and value is the chart itself
	 * 
	 * Usually a memo file contains only one chart
	 * but it makes sense to just store all charts in one file
	 */
	charts: {
		[index in DifficultyCategory]?: Chart
	};
}

export interface Chart {
	/** Chart's difficulty (e.g. 8 or 10.2) */
	difficulty: number;
	/**
	 * Number of normal notes.
	 * 
	 * For total note count like arcade: noteCount + 2 * holdCount
	 */
	noteCount: number;
	/** Number of hold notes */
	holdCount: number
	/** Timing data for notes and holds */
	ticks: Tick[];
}

export interface Tick {
	/** Timestamp in milliseconds when button needs to be pressed */
	time: number;
	/**
	 * Array of note indices which need to be pressed at current time.
	 * 
	 * e.g. [3, 10] -> button 3 and 10 need to be pressed.
	 * 
	 * This file format indexes buttons starting from 0 to 15
	 * ```
	 * 0  1  2  3
	 * 4  5  6  7
	 * 8  9  10 11
	 * 12 13 14 15
	 * ```
	 */
	notes?: number[];
	/** List of timing data for holds */
	holds?: Hold[];
}

export interface Hold {
	/** Index the hold starts on (see notes in Tick interface) */
	from: number;
	/** Index the hold ends on (see notes in Tick interface) */
	to: number;
	/**
	 * Timestamp in milliseconds when to release the note.
	 * 
	 * There is no need to search for the hold end
	 * and animation duration can be calculated really easily
	 */
	releaseOn: number;
}