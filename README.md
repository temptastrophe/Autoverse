# Autoverse v2.3.0

A lightweight autoplayer [userscript](https://greasyfork.org/en/scripts/590318-autoverse) for pianoverse.net.

## Note
Not affiliated with [Pianoverse](https://github.com/charleprr). Use at your own risk.


<img width="715" height="488" alt="image" src="https://github.com/user-attachments/assets/e163170c-a26b-47cf-9231-31f914b7d755" />

## Features

- Sheet playback with adjustable BPM
- MIDI file support (with optional octave shifting)
- Manual mode (step through with any key)
- Throttle mode for MIDI
- Transposing up/down
- Loop sheet/MIDI option
- Key repeat (for when the site is being stubborn :p)
- Hotkeys (Non-Customizable as of right now, sadly.)
- Integrated into the toolbar on the site.
- Built-in sheets browser (vp-sheets.arijan.dev)
- Remembers your panel position, size, sheet, and settings

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

- **F8** or the Autoverse button in the toolbar → open/close the panel
- **Play** button or `-` → start/stop
- **Manual** button or `=` → step through one note/group at a time
- **Throttle** button or `Home` → step through MIDI while keeping timing
- **Load MIDI** or `]` → pick a .mid file
- **Reset** or `'` → go back to the start
- `.` and `,` → transpose up/down

### Sheet format

q w e r t y
[q w e] {r t y}
[qwe] {rty} 1 2 3

### Sheet Formatting Info

`[...]` plays notes at the same time.  
`{...}` plays them with a small delay between each.


## Hotkeys

  Key     | What it does          
|---------|-----------------------|
  "F8"    | Toggle the panel      
  "-"     | Play / Stop           
  "="     | Manual mode           
"Home"    | Throttle mode         
  "]"     | Load MIDI             
  "'"     | Reset                 
  "."     | Transpose +1          
  ","     | Transpose -1          

## Customizable Stuff

- BPM (only affects sheets, MIDI keeps its own tempo)
- Loop
- How many times to repeat each key (lags you a lot with a lower-quality PC)

Everything gets saved automatically. (Sheets, MIDI, etc.)

## Troubleshooting
- Panel not showing? Make sure the script is enabled and refresh the page!
- MIDI not loading? Try a different .mid file or check the octave shift!
- Keys not registering? Increase the "repeat each key" setting!! 

## License

Apache 2.0  
© 2026 Temptastrophe

## Credits

Made by [Temptastrophe](https://www.youtube.com/@Temptastrophe)  
Sheets site: [vp-sheets.arijan.dev](https://vp-sheets.arijan.dev)
