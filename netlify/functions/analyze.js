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
    const apiUrl = process.env.REVALENCE_API_URL;
    const apiKey = process.env.REVALENCE_API_KEY;

    if (!apiUrl || !apiKey) {
      console.error('Missing environment variables: REVALENCE_API_URL or REVALENCE_API_KEY');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
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
      console.error(`Revalence API error: ${response.status} ${response.statusText}`, errorText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `API request failed: ${response.status} ${response.statusText}` 
        })
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
