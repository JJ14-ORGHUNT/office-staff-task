const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Office Staff Task Management API' });
});

// Staff route
app.get('/staff', (req, res) => {
  res.json({
    message: 'Staff Management',
    staff: [
      { id: 1, name: 'John Doe', position: 'Manager' },
      { id: 2, name: 'Jane Smith', position: 'Developer' },
      { id: 3, name: 'Bob Johnson', position: 'Designer' }
    ]
  });
});

app.post('/staff', (req, res) => {
  const { name, position } = req.body;
  res.json({ message: 'Staff member added', staff: { name, position } });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Staff endpoint: http://localhost:${PORT}/staff`);
});

module.exports = app;
