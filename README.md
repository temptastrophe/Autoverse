# - Autoverse -

A lightweight autoplayer [userscript](https://greasyfork.org/en/scripts/590318-autoverse) for pianoverse.net.

## Note
Not affiliated with [Pianoverse](https://github.com/charleprr). Use at your own risk.


<img width="715" height="488" alt="image" src="https://github.com/user-attachments/assets/e163170c-a26b-47cf-9231-31f914b7d755" />

## Changelog

### v3.0
- Added live theme matching: Autoverse now follows whatever theme you're using on Pianoverse and updates instantly
- Added note sustain: hold Left Shift while playing to keep notes held down longer (configurable in Settings)
- Added sheet highlighter: current token is highlighted and the sheet auto-scrolls as you play (works in both Play and Manual)
- Fixed minimize: the panel now properly collapses instead of leaving a giant empty box
- Fixed MIDI Sheet switching so the highlighter comes back after loading a MIDI file
- Removed all hotkeys (they were causing room for error)
- General UI polish and QOL fixes.

## Features

- Sheet playback with adjustable BPM
- MIDI file support (with optional octave shifting)
- Manual mode (step through with any key)
- Throttle mode for MIDI
- Transposing up/down
- Loop sheet/MIDI option
- Key repeat (for when the site is being stubborn :p)
- Sheet highlighter that shows the current token and auto-scrolls as you play :)
- Hold Left Shift to sustain notes longer
- Automatic theme matching (follows the site's built-in themes)
- Integration into the toolbar on the site
- Built-in sheets browser (vp-sheets.arijan.dev)
- Remembers your panel position, size, sheet, and settings
- Autoplayer Minimization


## Requirements
- A userscript manager (Tampermonkey recommended)
- Works on Chromium browsers and Firefox

## Installation Methods

### Install via Greasyfork

1. Get Tampermonkey through the Chrome Web Store (I'd recommend looking up a tutorial)
2. Open the Greasyfork Page [Here](https://greasyfork.org/en/scripts/590318-autoverse)
3. Click Install this Script
4. Click Install.
5. You're Good to Go!


### Install Manually

1. Get Tampermonkey
2. Create a new script and paste the code in
3. Save it and go to pianoverse.net
4. You're Good to Go!

The panel and toolbar button should show up automatically.

## How to use

- Autoverse button in the toolbar → open/close the panel
- **Play** → start/stop sheet or MIDI
- **Manual** → step through one note/group at a time
- **Throttle** → step through MIDI while keeping timing
- **Load MIDI** → pick a .mid file
- **Reset** → go back to the start
- **-1 / +1** → transpose down/up
- Hold **Left Shift** while playing to sustain notes longer

### Sheet format

q w e r t y  
[q w e] {r t y}  
[qwe] {rty} 1 2 3

### Sheet Formatting Info

`[...]` plays notes at the same time.  
`{...}` plays them with a small delay between each.

## Customizable Stuff

- BPM (only affects sheets, MIDI keeps its own tempo)
- Loop
- How many times to repeat each key
- Normal hold time
- Shift hold (sustain) time

Everything gets saved automatically.

## Troubleshooting
- Panel not showing? Make sure the script is enabled and refresh the page!
- MIDI not loading? Try a different .mid file or check the octave shift!
- Keys not registering? Increase the "repeat each key" setting!!
- Theme not matching? Just change the theme in Pianoverse settings. It should update within a second :))

## License

Apache 2.0  
© 2026 Temptastrophe

## Credits

Made by [Temptastrophe](https://www.youtube.com/@Temptastrophe)  
Sheets site: [vp-sheets.arijan.dev](https://vp-sheets.arijan.dev)
