# Free API Setup for Price Search

## Google Shopping API (RapidAPI)

### Step 1: Registration

1. Go to [RapidAPI.com](https://rapidapi.com)
2. Register (free)
3. Find "Google Shopping Data API"

### Step 2: Get API Key

1. Subscribe to free plan (100 requests per month)
2. Copy your API key from "Headers" section

### Step 3: Setup in Application

1. Open file `public/price-checker.js`
2. Find line: `'X-RapidAPI-Key': 'YOUR_FREE_API_KEY'`
3. Replace `YOUR_FREE_API_KEY` with your real key

### Example:

```javascript
'X-RapidAPI-Key': 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz'
```

## Alternative APIs

### 1. SerpAPI (Google Shopping)

- **Free**: 100 requests per month
- **Link**: [serpapi.com](https://serpapi.com)
- **Easier setup**, but fewer requests

### 2. ScrapingBee

- **Free**: 1000 requests per month
- **Link**: [scrapingbee.com](https://scrapingbee.com)
- **Universal** web scraping API

### 3. PriceAPI

- **Free**: 100 requests per month
- **Link**: [priceapi.com](https://priceapi.com)
- **Specialized** for prices

## API Advantages Over Scraping

✅ **More accurate results**  
✅ **Fewer blocks**  
✅ **Faster operation**  
✅ **More stable**  
✅ **Less server load**

## What to do if API is unavailable

The app will automatically switch to regular web scraping if the API doesn't work or free requests are exhausted.
