require('dotenv').config();
console.log("DEBUG: All Env Keys:", Object.keys(process.env).filter(k => k.includes('MONGO')));
const express = require('express');
const connectDB = require('./config/db');
const repoRoutes = require('./routes/repoRoutes');

const app = express();

connectDB();

app.use(express.json());

app.use('/api/repos', repoRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));