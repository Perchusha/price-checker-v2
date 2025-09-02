# Price Checker - Product Price Monitoring

Modern cross-platform application for monitoring product prices in online stores with price drop notifications.

## Features

- ✅ **Modern Interface** - React + TypeScript + Tailwind CSS
- ✅ **Cross-platform** - Windows, macOS, Linux
- ✅ **Add products** for tracking
- ✅ **Automatic price checking** every hour
- ✅ **Notifications** for found deals
- ✅ **System tray operation** - doesn't interfere with work
- ✅ **Price history** - local storage
- ✅ **Beautiful icons** - react-icons

## Installation

1. Make sure you have Node.js 16+ and npm installed
2. Install dependencies:

```bash
npm install
```

## Running

### Development Mode

```bash
npm run electron-dev
```

### Build Application

```bash
npm run electron-pack
```

## Usage

1. **Adding a product:**

   - Enter product name (e.g., "RODE-NT+")
   - Specify target price in PLN
   - Optionally add URL of specific site
   - Click "Add Product"

2. **Monitoring:**

   - App automatically checks prices every hour
   - When product found at target price or below - notification appears
   - App works in background in system tray

3. **Management:**
   - Right-click tray icon for menu access
   - "Show" - open main window
   - "Hide" - minimize to tray
   - "Exit" - close application

## Features

- App uses Google Shopping search for price finding
- All data saved in local JSON files
- Price change history supported
- Cross-platform (Windows, macOS, Linux)

## Project Structure

```
PriceChecker/
├── src/                    # React application
│   ├── components/         # React components
│   ├── types/             # TypeScript types
│   └── index.css          # Tailwind CSS styles
├── public/                # Electron files
│   ├── electron.js        # Electron main process
│   ├── price-checker.js   # Price monitoring logic
│   └── icon.png          # App icon
├── package.json           # Node.js dependencies
├── tailwind.config.js     # Tailwind configuration
└── README.md             # Documentation
```

## Technical Details

- **Frontend:** React + TypeScript + Tailwind CSS
- **Desktop:** Electron
- **Data Storage:** Local JSON files
- **Web Scraping:** Node.js http/https + regex
- **Notifications:** node-notifier
- **Icons:** react-icons
- **System Tray:** Electron Tray API

## Notes

- App works in background and doesn't interfere with other programs
- Internet connection required for proper operation
- Prices searched in Polish zloty (PLN)
- Check interval can be changed in code (default 1 hour)
