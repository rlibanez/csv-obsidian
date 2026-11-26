# CSV Editor Obsidian Plugin
[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/deathau/csv-obsidian?style=for-the-badge&sort=semver)](https://github.com/csv-obsidian/releases/latest)
![GitHub All Releases](https://img.shields.io/github/downloads/deathau/csv-obsidian/total?style=for-the-badge)

A plugin for [Obsidian](https://obsidian.md) which allows viewing and editing of CSV files in a spreadsheet-like table format.  

**Back up your CSV files!** This plugin is very new and therefore experimental. At this stage, data loss is a very real possibility!

![Screenshot](https://github.com/deathau/csv-obsidian/raw/main/screenshot.png)

### Features
- Open (and edit) CSV files right from Obsidian!
- Auto-saving
- Per-file setting for including headers (persisted in local storage)
- Markdown editing an preview for each individual cell (internal links aren't working correctly, yet)
- Sort the data by clicking on a column name
- Filter by column values
- Freeze columns
- Insert new columns/rows

## Installation

### From GitHub
- Download the latest master
- Extract the files from the zip to your vault's plugins folder: `<vault>/.obsidian/plugins/ini-obsidian`  
Note: On some machines the `.obsidian` folder may be hidden. On MacOS you should be able to press `Command+Shift+Dot` to show the folder in Finder.
- Reload Obsidian
- If prompted about Safe Mode, you can disable safe mode and enable the plugin.
Otherwise head to Settings, third-party plugins, make sure safe mode is off and
enable the plugin from there.

## Development

This project uses Typescript to provide type checking and documentation.  
The repo depends on the latest [plugin API](https://github.com/obsidianmd/obsidian-api) in Typescript Definition format, which contains TSDoc comments describing what it does.

**Note:** The Obsidian API is still in early alpha and is subject to change at any time!

If you want to contribute to development and/or just customize it with your own
tweaks, you can do the following:
- Clone this repo.
- Use Node.js 22 or newer.
- `npm ci --ignore-scripts` to install the exact dependencies from `package-lock.json`
- `npm run typecheck` and `npm test` to check types and run regression tests.
- `npm run build` to generate `main.js` and `styles.css` in the project root.
- `npm audit` to check the dependency tree for known vulnerabilities.
- Copy `manifest.json`, `main.js` and `styles.css` to a subfolder of your plugins
folder (e.g, `<vault>/.obsidian/plugins/<plugin-name>/`)
- Reload obsidian to see changes

Alternately, you can clone the repo directly into your plugins folder and once
dependencies are installed use `npm run dev` to start compilation in watch mode.  
You may have to reload obsidian (`ctrl+R`) to see changes.

## Pricing
Huh? This is an open-source plugin I made *for fun*. It's completely free.
However, if you absolutely *have* to send me money because you like it that
much, feel free to throw some coins in my hat via
[PayPal](https://paypal.me/deathau) or sponsor me via
[GitHub Sponsors](https://github.com/sponsors/deathau)

# Version History
## 0.0.1
Initial release of csv-obsidian! See [Features](#Features) above

## Dependency maintenance

The lockfile is committed so local builds and CI use the same dependency versions.
Installation lifecycle scripts are not required to build the plugin.

Styles are compiled with Dart Sass's modern API through the Rollup configuration;
`node-sass` and the legacy Sass adapter are no longer used. Watch mode also tracks
stylesheets loaded by Sass.

Handsontable is kept on 16.2 to preserve the existing PersistentState integration.
The scoped npm override selects Moment 2.31.0 instead of Handsontable's pinned
2.30.1 to address GHSA-4p3w-j4w9-5jqw. Remove that override once the selected
Handsontable version uses a patched Moment release. This does not change
Handsontable's existing license requirements.
