# Memo to JSON Converter

This script converts cosmos memo files to a more usable
JSON format with sorted timestamps.

For documentation on the file format see `src/memson.ts`.

## Usage

The ready to use `index.js` can be found in the dist directory.

Make sure you have the `node runtime >=10` installed. No other dependecies are needed.

To parse a memo file to json simply navigate to the projects directory and execute following command:

```bash
node dist/index.js [path-to-memo-or-dir] <pretty>
```

The path can either be a single file or a directory containing memo files.
File names should be in the following format.

`some_name_(bsc|adv|ext).(memo|txt)`

Example file names:

```text
awesome_song_adv.memo
another_cool_song.txt
```

Output file name is the input file name with a `.json` ending and the difficulty reference removed. So for an input of `awesome_song_adv.memo` and output file with the name `awesome_song.json` will be created.

If a json file with the correct name for the same song already exists, then the chart information for another difficulty will be appended.

E.g. `awesome_song.json` already exists and contains the `adv` chart. If `awesome_song_ext.memo` is parsed after that, then the `ext` chart data will be appended to `awesome_song.json`.

The option `pretty` is optional and takes either `true` or `false` as input. If set to `true` it will stringify the JSON in a more readable way but this takes up more file space.

## Notes on memo format

This script is a bit hacky, so please make sure that you copy the
memo like it is displayed at cosmos. Make sure that your file does not contain any leading or trailing whitespaces or newlines.

Example file:

```text
Another Phase
TAG

EXTREME

Level: 9
BPM: 160
Notes: 693

1
口口口口 |－－－－|
口口口口 |－－－－|
口口口口 |－－－－|
口口口口 |－－－－|
...
```

There should be a blank line between the artist and the difficulty
category. And also one between the category and the other metadata.
The last blank line separates the metadata from the note data.
There shouldn't be any blank lines after that.

In case anyone would ever need a more stable parser then let me know.
