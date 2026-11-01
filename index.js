import express from 'express'
import { MongoClient, ObjectId } from 'mongodb';
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

app.get("/featured-studios", async (req, res) => {
  try {
    const result = await studiosCollection
      .find({ isActive: { $ne: false } })
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch featured studios",
    });
  }
});

app.get("/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(id),
      isActive: { $ne: false },
    });

    res.status(200).json(studio);

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch studio details",
    });
  }
});



app.post("/add-studios", async (req, res) => {
  try {
    const studioData = req.body;  
    const result = await studiosCollection.insertOne(studioData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create studio",
    });
  }
});


app.get("/my-listings", async (req, res) => {
  try {
    const { ownerEmail } = req.query;

    if (!ownerEmail || typeof ownerEmail !== "string") {
      return res.status(400).json({
        message: "Owner email is required",
      });
    }

    const studios = await studiosCollection
      .find({ ownerEmail })
      .toArray();

    res.status(200).json(studios);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch studio listings",
    });
  }
});



app.patch('/my-listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const result = await studiosCollection.updateOne(
        {
            _id: new ObjectId(id)
        },
        { $set: updatedData }
    )
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to update studio listing",
    });
  }
})


app.delete('/my-listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete studio listing",
    });
  }
})



app.get('/', (req,res) => {
    res.send('Server is Running Fine')
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})