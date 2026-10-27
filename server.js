const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
}));

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ success: true, message: "EcoShopify Backend is running successfully! 🚀" });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});