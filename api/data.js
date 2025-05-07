const express = require('express');
const app = express();

let cachedData = null;

// Function to get data
async function getData() {
    if (cachedData) return cachedData;
    await performScraping();
    return cachedData;
}

// Export the API handler
module.exports = async (req, res) => {
    try {
        const data = await getData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
};