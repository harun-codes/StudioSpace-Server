import express from 'express'
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'
const app = express();
const PORT = 5000

app.use(cors())
app.use(express.json())

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
const mongoClient = await connectToMongoDB();
const db = mongoClient.db("StudioSpace");
const studiosCollection = db.collection("studios");

app.get("/studios", async (req, res) => {
  try {
    const result = await studiosCollection.find({}).toArray();

    res.status(200).json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch studios"
    });
  }
});


app.get('/', (req,res) => {
    res.send('Server is Running Fine')
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})