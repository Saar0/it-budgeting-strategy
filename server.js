require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 }
});

// Initialize AI
let genAI;
try {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('✅ Gemini AI initialized');
  } else {
    console.log('⚠️ No valid Gemini API key found, using mock responses');
  }
} catch (error) {
  console.log('⚠️ AI initialization failed, using mock responses');
}

// Database connection
let db;
async function getDb() {
  if (!db) {
    db = await open({
      filename: path.join(__dirname, 'database', 'budget.db'),
      driver: sqlite3.Database
    });
  }
  return db;
}

// ==================== API ENDPOINTS ====================

// 1. Upload Excel file
app.post('/api/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const parsedData = {
      categories: [],
      planned: [],
      actual: []
    };

    data.forEach(row => {
      const category = row.Category || row.category;
      if (category) {
        parsedData.categories.push(category);
        parsedData.planned.push({
          q1: parseFloat(row.Q1_Planned || row.q1_planned || row.Q1 || 0),
          q2: parseFloat(row.Q2_Planned || row.q2_planned || row.Q2 || 0),
          q3: parseFloat(row.Q3_Planned || row.q3_planned || row.Q3 || 0),
          q4: parseFloat(row.Q4_Planned || row.q4_planned || row.Q4 || 0),
          total: 0
        });
        parsedData.actual.push({
          q1: parseFloat(row.Q1_Actual || row.q1_actual || 0),
          q2: parseFloat(row.Q2_Actual || row.q2_actual || 0),
          q3: parseFloat(row.Q3_Actual || row.q3_actual || 0),
          q4: parseFloat(row.Q4_Actual || row.q4_actual || 0),
          total: 0
        });
        
        // Calculate totals
        parsedData.planned[parsedData.planned.length - 1].total = 
          parsedData.planned[parsedData.planned.length - 1].q1 +
          parsedData.planned[parsedData.planned.length - 1].q2 +
          parsedData.planned[parsedData.planned.length - 1].q3 +
          parsedData.planned[parsedData.planned.length - 1].q4;
          
        parsedData.actual[parsedData.actual.length - 1].total = 
          parsedData.actual[parsedData.actual.length - 1].q1 +
          parsedData.actual[parsedData.actual.length - 1].q2 +
          parsedData.actual[parsedData.actual.length - 1].q3 +
          parsedData.actual[parsedData.actual.length - 1].q4;
      }
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      data: parsedData,
      message: `Successfully parsed ${parsedData.categories.length} categories`
    });
  } catch (error) {
    console.error('Error parsing Excel:', error);
    res.status(500).json({ error: 'Failed to parse Excel file' });
  }
});

// 2. AI Analysis endpoint
app.post('/api/ai-analyze', async (req, res) => {
  try {
    const { budgetData, period } = req.body;
    
    // If AI is not available, return mock response
    if (!genAI) {
      return res.json({
        success: true,
        analysis: generateMockAnalysis(budgetData, period)
      });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `
      You are an expert IT budget analyst. Analyze this IT budget data and provide insights:
      
      Period: ${period}
      
      Budget Data:
      ${JSON.stringify(budgetData, null, 2)}
      
      Provide a detailed analysis in JSON format with these exact keys:
      - summary (string): Overall budget performance summary
      - topInsights (array): Top 3-5 insights with category, issue, and impact
      - recommendations (array): 3-5 actionable recommendations
      - risks (array): 2-3 risk areas to watch
      - forecast (object): Next quarter and next year predictions with insights
      
      Make the response professional, data-driven, and specific to IT budgeting.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Try to parse JSON from the response
    let analysis;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        analysis = generateMockAnalysis(budgetData, period);
      }
    } catch (e) {
      analysis = generateMockAnalysis(budgetData, period);
    }
    
    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('AI Analysis error:', error);
    // Fallback to mock response
    res.json({
      success: true,
      analysis: generateMockAnalysis(req.body.budgetData, req.body.period)
    });
  }
});

// Mock analysis generator
function generateMockAnalysis(budgetData, period) {
  const totalPlanned = budgetData?.reduce((sum, item) => sum + (item.planned?.total || 0), 0) || 1000000;
  const totalActual = budgetData?.reduce((sum, item) => sum + (item.actual?.total || 0), 0) || 950000;
  const variance = totalActual - totalPlanned;
  const variancePercent = ((variance / totalPlanned) * 100).toFixed(1);
  
  const overspending = budgetData?.filter(item => 
    (item.actual?.total || 0) > (item.planned?.total || 0)
  ) || [];
  
  const underspending = budgetData?.filter(item => 
    (item.actual?.total || 0) < (item.planned?.total || 0) * 0.8
  ) || [];
  
  return {
    summary: `Overall budget utilization at ${((totalActual/totalPlanned)*100).toFixed(1)}%. ${variance > 0 ? `Over budget by $${Math.abs(variance).toLocaleString()}` : `Under budget by $${Math.abs(variance).toLocaleString()}`}.`,
    topInsights: overspending.slice(0, 3).map(item => ({
      category: item.category,
      issue: `${item.category} is ${(((item.actual.total - item.planned.total) / item.planned.total) * 100).toFixed(1)}% over budget`,
      impact: `Excess spending of $${(item.actual.total - item.planned.total).toLocaleString()}`
    })),
    recommendations: [
      `Optimize ${overspending[0]?.category || 'IT'} spending by reviewing subscriptions and unused licenses`,
      'Implement auto-scaling for cloud resources to reduce costs by 15-20%',
      'Consider annual prepayment for software licenses to get 15-20% discount',
      'Audit all SaaS subscriptions for unused accounts and consolidate tools',
      'Negotiate with vendors for better rates based on volume discounts'
    ],
    risks: [
      'Cloud costs trending upward - implement cost alerts and monitoring',
      'Hardware refresh cycle approaching in 6 months - plan capital expenditure',
      'Software license true-up risk at year-end - prepare for potential overage costs'
    ],
    forecast: {
      nextQuarter: totalActual * 1.05,
      nextYear: totalActual * 1.08,
      insights: 'Expecting 5-8% increase due to inflation, cloud cost growth, and planned infrastructure upgrades. Consider increasing budget allocation for cloud services.'
    }
  };
}

// 3. Save budget to database
app.post('/api/save-budget', async (req, res) => {
  try {
    const { year, categories, planned, actual } = req.body;
    const db = await getDb();
    
    // Get or create period
    let period = await db.get('SELECT * FROM periods WHERE year = ?', year);
    if (!period) {
      const result = await db.run('INSERT INTO periods (year) VALUES (?)', year);
      period = { id: result.lastID, year };
    }
    
    // Delete existing items for this period
    await db.run('DELETE FROM budget_items WHERE period_id = ?', period.id);
    
    // Insert new budget items
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      let catRecord = await db.get('SELECT * FROM categories WHERE name = ?', category);
      if (!catRecord) {
        const result = await db.run('INSERT INTO categories (name) VALUES (?)', category);
        catRecord = { id: result.lastID };
      }
      
      await db.run(`
        INSERT INTO budget_items 
        (period_id, category_id, planned_q1, planned_q2, planned_q3, planned_q4, 
         actual_q1, actual_q2, actual_q3, actual_q4, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, 
        period.id, catRecord.id,
        planned[i]?.q1 || 0, planned[i]?.q2 || 0, planned[i]?.q3 || 0, planned[i]?.q4 || 0,
        actual[i]?.q1 || 0, actual[i]?.q2 || 0, actual[i]?.q3 || 0, actual[i]?.q4 || 0
      );
    }
    
    res.json({ success: true, message: 'Budget saved successfully' });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save budget' });
  }
});

