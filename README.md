# AI Fraud Detector

A minimal web application that uploads CSV files and analyzes them for fraud patterns using the Revalence API.

## Features

- Clean, mobile-friendly interface
- CSV file upload with validation
- Preview first 20 rows of data
- Secure API integration with Revalence
- Real-time analysis results

## Project Structure

```
ai-fraud-detector/
├── index.html                    # Main frontend page
├── public/
│   └── app.js                   # Frontend JavaScript
├── netlify/
│   └── functions/
│       └── analyze.js           # Netlify serverless function
├── netlify.toml                 # Netlify configuration
└── README.md                    # This file
```

## Environment Variables

You need to set these environment variables for the Revalence API integration:

- `REVALENCE_API_URL` - Your Revalence API endpoint URL
- `REVALENCE_API_KEY` - Your Revalence API authentication key

### Setting Environment Variables

**For Netlify Deployment:**
1. Go to your Netlify site dashboard
2. Navigate to Site Settings → Environment Variables
3. Add the required variables:
   - Key: `REVALENCE_API_URL`, Value: `your-api-url-here`
   - Key: `REVALENCE_API_KEY`, Value: `your-api-key-here`

**For Local Development:**
1. Install Netlify CLI: `npm install -g netlify-cli`
2. Create a `.env` file in your project root:
   ```
   REVALENCE_API_URL=your-api-url-here
   REVALENCE_API_KEY=your-api-key-here
   ```

## Local Development

1. **Install Netlify CLI** (if not already installed):
   ```bash
   npm install -g netlify-cli
   ```

2. **Clone/download the project files** and navigate to the project directory

3. **Set up environment variables** (see above)

4. **Start the development server**:
   ```bash
   netlify dev
   ```

5. **Open your browser** to `http://localhost:8888`

The Netlify CLI will automatically serve your static files and run the serverless functions locally.

## Deployment to Netlify

### Option 1: Git Integration (Recommended)

1. **Push your code to a Git repository** (GitHub, GitLab, Bitbucket)

2. **Connect to Netlify**:
   - Go to [netlify.com](https://netlify.com) and sign in
   - Click "New site from Git"
   - Choose your repository
   - Set build settings (usually auto-detected)
   - Click "Deploy site"

3. **Set environment variables** in Netlify dashboard (see above)

### Option 2: Manual Deploy

1. **Zip your project files** (or use Netlify CLI)

2. **Deploy via Netlify dashboard**:
   - Go to [netlify.com](https://netlify.com) and sign in
   - Drag and drop your project folder to deploy
   - Or use: `netlify deploy --prod`

3. **Set environment variables** in Netlify dashboard

## API Integration

The application sends CSV data to your Revalence API with this format:

**Request:**
```json
{
  "csv_text": "column1,column2,column3\nvalue1,value2,value3\n...",
  "filename": "data.csv"
}
```

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

The response from your Revalence API will be displayed to the user as JSON.

## Security Features

- CSV contents are never logged in the serverless function
- API key is securely stored in environment variables
- CORS headers are properly configured
- File type validation on the frontend

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive design
- No external dependencies (vanilla HTML/CSS/JS)

## Troubleshooting

**"Server configuration error"**
- Make sure `REVALENCE_API_URL` and `REVALENCE_API_KEY` environment variables are set

**"Method not allowed"**
- The function only accepts POST requests to `/api/analyze`

**CSV parsing issues**
- Ensure your CSV file has proper formatting
- The app handles basic CSV parsing with quoted fields

**Local development not working**
- Make sure Netlify CLI is installed: `npm install -g netlify-cli`
- Check that `.env` file is in the project root
- Verify the dev server is running on port 8888

## License

This project is open source and available under the MIT License.
