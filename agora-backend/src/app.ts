import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/salud', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

export default app;
