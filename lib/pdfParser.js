const pdfParse = require('pdf-parse');

async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

module.exports = { extractTextFromPDF };
