# Memo to JSON Converter

This script converts cosmos memo files to a more usable
JSON format with sorted timestamps.

## Usage

The ready to use `index.js` can be found in the dist directory.

Make sure you have the `node runtime >=10` installed. No other dependecies are needed.

To parse a memo file to json simply navigate to the projects directory and execute following command:

```bash
node dist/index.js [path-to-memo] [outfile-name] <pretty>
```

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