// 4. Get budget data by year
app.get('/api/budget/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const db = await getDb();
    const period = await db.get('SELECT * FROM periods WHERE year = ?', year);
    
    if (!period) {
      return res.json({ categories: [], planned: [], actual: [] });
    }
    
    const items = await db.all(`
      SELECT 
        c.name as category,
        b.planned_q1, b.planned_q2, b.planned_q3, b.planned_q4,
        b.actual_q1, b.actual_q2, b.actual_q3, b.actual_q4
      FROM budget_items b
      JOIN categories c ON b.category_id = c.id
      WHERE b.period_id = ?
    `, period.id);
    
    const categories = items.map(i => i.category);
    const planned = items.map(i => ({
      q1: i.planned_q1, q2: i.planned_q2, q3: i.planned_q3, q4: i.planned_q4,
      total: i.planned_q1 + i.planned_q2 + i.planned_q3 + i.planned_q4
    }));
    const actual = items.map(i => ({
      q1: i.actual_q1, q2: i.actual_q2, q3: i.actual_q3, q4: i.actual_q4,
      total: i.actual_q1 + i.actual_q2 + i.actual_q3 + i.actual_q4
    }));
    
    res.json({ categories, planned, actual });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

// 5. Advanced forecasting
app.post('/api/forecast', async (req, res) => {
  try {
    const { historicalData, inflationRate = 3, years = 5 } = req.body;
    
    if (!historicalData || historicalData.length === 0) {
      return res.status(400).json({ error: 'No historical data provided' });
    }
    
    const forecasts = [];
    const lastYear = historicalData[historicalData.length - 1];
    
    // Calculate growth trend
    let totalGrowth = 0;
    for (let i = 1; i < historicalData.length; i++) {
      const growth = (historicalData[i].total - historicalData[i-1].total) / historicalData[i-1].total;
      totalGrowth += growth;
    }
    const avgGrowth = totalGrowth / (historicalData.length - 1);
    
    let current = lastYear.total;
    for (let i = 1; i <= years; i++) {
      const growthRate = (avgGrowth + (inflationRate / 100)) / 2;
      current = current * (1 + growthRate);
      
      forecasts.push({
        year: parseInt(lastYear.year) + i,
        total: current,
        quarterly: [
          current * 0.22, // Q1
          current * 0.24, // Q2
          current * 0.26, // Q3
          current * 0.28  // Q4
        ],
        confidence: Math.max(0.7, 0.95 - (i * 0.05))
      });
    }
    
    res.json({
      success: true,
      forecasts,
      methodology: 'Trend-based forecasting with inflation adjustment',
      confidence: 'High for next 2 years, moderate for years 3-5'
    });
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({ error: 'Forecast failed' });
  }
});

// 6. Get all periods
app.get('/api/periods', async (req, res) => {
  try {
    const db = await getDb();
    const periods = await db.all('SELECT * FROM periods ORDER BY year DESC');
    res.json(periods);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch periods' });
  }
});

// 7. Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    ai: !!genAI,
    timestamp: new Date().toISOString() 
  });
});

// Start server
async function startServer() {
  // Ensure database exists
  const dbPath = path.join(__dirname, 'database', 'budget.db');
  if (!fs.existsSync(dbPath)) {
    console.log('⚠️ Database not found. Run `npm run init-db` first!');
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 API Health: http://localhost:${PORT}/api/health`);
  });
}

startServer();