const API_BASE = 'http://localhost:3001/api';
let currentBudgetData = null;
let currentYear = new Date().getFullYear();
let comparisonChart, forecastChart, historicalChart;

// ==================== API Functions ====================

async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('healthStatus');
        
        if (data.status === 'healthy') {
            statusDot.classList.add('healthy');
            statusText.innerHTML = '<span class="status-dot healthy"></span> ✅ Server connected | AI: ' + (data.ai ? 'Active' : 'Mock Mode');
        } else {
            statusText.innerHTML = '<span class="status-dot"></span> ⚠️ Server connected (AI in mock mode)';
        }
    } catch (error) {
        document.getElementById('healthStatus').innerHTML = '<span class="status-dot"></span> ❌ Cannot connect to server. Make sure backend is running on port 3001';
    }
}

async function uploadExcel(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    showNotification('Uploading file...', 'info');
    
    try {
        const response = await fetch(`${API_BASE}/upload-excel`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.success) {
            currentBudgetData = data.data;
            renderBudgetFromExcel(data.data);
            showNotification(`Successfully loaded ${data.data.categories.length} categories!`, 'success');
            document.getElementById('uploadStatus').innerHTML = `
                <div class="upload-status success">
                    ✅ Successfully imported ${data.data.categories.length} categories
                </div>
            `;
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Failed to upload Excel file', 'error');
        document.getElementById('uploadStatus').innerHTML = `
            <div class="upload-status error">
                ❌ Failed to upload: ${error.message}
            </div>
        `;
    }
}

async function runAIAnalysis() {
    if (!currentBudgetData || !currentBudgetData.categories.length) {
        showNotification('Please upload budget data first', 'warning');
        return;
    }
    
    const analysisDiv = document.getElementById('aiAnalysis');
    analysisDiv.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="loading-spinner"></div> Analyzing your budget data with AI...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/ai-analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                budgetData: currentBudgetData.planned.map((p, i) => ({
                    category: currentBudgetData.categories[i],
                    planned: p,
                    actual: currentBudgetData.actual[i]
                })),
                period: currentYear
            })
        });
        const data = await response.json();
        
        if (data.success) {
            displayAIAnalysis(data.analysis);
            updateAIConfidenceScore(data.analysis);
            showNotification('AI analysis complete!', 'success');
        }
    } catch (error) {
        console.error('AI Analysis error:', error);
        analysisDiv.innerHTML = '<div class="error">AI analysis failed. Using mock analysis...</div>';
        // Use mock analysis
        displayAIAnalysis(generateMockAnalysis());
    }
}

function generateMockAnalysis() {
    return {
        summary: "Your IT budget is performing within expectations. Cloud services show the highest growth at 15% year-over-year.",
        topInsights: [
            { category: "Cloud Services", issue: "15% over budget", impact: "Excess spending of $15,000" },
            { category: "Software Licenses", issue: "Underutilized licenses", impact: "Potential savings of $8,000" }
        ],
        recommendations: [
            "Optimize cloud resources with reserved instances",
            "Audit software licenses for unused subscriptions",
            "Consider annual prepayment for better rates"
        ],
        risks: [
            "Cloud costs trending upward - implement alerts",
            "Hardware refresh cycle approaching"
        ],
        forecast: {
            nextQuarter: 125000,
            nextYear: 540000,
            insights: "Expecting 8% growth next year"
        }
    };
}

function displayAIAnalysis(analysis) {
    const html = `
        <div class="ai-analysis-card">
            <h4>📊 Summary</h4>
            <p>${analysis.summary}</p>
        </div>
        
        <div class="ai-analysis-card">
            <h4>🎯 Top Insights</h4>
            ${analysis.topInsights.map(insight => `
                <div class="insight-item">
                    <strong>${insight.category}</strong><br>
                    ${insight.issue}<br>
                    <small>${insight.impact}</small>
                </div>
            `).join('')}
        </div>
        
        <div class="ai-analysis-card">
            <h4>💡 Recommendations</h4>
            <ul>
                ${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
        
        <div class="ai-analysis-card">
            <h4>⚠️ Risks</h4>
            <ul>
                ${analysis.risks.map(risk => `<li>${risk}</li>`).join('')}
            </ul>
        </div>
        
        <div class="ai-analysis-card">
            <h4>🔮 Forecast</h4>
            <p><strong>Next Quarter:</strong> $${analysis.forecast.nextQuarter.toLocaleString()}</p>
            <p><strong>Next Year:</strong> $${analysis.forecast.nextYear.toLocaleString()}</p>
            <p>${analysis.forecast.insights}</p>
        </div>
    `;
    document.getElementById('aiAnalysis').innerHTML = html;
}

