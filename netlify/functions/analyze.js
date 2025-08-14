// netlify/functions/analyze.js
exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const { csvText, filename } = JSON.parse(event.body);

    if (!csvText || !filename) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing csvText or filename' })
      };
    }

    // Get environment variables
    let apiUrl = process.env.REVALENCE_API_URL;
    const apiKey = process.env.REVALENCE_API_KEY;

    if (!apiUrl || !apiKey) {
      console.error('Missing environment variables: REVALENCE_API_URL or REVALENCE_API_KEY');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Ensure API URL has proper endpoint path
    // If the URL doesn't end with an endpoint, add a default one
    if (!apiUrl.includes('/api/') && !apiUrl.includes('/v1/') && !apiUrl.includes('/analyze')) {
      // Remove trailing slash if present
      apiUrl = apiUrl.replace(/\/$/, '');
      // Add common endpoint paths - you may need to adjust this
      apiUrl += '/api/analyze';
      console.log(`Adjusted API URL to: ${apiUrl}`);
    }

    console.log(`Processing file: ${filename} (${csvText.length} characters)`);

    // Make request to Revalence API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        csv_text: csvText,
        filename: filename
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Revalence API error: ${response.status} ${response.statusText}`);
      console.error(`Request URL: ${apiUrl}`);
      console.error(`Response: ${errorText.substring(0, 200)}`);
      
      let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
      
      if (response.status === 404) {
        errorMessage += '. Check if REVALENCE_API_URL includes the correct endpoint path (e.g., /api/analyze, /v1/fraud, etc.)';
      }
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: errorMessage })
      };
    }

    // Get response from Revalence API
    const result = await response.json();
    
    console.log('Analysis completed successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error: ' + error.message 
      })
    };
  }
};
