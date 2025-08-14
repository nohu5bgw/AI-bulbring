// public/app.js
document.addEventListener('DOMContentLoaded', function() {
    const csvFileInput = document.getElementById('csvFile');
    const fileInfo = document.getElementById('fileInfo');
    const previewContainer = document.getElementById('previewContainer');
    const previewTable = document.getElementById('previewTable');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    const error = document.getElementById('error');
    
    let csvData = null;
    let filename = null;

    // File input handler
    csvFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showError('Please select a valid CSV file.');
            return;
        }

        filename = file.name;
        fileInfo.textContent = `Selected: ${filename} (${formatFileSize(file.size)})`;
        fileInfo.style.display = 'block';

        // Read and preview file
        const reader = new FileReader();
        reader.onload = function(e) {
            csvData = e.target.result;
            previewCSV(csvData);
            analyzeBtn.style.display = 'block';
        };
        reader.readAsText(file);
    });

    // Analyze button handler
    analyzeBtn.addEventListener('click', function() {
        if (!csvData || !filename) {
            showError('Please select a CSV file first.');
            return;
        }

        analyzeData();
    });

    function previewCSV(csvText) {
        try {
            const lines = csvText.split('\n').filter(line => line.trim());
            const previewLines = lines.slice(0, 21); // Header + 20 rows
            
            if (previewLines.length === 0) {
                showError('CSV file appears to be empty.');
                return;
            }

            // Parse CSV (simple parsing - handles basic cases)
            const rows = previewLines.map(line => parseCSVLine(line));
            
            // Create table
            const table = document.createElement('table');
            table.className = 'preview-table';
            
            // Add header
            if (rows.length > 0) {
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                rows[0].forEach(cell => {
                    const th = document.createElement('th');
                    th.textContent = cell || '';
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);
            }
            
            // Add data rows
            if (rows.length > 1) {
                const tbody = document.createElement('tbody');
                for (let i = 1; i < Math.min(rows.length, 21); i++) {
                    const tr = document.createElement('tr');
                    rows[i].forEach(cell => {
                        const td = document.createElement('td');
                        td.textContent = cell || '';
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                }
                table.appendChild(tbody);
            }
            
            // Update preview
            previewTable.innerHTML = '';
            previewTable.appendChild(table);
            previewContainer.style.display = 'block';
            
        } catch (err) {
            showError('Error parsing CSV file: ' + err.message);
        }
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    async function analyzeData() {
        try {
            hideMessages();
            loading.style.display = 'block';
            analyzeBtn.disabled = true;

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    csvText: csvData,
                    filename: filename
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const result = await response.json();
            showResults(result);

        } catch (err) {
            showError('Analysis failed: ' + err.message);
        } finally {
            loading.style.display = 'none';
            analyzeBtn.disabled = false;
        }
    }

    function showResults(result) {
        hideMessages();
        
        // Format results for display
        let html = '<h3>Fraud Analysis Results</h3>';
        
        if (typeof result === 'object') {
            html += '<pre style="background: white; padding: 15px; border-radius: 6px; overflow-x: auto;">';
            html += JSON.stringify(result, null, 2);
            html += '</pre>';
        } else {
            html += '<p>' + String(result) + '</p>';
        }
        
        results.innerHTML = html;
        results.style.display = 'block';
    }

    function showError(message) {
        hideMessages();
        error.textContent = message;
        error.style.display = 'block';
    }

    function hideMessages() {
        results.style.display = 'none';
        error.style.display = 'none';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});