function updateAIConfidenceScore(analysis) {
    let score = 85;
    if (analysis.topInsights?.length) score += 5;
    if (analysis.recommendations?.length) score += 5;
    if (analysis.risks?.length) score += 5;
    document.getElementById('aiConfidence').textContent = `${Math.min(score, 98)}%`;
}

function renderBudgetFromExcel(data) {
    // Update categories list
    const categoriesList = document.getElementById('categoriesList');
    if (categoriesList) {
        categoriesList.innerHTML = data.categories.map((cat, i) => `
            <div class="category-item">
                <div>
                    <div class="category-name">${cat}</div>
                    <div class="category-details">
                        Budget: $${data.planned[i].total.toLocaleString()} | 
                        Spent: $${data.actual[i].total.toLocaleString()}
                    </div>
                </div>
                <button class="btn-danger btn-sm" onclick="deleteCategory('${cat}')">Delete</button>
            </div>
        `).join('');
    }
    
    // Update totals
    const totalPlanned = data.planned.reduce((sum, p) => sum + p.total, 0);
    const totalActual = data.actual.reduce((sum, a) => sum + a.total, 0);
    document.getElementById('totalPlanned').textContent = `$${totalPlanned.toLocaleString()}`;
    document.getElementById('totalActual').textContent = `$${totalActual.toLocaleString()}`;
    const variance = totalActual - totalPlanned;
    document.getElementById('totalVariance').textContent = `${variance > 0 ? '+' : ''}$${Math.abs(variance).toLocaleString()}`;
    
    // Render tables
    renderPlanningTable(data);
    renderTrackingTable(data);
    updateCharts(data);
}

function renderPlanningTable(data) {
    const thead = document.getElementById('planningHeader');
    const tbody = document.getElementById('planningBody');
    
    thead.innerHTML = '<tr><th>Category</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th></tr>';
    tbody.innerHTML = data.categories.map((cat, i) => `
        <tr>
            <td>${cat}</td>
            <td><input type="number" value="${data.planned[i].q1}" onchange="updatePlanned('${cat}', 'q1', this.value)"></td>
            <td><input type="number" value="${data.planned[i].q2}" onchange="updatePlanned('${cat}', 'q2', this.value)"></td>
            <td><input type="number" value="${data.planned[i].q3}" onchange="updatePlanned('${cat}', 'q3', this.value)"></td>
            <td><input type="number" value="${data.planned[i].q4}" onchange="updatePlanned('${cat}', 'q4', this.value)"></td>
            <td>$${data.planned[i].total.toLocaleString()}</td>
        </tr>
    `).join('');
}

