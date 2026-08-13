# 🎹 Autoverse

A lightweight autoplayer [userscript](https://greasyfork.org/en/scripts/590318-autoverse) for **[Pianoverse](https://pianoverse.net/)**.  

<img width="715" height="488" alt="image" src="https://github.com/user-attachments/assets/e163170c-a26b-47cf-9231-31f914b7d755" />

## Changelog

### v3.0
- Added live theme matching. Autoverse now follows whatever theme you're using on Pianoverse and updates instantly
- Added note sustain. Hold Left Shift while playing to keep notes held down longer (configurable in Settings!)
- Added sheet highlighter. The current token is highlighted and the sheet auto-scrolls as you play (works in both Play and Manual!)
- Fixed minimize. The panel now properly collapses instead of leaving a giant empty box
- Fixed MIDI to sheet switching so the highlighter comes back after loading a MIDI file
- Removed all hotkeys (they were causing room for error)
- General UI polish and QOL fixes

## Features

- Sheet playback with adjustable BPM
- MIDI file support (with optional octave shifting)
- Manual mode (step through with any key)
- Throttle mode for MIDI
- Transposing up/down
- Loop sheet/MIDI option
- Key repeat (for when the site is being stubborn :p)
- Sheet highlighter that shows the current token and auto-scrolls as you play
- Hold Left Shift to sustain notes longer
- Automatic theme matching (follows the site's built-in themes)
- Integration into the toolbar on the site
- Built-in sheets browser [site](https://vp-sheets.arijan.dev)
- Remembers your panel position, size, sheet, and settings
- Proper panel minimization

> [!NOTE]
> Everything gets saved automatically. Your sheet, BPM, loop setting, panel size, and positions!
> I'd personally recommend checking it every time you boot up Autoverse, to make sure everything is correct!

## Requirements

- **Tampermonkey** (or another userscript manager)

  - Chrome / Edge: [Chrome Web Store](https://chrome.google.com/webstore)
  
  - Firefox: [Firefox Add-ons](https://addons.mozilla.org)
  
- Works on Chromium browsers and Firefox

## Installation

### Option 1 - Greasyfork (recommended)

1. Install Tampermonkey
2. Go to the [Greasyfork page](https://greasyfork.org/en/scripts/590318-autoverse)
3. Click **Install this script**
4. Confirm the install
5. Open [pianoverse.net](https://pianoverse.net). The panel and toolbar button should appear automatically

### Option 2 - Manual install

1. Install Tampermonkey
2. Create a new script
3. Paste the full Autoverse code
4. Save and open pianoverse.net

## How to use

- **Toolbar button** → open / close the panel
- **Play** → start / stop sheet or MIDI
- **Manual** → step through one note / group at a time
- **Throttle** → step through MIDI while keeping timing
- **Load MIDI** → pick a `.mid` file
- **Reset** → go back to the start
- **-1 / +1** → transpose down / up
- Hold **Left Shift** while playing to sustain notes longer

## Customizable Settings

- BPM (only affects sheets, MIDI keeps its own tempo)
- Loop
- How many times to repeat each key
- Normal hold time
- Shift hold (sustain) time

## Troubleshooting

- **Panel not showing?** Make sure the script is enabled and refresh the page
- **MIDI not loading?** Try a different `.mid` file or adjust the octave shift
- **Keys not registering?** Increase the "repeat each key" setting
- **Theme not matching?** Just change the theme in Pianoverse settings. It should update within a second

> [!CAUTION]
> This is an **unofficial userscript** for Pianoverse.  
> Use it at your own risk and make sure it complies with Pianoverse’s terms of use.  
> Behavior may change if Pianoverse updates its interface.

> [!TIP]
> If you run into a problem or just wanna say hello, you can find me on YouTube or Discord:

> **[My Youtube](https://www.youtube.com/@Temptastrophe)**

> **[My Discord](https://www.discord.com/users/1104219443581681695)**

## License

Apache 2.0  
© 2026 Temptastrophe

## Credits

Made by [Temptastrophe](https://www.youtube.com/@Temptastrophe)  
Sheets site: [vp-sheets.arijan.dev](https://vp-sheets.arijan.dev)
