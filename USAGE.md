# Glide v2 - Usage Guide

## Quick Start

### 1. Install Dependencies

```bash
cd glide_v2
npm install
```

### 2. Build the Extension

```bash
npm run build
```

This compiles TypeScript and bundles everything into the `dist/` folder.

### 3. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `glide_v2/dist` folder
5. The Glide extension icon should appear in your toolbar

### 4. Get Gemini 3 API Key

1. Go to https://aistudio.google.com/app/apikey
2. Create a new API key (or use existing)
3. Copy the key

### 5. Configure Glide

1. Click the Glide extension icon in Chrome toolbar
2. If prompted, enter your Gemini API key
3. Click "Save Key"

---

## Using Glide

### Basic Usage (with Green Harvest Hub)

1. **Open the demo app**: Navigate to your `green-harvest-hub` app (local or deployed)
2. **Open Glide**: Click the extension icon
3. **Enter a command**: Type a natural language command like:
   - `"add farmer John Kamau from Limuru, phone 0712345678"`
   - `"record 50kg delivery from John, grade A"`
   - `"sell 30kg to Lipton at 450 per kg"`

4. **Review the plan**: Glide shows what it will do
5. **Preview (optional)**: Click "Preview" to see fields highlighted without executing
6. **Execute**: Click "Execute" to run the automation

### New Features in v2

#### Preview Mode
- Click **"Preview"** button in confirmation panel
- Fields will be highlighted on the page (yellow/orange)
- Shows warnings if any fields are missing or ambiguous
- No data is actually entered - safe to test

#### Cancel Mid-Flight
- During execution, click **"Stop"** button
- Execution stops immediately
- All highlights are cleared
- Returns to ready state

#### Multilingual UI
- Go to Settings (gear icon)
- Switch between **English** and **Swahili**
- UI text changes language
- Commands can be in English or Swahili (Gemini 3 handles both)

#### Manifest Generator (Developer Tool)
- If no manifest is found, click **"Generate Manifest"**
- Click **"Scan Page"** to detect forms and navigation
- Review the draft manifest
- Click **"Enhance with AI"** to improve semantic hints
- Click **"Download"** to save `glide.manifest.json`
- Add it to your app's `public/` folder

---

## Testing with Green Harvest Hub

1. **Start the demo app**:
   ```bash
   cd green-harvest-hub
   npm run dev
   ```

2. **Open in browser**: Usually `http://localhost:5173` (or your dev server URL)

3. **Try these commands**:
   - `"add farmer John Kamau, phone 0712345678, location Limuru"`
   - `"record 50kg delivery from John Kamau, grade A, price 85"`
   - `"process batch from John, output 42kg, grade A"`
   - `"sell 30kg to Lipton, price 450"`

4. **Test preview mode**: 
   - Enter a command
   - Click "Preview" instead of "Execute"
   - Watch fields highlight on the page

5. **Test cancellation**:
   - Start a command execution
   - Click "Stop" mid-way
   - Verify execution stops cleanly

---

## Development Workflow

### Watch Mode (Auto-rebuild)
```bash
npm run dev
```
This rebuilds automatically when you change files.

### After Making Changes
1. Stop the dev server (if running)
2. Run `npm run build`
3. Go to `chrome://extensions/`
4. Click the **reload** icon on the Glide extension card
5. Test your changes

---

## Troubleshooting

### Extension not loading
- Check that you selected the `dist/` folder (not `glide_v2/`)
- Ensure `dist/manifest.json` exists
- Check Chrome console for errors: Right-click extension icon → Inspect popup

### API key not working
- Verify key is valid at https://aistudio.google.com/app/apikey
- Check that you're using Gemini 3 models (should be automatic)
- Check browser console for API errors

### Preview not showing
- Ensure you're on a page with a manifest
- Check that fields exist on the page
- Open browser DevTools to see console errors

### Manifest generator not working
- Ensure you have an API key configured
- Check that the page has forms/navigation to scan
- Review browser console for errors

---

## File Structure

```
glide_v2/
├── dist/              # Built extension (load this in Chrome)
├── src/
│   ├── background/   # Service worker (Gemini API calls)
│   ├── content/      # Content script (page interaction)
│   ├── popup/        # Extension popup UI
│   ├── shared/       # Shared utilities
│   └── types/        # TypeScript types
├── assets/           # Icons
└── package.json      # Dependencies
```

---

## Next Steps

1. **Build**: `npm run build`
2. **Load extension**: Point Chrome to `glide_v2/dist`
3. **Set API key**: In extension popup
4. **Test**: Try commands on Green Harvest Hub
5. **Demo**: Record a video showing preview, cancel, and multilingual features!

Good luck with the hackathon! 🚀