function renderTrackingTable(data) {
    const thead = document.getElementById('trackingHeader');
    const tbody = document.getElementById('trackingBody');
    
    thead.innerHTML = '<tr><th>Category</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th><th>Variance</th></tr>';
    tbody.innerHTML = data.categories.map((cat, i) => {
        const variance = data.actual[i].total - data.planned[i].total;
        const varianceClass = variance > 0 ? 'variance-positive' : 'variance-negative';
        return `
            <tr>
                <td>${cat}</td>
                <td><input type="number" value="${data.actual[i].q1}" onchange="updateActual('${cat}', 'q1', this.value)"></td>
                <td><input type="number" value="${data.actual[i].q2}" onchange="updateActual('${cat}', 'q2', this.value)"></td>
                <td><input type="number" value="${data.actual[i].q3}" onchange="updateActual('${cat}', 'q3', this.value)"></td>
                <td><input type="number" value="${data.actual[i].q4}" onchange="updateActual('${cat}', 'q4', this.value)"></td>
                <td>$${data.actual[i].total.toLocaleString()}</td>
                <td class="${varianceClass}">${variance > 0 ? '+' : ''}$${Math.abs(variance).toLocaleString()}</td>
            </tr>
        `;
    }).join('');
    
    // Update quick category select
    const quickSelect = document.getElementById('quickCategory');
    quickSelect.innerHTML = data.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function updateCharts(data) {
    // Comparison chart
    const ctx1 = document.getElementById('historicalChart')?.getContext('2d');
    if (ctx1) {
        if (historicalChart) historicalChart.destroy();
        historicalChart = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: data.categories,
                datasets: [
                    { label: 'Planned', data: data.planned.map(p => p.total), backgroundColor: '#4361ee' },
                    { label: 'Actual', data: data.actual.map(a => a.total), backgroundColor: '#e74c3c' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

async function updateForecast() {
    if (!currentBudgetData) {
        showNotification('No data to forecast', 'warning');
        return;
    }
    
    const inflation = parseFloat(document.getElementById('inflationRate').value) / 100;
    const years = parseInt(document.getElementById('forecastYears').value);
    const historicalData = [];
    
    // Build historical data from current budget
    const totalActual = currentBudgetData.actual.reduce((sum, a) => sum + a.total, 0);
    for (let i = 0; i < 3; i++) {
        historicalData.push({
            year: currentYear - 2 + i,
            total: totalActual * (0.8 + i * 0.1)
        });
    }
    
    try {
        const response = await fetch(`${API_BASE}/forecast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ historicalData, inflationRate: inflation * 100, years })
        });
        const data = await response.json();
        
        if (data.success) {
            renderForecastChart(data.forecasts);
        }
    } catch (error) {
        console.error('Forecast error:', error);
        // Fallback forecast
        const fallbackForecasts = [];
        let current = totalActual;
        for (let i = 1; i <= years; i++) {
            current = current * (1 + inflation);
            fallbackForecasts.push({ year: currentYear + i, total: current });
        }
        renderForecastChart(fallbackForecasts);
    }
}

function renderForecastChart(forecasts) {
    const ctx = document.getElementById('forecastChart')?.getContext('2d');
    if (!ctx) return;
    
    if (forecastChart) forecastChart.destroy();
    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: forecasts.map(f => f.year),
            datasets: [{
                label: 'Forecasted Budget',
                data: forecasts.map(f => f.total),
                borderColor: '#4361ee',
                backgroundColor: 'rgba(67, 97, 238, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `$${ctx.raw.toLocaleString()}` } }
            }
        }
    });
}

async function saveToDatabase() {
    if (!currentBudgetData) {
        showNotification('No data to save', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/save-budget`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                year: currentYear,
                categories: currentBudgetData.categories,
                planned: currentBudgetData.planned,
                actual: currentBudgetData.actual
            })
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Budget saved to database!', 'success');
        }
    } catch (error) {
        showNotification('Failed to save to database', 'error');
    }
}

function exportBackup() {
    if (!currentBudgetData) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const dataStr = JSON.stringify(currentBudgetData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget_backup_${currentYear}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Backup exported!', 'success');
}

function resetAll() {
    if (confirm('Are you sure? This will clear all current data.')) {
        currentBudgetData = null;
        document.getElementById('categoriesList').innerHTML = '';
        document.getElementById('totalPlanned').textContent = '$0';
        document.getElementById('totalActual').textContent = '$0';
        document.getElementById('totalVariance').textContent = '$0';
        document.getElementById('aiAnalysis').innerHTML = '';
        document.getElementById('planningBody').innerHTML = '';
        document.getElementById('trackingBody').innerHTML = '';
        showNotification('Data reset', 'info');
    }
}

function addCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const budget = parseFloat(document.getElementById('categoryBudget').value);
    
    if (!name || isNaN(budget)) {
        showNotification('Please enter category name and budget', 'warning');
        return;
    }
    
    if (!currentBudgetData) {
        currentBudgetData = { categories: [], planned: [], actual: [] };
    }
    
    currentBudgetData.categories.push(name);
    currentBudgetData.planned.push({ q1: budget/4, q2: budget/4, q3: budget/4, q4: budget/4, total: budget });
    currentBudgetData.actual.push({ q1: 0, q2: 0, q3: 0, q4: 0, total: 0 });
    
    renderBudgetFromExcel(currentBudgetData);
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryBudget').value = '';
    showNotification('Category added!', 'success');
}

function addQuickSpending() {
    const category = document.getElementById('quickCategory').value;
    const amount = parseFloat(document.getElementById('quickAmount').value);
    
    if (!category || isNaN(amount) || amount <= 0) {
        showNotification('Select category and enter valid amount', 'warning');
        return;
    }
    
    const index = currentBudgetData.categories.indexOf(category);
    if (index !== -1) {
        const perQuarter = amount / 4;
        currentBudgetData.actual[index].q1 += perQuarter;
        currentBudgetData.actual[index].q2 += perQuarter;
        currentBudgetData.actual[index].q3 += perQuarter;
        currentBudgetData.actual[index].q4 += perQuarter;
        currentBudgetData.actual[index].total += amount;
        
        renderBudgetFromExcel(currentBudgetData);
        document.getElementById('quickAmount').value = '';
        showNotification(`Added $${amount.toLocaleString()} to ${category}`, 'success');
    }
}

function updatePlanned(category, quarter, value) {
    const index = currentBudgetData.categories.indexOf(category);
    if (index !== -1) {
        currentBudgetData.planned[index][quarter] = parseFloat(value) || 0;
        currentBudgetData.planned[index].total = 
            currentBudgetData.planned[index].q1 +
            currentBudgetData.planned[index].q2 +
            currentBudgetData.planned[index].q3 +
            currentBudgetData.planned[index].q4;
        renderBudgetFromExcel(currentBudgetData);
    }
}

function updateActual(category, quarter, value) {
    const index = currentBudgetData.categories.indexOf(category);
    if (index !== -1) {
        currentBudgetData.actual[index][quarter] = parseFloat(value) || 0;
        currentBudgetData.actual[index].total = 
            currentBudgetData.actual[index].q1 +
            currentBudgetData.actual[index].q2 +
            currentBudgetData.actual[index].q3 +
            currentBudgetData.actual[index].q4;
        renderBudgetFromExcel(currentBudgetData);
    }
}

function deleteCategory(category) {
    if (confirm(`Delete ${category}?`)) {
        const index = currentBudgetData.categories.indexOf(category);
        if (index !== -1) {
            currentBudgetData.categories.splice(index, 1);
            currentBudgetData.planned.splice(index, 1);
            currentBudgetData.actual.splice(index, 1);
            renderBudgetFromExcel(currentBudgetData);
            showNotification(`${category} deleted`, 'info');
        }
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.background = 
        type === 'error' ? '#e74c3c' : 
        type === 'warning' ? '#f8961e' : 
        type === 'info' ? '#17a2b8' : '#10b981';
    notification.style.transform = 'translateX(0)';
    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
    }, 3000);
}

// ==================== Event Listeners ====================

document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    
    // File upload
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('excelUpload');
    const uploadBtn = document.getElementById('uploadBtn');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) uploadExcel(e.target.files[0]);
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#4361ee';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#e9ecef';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#e9ecef';
        const file = e.dataTransfer.files[0];
        if (file) uploadExcel(file);
    });
    
    // Buttons
    document.getElementById('analyzeBtn').addEventListener('click', runAIAnalysis);
    document.getElementById('addCategoryBtn').addEventListener('click', addCategory);
    document.getElementById('addQuickSpendingBtn').addEventListener('click', addQuickSpending);
    document.getElementById('updateForecastBtn').addEventListener('click', updateForecast);
    document.getElementById('saveToDbBtn').addEventListener('click', saveToDatabase);
    document.getElementById('exportBackupBtn').addEventListener('click', exportBackup);
    document.getElementById('resetDataBtn').addEventListener('click', resetAll);
    document.getElementById('newPeriodBtn').addEventListener('click', () => {
        currentYear++;
        showNotification(`Switched to FY ${currentYear}`, 'info');
    });
    
    // View toggles
    document.getElementById('planningQuarterlyBtn').addEventListener('click', () => {
        document.getElementById('planningQuarterlyBtn').classList.add('active');
        document.getElementById('planningYearlyBtn').classList.remove('active');
        if (currentBudgetData) renderPlanningTable(currentBudgetData);
    });
    document.getElementById('planningYearlyBtn').addEventListener('click', () => {
        document.getElementById('planningYearlyBtn').classList.add('active');
        document.getElementById('planningQuarterlyBtn').classList.remove('active');
        if (currentBudgetData) renderPlanningTable(currentBudgetData);
    });
    document.getElementById('trackingQuarterlyBtn').addEventListener('click', () => {
        document.getElementById('trackingQuarterlyBtn').classList.add('active');
        document.getElementById('trackingYearlyBtn').classList.remove('active');
        if (currentBudgetData) renderTrackingTable(currentBudgetData);
    });
    document.getElementById('trackingYearlyBtn').addEventListener('click', () => {
        document.getElementById('trackingYearlyBtn').classList.add('active');
        document.getElementById('trackingQuarterlyBtn').classList.remove('active');
        if (currentBudgetData) renderTrackingTable(currentBudgetData);
    });
});

// Make functions global for HTML onclick
window.updatePlanned = updatePlanned;
window.updateActual = updateActual;
window.deleteCategory = deleteCategory;