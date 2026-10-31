import express from 'express'
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'
const app = express();
const PORT = 5000


const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient =  await connectToMongoDB();
const db = mongoClient.db("StudioSpace");
const stuioCollection = db.collection("studios")

app.get('/', (req,res) => {
    res.send('Server is Running Fine')
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})